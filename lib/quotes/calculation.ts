import Decimal from 'decimal.js'
import { calculateAllFormulas, calculateFinal, calculateSubtotal, DEFAULT_PRICING_SETTINGS, ValidationError, type PricingSettings } from '@/lib/calculator'
import { calculateMainQuoteTotals } from '@/lib/quote-calculation-totals'
import { calculateDisplayLabourTotals, calculateFormulaLabourDays } from '@/lib/quote-labour'
import { calculatePaintComparison, getMaterialLogicalKey } from '@/lib/quote-paint-comparison'
import { calculateQuoteOptionTotals } from './options'
import type { DecimalJSON, MaterialItem, QuoteCalculationInput, QuoteCalculationSnapshot } from './types'

export type { QuoteCalculationInput, QuoteCalculationSnapshot } from './types'
export const QUOTE_ENGINE_VERSION = 'f4c97d5b1ae971150294f9b1b1e798c47cb2daa3'
const NUMBER_FIELDS = ['marketPrice', 'actualPrice', 'quantity', 'workingDays', 'labourPerDay'] as const

function checkedNumber(value: string, field: string): void {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value) || new Decimal(value).gt('99999999.99')) {
    throw new ValidationError(`Invalid stored quote number: ${field}`)
  }
}

function validateMaterials(materials: MaterialItem[]): void {
  for (const item of materials) {
    for (const field of NUMBER_FIELDS) {
      // Old saved rows can lack row labour; the original server then uses header labour.
      if ((field === 'workingDays' || field === 'labourPerDay') && item[field] == null) continue
      checkedNumber(item[field], `${item.id}.${field}`)
    }
    if (item.areaScope !== undefined && !['interior', 'exterior', 'roof'].includes(item.areaScope)) {
      throw new ValidationError(`Invalid area scope: ${item.id}`)
    }
  }
}

function validateActivePaintComparison(input: QuoteCalculationInput): void {
  const activeKeys = new Set(input.materials
    .filter((item) => item.areaScope === 'interior' && item.timberRole === 'finish')
    .map(getMaterialLogicalKey))
  for (const alternative of input.paintComparison?.alternatives ?? []) {
    if (!activeKeys.has(alternative.targetLogicalKey) || !alternative.product?.productId) continue
    checkedNumber(alternative.product.marketPrice, `${alternative.targetLogicalKey}.aqua.marketPrice`)
    checkedNumber(alternative.product.actualPrice, `${alternative.targetLogicalKey}.aqua.actualPrice`)
    for (const field of ['quantity', 'workingDays', 'labourPerDay'] as const) {
      if (alternative[field].mode === 'override') checkedNumber(alternative[field].value, `${alternative.targetLogicalKey}.aqua.${field}`)
    }
  }
}

function validateSelection(min: number, max: number): void {
  if (![1, 2, 3, 4, 5].includes(min) || ![1, 2, 3, 4, 5].includes(max)) throw new ValidationError('Invalid formula selection')
}

function pricingSettings(settings: PricingSettings | null | undefined): PricingSettings {
  const normalized = { ...DEFAULT_PRICING_SETTINGS }
  for (const key of Object.keys(normalized) as (keyof PricingSettings)[]) {
    const value = settings?.[key] ?? DEFAULT_PRICING_SETTINGS[key]
    let decimal: Decimal
    try { decimal = new Decimal(value) } catch { throw new ValidationError(`Invalid pricing setting: ${key}`) }
    if (!decimal.isFinite() || decimal.isNegative() || decimal.gt('99999999.99') || (key.endsWith('Margin') && decimal.gte(1))) {
      throw new ValidationError(`Invalid pricing setting: ${key}`)
    }
    normalized[key] = decimal
  }
  return normalized
}

function serialize<T>(value: T, key = ''): DecimalJSON<T> {
  if (value instanceof Decimal) {
    if (!value.isFinite()) throw new ValidationError('Calculation did not produce a finite number')
    const monetary = /subtotal|total$|^materialMarket$|^materialActual$/i.test(key)
    if (monetary && value.abs().gt('99999999.99')) throw new ValidationError('Calculated quote amount is out of range')
    return (monetary ? value.toFixed(2, Decimal.ROUND_HALF_UP) : value.toString()) as DecimalJSON<T>
  }
  if (Array.isArray(value)) return value.map((entry) => serialize(entry)) as DecimalJSON<T>
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, serialize(entry, field)])) as DecimalJSON<T>
  }
  return value as DecimalJSON<T>
}

export function calculateQuoteSnapshot(input: QuoteCalculationInput, settings?: PricingSettings | null): QuoteCalculationSnapshot {
  validateSelection(input.selectedMin, input.selectedMax)
  for (const selection of Object.values(input.areaFormulaSelections ?? {})) validateSelection(selection.selectedMin, selection.selectedMax)
  validateMaterials(input.materials)
  validateActivePaintComparison(input)
  if (input.workingDays !== undefined) checkedNumber(input.workingDays, 'workingDays')
  if (input.labourPerDay !== undefined) checkedNumber(input.labourPerDay, 'labourPerDay')
  const ids = new Set<string>()
  for (const option of input.options ?? []) {
    if (ids.has(option.id) || ['__proto__', 'constructor', 'prototype'].includes(option.id)) throw new ValidationError('Invalid or duplicate option id')
    ids.add(option.id)
    validateSelection(option.selectedMin, option.selectedMax)
    validateMaterials(option.materials)
  }
  const normalizedSettings = pricingSettings(settings)
  const main = calculateMainQuoteTotals({ ...input, settings: normalizedSettings })
  const hasAssigned = input.materials.some((item) => item.areaScope !== undefined)
  if (hasAssigned) {
    main.subtotal = main.areaBreakdown.finalSubtotal
    main.finalTotal = main.areaBreakdown.finalTotal
  } else {
    const labourDays = calculateFormulaLabourDays(input.workingDays ?? '0', input.labourPerDay ?? '0', input.materials)
    main.results = calculateAllFormulas({ workingDays: labourDays, labourPerDay: 1, materialMarket: main.materialMarket, materialActual: main.materialActual }, normalizedSettings)
    main.subtotal = calculateSubtotal(main.results, input.selectedMin, input.selectedMax)
    main.finalTotal = calculateFinal(main.subtotal)
    main.materialLabour = calculateDisplayLabourTotals(input.workingDays ?? '0', input.labourPerDay ?? '0', input.materials)
    main.totalWorkingDays = main.materialLabour.workingDays
    main.totalLabourPerDay = main.materialLabour.labourDays
    main.totalLabourDays = main.materialLabour.labourDays
    main.subtotalLabour = Decimal.max(main.subtotal.sub(main.materialMarket), 0)
  }
  const options = calculateQuoteOptionTotals(input.options ?? [], normalizedSettings)
  const warnings: QuoteCalculationSnapshot['warnings'] = []
  if (main.areaBreakdown.unassigned.count) warnings.push({ code: 'unassigned_materials', count: main.areaBreakdown.unassigned.count, optionId: null })
  for (const [optionId, totals] of Object.entries(options)) {
    if (totals.areaBreakdown.unassigned.count) warnings.push({ code: 'unassigned_materials', count: totals.areaBreakdown.unassigned.count, optionId })
  }
  return {
    version: 1, engineVersion: QUOTE_ENGINE_VERSION, currency: 'AUD',
    input: JSON.parse(JSON.stringify(input)) as QuoteCalculationInput,
    settings: Object.fromEntries(Object.entries(normalizedSettings).map(([key, value]) => [key, new Decimal(value).toString()])) as QuoteCalculationSnapshot['settings'],
    main: { ...serialize(main), labour: serialize(main.materialLabour) }, options: serialize(options),
    paintComparison: input.paintComparison ? serialize(calculatePaintComparison({ ...input, comparison: input.paintComparison, settings: normalizedSettings })) : null,
    warnings,
  }
}
