import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/lib/calculator'
import { calculateCommercialTotals } from '@/lib/quotes/commercial-totals'
import type { PublicLineDraft } from '@/lib/quotes/types'

const line = (overrides: Partial<PublicLineDraft> = {}): PublicLineDraft => ({
  id: 'line', kind: 'line_item', name: 'Sample service', description: '', quantity: '1',
  unitPrice: '100', taxable: true, clientVisible: true, ...overrides,
})

describe('customer commercial totals', () => {
  it('excludes text, hidden and unselected optional lines, preserving signed selected options', () => {
    const totals = calculateCommercialTotals([line(), line({ id: 'text', kind: 'text', unitPrice: 'not money' }), line({ id: 'hidden', clientVisible: false }), line({ id: 'optional', optional: true, selected: false }), line({ id: 'discount', optional: true, selected: true, unitPrice: '-20' }), line({ id: 'exempt', taxable: false, unitPrice: '5' })])
    expect(totals).toEqual({ currency: 'AUD', subtotal: '85.00', taxableSubtotal: '80.00', gst: '8.00', total: '93.00', lineTotals: [{ id: 'line', subtotal: '100.00' }, { id: 'discount', subtotal: '-20.00' }, { id: 'exempt', subtotal: '5.00' }] })
  })
  it('rounds extended lines to cents, then sums taxable lines, then rounds GST', () => {
    const totals = calculateCommercialTotals([line({ id: 'a', quantity: '0.5', unitPrice: '0.01' }), line({ id: 'b', quantity: '0.5', unitPrice: '0.01' }), line({ id: 'c', quantity: '0.5', unitPrice: '0.01' })])
    expect(totals.subtotal).toBe('0.03')
    expect(totals.gst).toBe('0.00')
    expect(totals.total).toBe('0.03')
  })
  it('keeps a negative optional subtotal and its negative tax', () => {
    const totals = calculateCommercialTotals([line({ optional: true, selected: true, unitPrice: '-10.05' })])
    expect(totals.subtotal).toBe('-10.05'); expect(totals.gst).toBe('-1.01'); expect(totals.total).toBe('-11.06')
  })
  it('uses Decimal for repeated fractional amounts', () => {
    expect(calculateCommercialTotals([line({ unitPrice: '0.10', quantity: '3' })]).total).toBe('0.33')
  })
  it('returns a complete zero result for an empty document', () => {
    expect(calculateCommercialTotals([])).toEqual({ currency: 'AUD', subtotal: '0.00', taxableSubtotal: '0.00', gst: '0.00', total: '0.00', lineTotals: [] })
  })
  it.each(['NaN', 'Infinity', '', '100000000', '1e2', '0.001'])('rejects invalid unit price %s', (unitPrice) => {
    expect(() => calculateCommercialTotals([line({ unitPrice })])).toThrow(ValidationError)
  })
  it.each(['-1', 'NaN', 'Infinity', '', '100000000'])('rejects invalid quantity %s', (quantity) => {
    expect(() => calculateCommercialTotals([line({ quantity })])).toThrow(ValidationError)
  })
  it('rejects extended line and aggregate overflow', () => {
    expect(() => calculateCommercialTotals([line({ quantity: '2', unitPrice: '99999999.99' })])).toThrow(ValidationError)
    expect(() => calculateCommercialTotals([line({ id: 'a', unitPrice: '50000000' }), line({ id: 'b', unitPrice: '50000000' })])).toThrow(ValidationError)
  })
})
