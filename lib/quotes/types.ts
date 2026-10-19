import type Decimal from 'decimal.js'
import type { PaintComparison, PaintComparisonWritePolicy, TimberRole } from '@/lib/paint-comparison-types'
import type { PricingSettings } from '@/lib/calculator'
import type { MainQuoteTotals } from '@/lib/quote-calculation-totals'
import type { QuoteOptionTotals } from '@/lib/quotes/options'
import type { PaintComparisonCalculation } from '@/lib/quote-paint-comparison'

export type FormulaNumber = 1 | 2 | 3 | 4 | 5
export type AreaScope = 'interior' | 'exterior' | 'roof'
export type PublicLineKind = 'line_item' | 'text'

export interface FormulaSelection {
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
}

export interface AreaFormulaSelections {
  interior: FormulaSelection
  exterior: FormulaSelection
  roof: FormulaSelection
}

export interface PublicLineDraft {
  id: string
  kind: PublicLineKind
  name: string
  description: string
  quantity: string
  unitPrice: string
  taxable: boolean
  clientVisible: boolean
  optional?: boolean | null
  recommended?: boolean | null
  selected?: boolean | null
  optionalWritePolicy?: PaintComparisonWritePolicy
  recommendedWritePolicy?: PaintComparisonWritePolicy
  paintComparisonKey?: string
}

export interface MaterialItem {
  id: string
  logicalKey?: string
  timberRole?: TimberRole
  productId?: string
  name: string
  manufacturer?: string | null
  type?: string | null
  unit?: string
  category?: string | null
  productLine?: string | null
  base?: string | null
  sheen?: string | null
  volumeLitres?: string | null
  productCode?: string | null
  memo?: string
  marketPrice: string
  actualPrice: string
  quantity: string
  workingDays: string
  labourPerDay: string
  areaId?: string
  areaName?: string
  areaScope?: AreaScope
  isCustom: boolean
}

export interface QuoteOptionItem {
  id: string
  title: string
  materials: MaterialItem[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  isExpanded: boolean
}

export interface QuoteMemoItem {
  id: string
  body: string
}

/** Serializable form of the original Decimal engine output. */
export type DecimalJSON<T> = T extends Decimal ? string
  : T extends readonly (infer U)[] ? DecimalJSON<U>[]
  : T extends object ? { [K in keyof T]: DecimalJSON<T[K]> } : T

export interface QuoteCalculationInput {
  materials: MaterialItem[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  areaFormulaSelections?: AreaFormulaSelections
  workingDays?: string
  labourPerDay?: string
  options?: QuoteOptionItem[]
  paintComparison?: PaintComparison
}

export interface QuoteCalculationWarning {
  code: 'unassigned_materials'
  count: number
  optionId: string | null
}

export interface QuoteCalculationSnapshot {
  version: 1
  engineVersion: string
  currency: 'AUD'
  input: QuoteCalculationInput
  settings: { [K in keyof PricingSettings]: string }
  main: DecimalJSON<MainQuoteTotals> & { labour: DecimalJSON<MainQuoteTotals['materialLabour']> }
  options: Record<string, DecimalJSON<QuoteOptionTotals>>
  paintComparison: DecimalJSON<PaintComparisonCalculation> | null
  warnings: QuoteCalculationWarning[]
}

export interface CommercialTotals {
  currency: 'AUD'
  subtotal: string
  taxableSubtotal: string
  gst: string
  total: string
  lineTotals: { id: string; subtotal: string }[]
}
