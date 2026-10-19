import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_SETTINGS, ValidationError } from '@/lib/calculator'
import { calculateQuoteSnapshot } from '@/lib/quotes/calculation'
import { calculateQuoteOptionTotals } from '@/lib/quotes/options'
import type { MaterialItem, QuoteCalculationInput } from '@/lib/quotes/types'
import { DULUX_PAINT_PRODUCTS, DULUX_SEED_METADATA } from '@/lib/products/dulux-paints'

const row = (overrides: Partial<MaterialItem> = {}): MaterialItem => ({
  id: 'sample-row', name: 'Sample material', marketPrice: '100', actualPrice: '80',
  quantity: '1', workingDays: '2', labourPerDay: '1', isCustom: true, ...overrides,
})
const input = (materials: MaterialItem[]): QuoteCalculationInput => ({ materials, selectedMin: 1, selectedMax: 1 })

function aquaInput(): QuoteCalculationInput {
  return { ...input([row({ id: 'source', logicalKey: 'finish', timberRole: 'finish', productId: 'super', areaScope: 'interior',
    marketPrice: '0', actualPrice: '0', quantity: '0.01', workingDays: '0', labourPerDay: '0' })]),
  paintComparison: { version: 1, key: 'sample-aqua', alternatives: [{
    targetLogicalKey: 'finish', previousRole: 'finish', acknowledgedSourceProductId: 'super',
    product: { productId: 'aqua', name: 'Sample Aqua', marketPrice: '0', actualPrice: '0' },
    quantity: { mode: 'inherit', value: '0.01' }, workingDays: { mode: 'inherit', value: '0' }, labourPerDay: { mode: 'inherit', value: '0' },
  }] } }
}

const aquaFields = ['marketPrice', 'actualPrice', 'quantity', 'workingDays', 'labourPerDay'] as const
function setAquaNumber(draft: QuoteCalculationInput, field: typeof aquaFields[number], value: string) {
  const alternative = draft.paintComparison!.alternatives[0]
  if (field === 'marketPrice' || field === 'actualPrice') alternative.product![field] = value
  else alternative[field] = { mode: 'override', value }
}

describe('EMS quote snapshot', () => {
  it('uses actual area totals and warns separately about unassigned materials', () => {
    const snapshot = calculateQuoteSnapshot(input([row({ areaScope: 'interior' }), row({ id: 'roof', areaScope: 'roof', workingDays: '1' }), row({ id: 'unassigned' })]))
    expect(snapshot.main.subtotal).toBe('1900.00')
    expect(snapshot.main.finalTotal).toBe('2090.00')
    expect(snapshot.main.areaBreakdown.finalSubtotal).toBe('1900.00')
    expect(snapshot.warnings).toContainEqual({ code: 'unassigned_materials', count: 1, optionId: null })
  })
  it('falls back to original server calculation for legacy rows without assigned areas', () => {
    const snapshot = calculateQuoteSnapshot(input([row()]))
    expect(snapshot.main.subtotal).toBe('1100.00')
    expect(snapshot.main.areaBreakdown.finalSubtotal).toBe('0.00')
  })
  it('uses legacy header labour only when every row lacks labour', () => {
    const legacy = row(); delete (legacy as Partial<MaterialItem>).workingDays; delete (legacy as Partial<MaterialItem>).labourPerDay
    const snapshot = calculateQuoteSnapshot({ ...input([legacy]), workingDays: '3', labourPerDay: '2' })
    expect(snapshot.main.subtotal).toBe('3100.00')
    expect(snapshot.main.labour.labourDays).toBe('6')
  })
  it('keeps row labour multiplication separate and settings/input immutable', () => {
    const draft = input([row({ workingDays: '2', labourPerDay: '3' }), row({ id: 'second', workingDays: '4', labourPerDay: '2' })])
    const settings = { ...DEFAULT_PRICING_SETTINGS }
    const snapshot = calculateQuoteSnapshot(draft, settings)
    expect(snapshot.main.labour.labourDays).toBe('14')
    expect(snapshot.main.subtotal).toBe('7200.00')
    draft.materials[0].actualPrice = '999'; settings.f1LabourRate = 999
    expect(snapshot.input.materials[0].actualPrice).toBe('80')
    expect(snapshot.settings.f1LabourRate).toBe('500')
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })
  it('keeps normal options separate from the main amount, using roof rates', () => {
    const options = [{ id: 'roof-option', title: 'Sample roof', materials: [row({ areaScope: 'roof' })], selectedMin: 1 as const, selectedMax: 1 as const, isExpanded: false }]
    expect(calculateQuoteOptionTotals(options, DEFAULT_PRICING_SETTINGS)['roof-option'].subtotal.toFixed(2)).toBe('1500.00')
    const snapshot = calculateQuoteSnapshot({ ...input([row()]), options })
    expect(snapshot.main.subtotal).toBe('1100.00')
    expect(snapshot.options['roof-option'].subtotal).toBe('1500.00')
  })
  it('returns zero totals for empty input', () => {
    const snapshot = calculateQuoteSnapshot(input([]))
    expect(snapshot.main.subtotal).toBe('0.00')
    expect(snapshot.main.finalTotal).toBe('0.00')
  })
  it('serializes signed Timber differences after the original full-quote rounding', () => {
    const source = row({ logicalKey: 'finish', timberRole: 'finish', productId: 'super', areaScope: 'interior' })
    const snapshot = calculateQuoteSnapshot({ ...input([source]), paintComparison: {
      version: 1, key: 'sample-comparison', alternatives: [{
        targetLogicalKey: 'finish', previousRole: 'finish', acknowledgedSourceProductId: 'super',
        product: { productId: 'aqua', name: 'Sample Aqua', marketPrice: '50', actualPrice: '40' },
        quantity: { mode: 'inherit', value: '1' }, workingDays: { mode: 'inherit', value: '2' },
        labourPerDay: { mode: 'inherit', value: '1' },
      }],
    } })
    expect(snapshot.paintComparison?.status).toBe('ready')
    expect(snapshot.paintComparison?.differenceSubtotal).toBe('-50.00')
    expect(snapshot.paintComparison?.aquaSubtotal).toBe('1050.00')
  })
  it.each(['NaN', 'Infinity', '-1', '100000000', '1e9', '', '0.001'])('rejects invalid stored material number %s', (value) => {
    expect(() => calculateQuoteSnapshot(input([row({ marketPrice: value })]))).toThrow(ValidationError)
  })
  it.each([NaN, Infinity, -1])('rejects invalid pricing setting %s', (value) => {
    expect(() => calculateQuoteSnapshot(input([row()]), { ...DEFAULT_PRICING_SETTINGS, f1LabourRate: value })).toThrow(ValidationError)
  })
  describe('active Aqua stored-number boundary', () => {
    it.each(aquaFields.flatMap((field) => ['100000000', '-1', 'NaN', 'Infinity', '', '0.001'].map((value) => [field, value] as const)))(
      'rejects active %s=%s even when multiplication produces a small or zero result', (field, value) => {
        const draft = aquaInput()
        setAquaNumber(draft, field, value)
        expect(() => calculateQuoteSnapshot(draft)).toThrow(ValidationError)
      })
    it.each(aquaFields)('accepts the stored upper boundary for active %s', (field) => {
      const draft = aquaInput()
      setAquaNumber(draft, field, '99999999.99')
      expect(calculateQuoteSnapshot(draft).paintComparison?.status).toBe('ready')
    })
    it('preserves dormant invalid alternatives and ignores unused inherit values', () => {
      const dormant = aquaInput()
      dormant.materials[0].timberRole = 'none'
      setAquaNumber(dormant, 'marketPrice', '100000000')
      setAquaNumber(dormant, 'quantity', 'NaN')
      expect(calculateQuoteSnapshot(dormant).input.paintComparison).toEqual(dormant.paintComparison)
      const inherited = aquaInput()
      inherited.paintComparison!.alternatives[0].quantity.value = '100000000'
      expect(calculateQuoteSnapshot(inherited).paintComparison?.status).toBe('ready')
    })
  })
  it('exports the original 102 products explicitly as historical local seed', () => {
    expect(DULUX_PAINT_PRODUCTS).toHaveLength(102)
    expect(DULUX_SEED_METADATA.currentPricesVerified).toBe(false)
    expect(DULUX_SEED_METADATA.sourceCommit).toBe('f4c97d5b1ae971150294f9b1b1e798c47cb2daa3')
  })
})
