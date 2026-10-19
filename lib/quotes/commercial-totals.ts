import Decimal from 'decimal.js'
import { ValidationError } from '@/lib/calculator'
import { parsePublicLineMoney } from '@/lib/public-line-money'
import type { CommercialTotals, PublicLineDraft } from './types'

export type { CommercialTotals } from './types'

const MAX_MONEY = new Decimal('99999999.99')

function money(value: Decimal): string {
  if (!value.isFinite() || value.abs().gt(MAX_MONEY)) throw new ValidationError('Commercial amount is out of range')
  return value.isZero() ? '0.00' : value.toFixed(2, Decimal.ROUND_HALF_UP)
}

export function calculateCommercialTotals(lines: readonly PublicLineDraft[]): CommercialTotals {
  let subtotal = new Decimal(0)
  let taxableSubtotal = new Decimal(0)
  const lineTotals: CommercialTotals['lineTotals'] = []

  for (const line of lines) {
    if (line.kind !== 'line_item' || !line.clientVisible || (line.optional && !line.selected)) continue
    const price = parsePublicLineMoney(line.unitPrice)
    const quantity = parsePublicLineMoney(line.quantity)
    if (!price.ok || !quantity.ok || quantity.value.isNegative()
      || price.value.decimalPlaces() > 2 || quantity.value.decimalPlaces() > 2) {
      throw new ValidationError(`Invalid public line amount: ${line.id}`)
    }
    // Fix each extended line to cents before tax so printed rows reconcile to the document.
    const extended = price.value.mul(quantity.value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    lineTotals.push({ id: line.id, subtotal: money(extended) })
    subtotal = subtotal.add(extended)
    if (line.taxable) taxableSubtotal = taxableSubtotal.add(extended)
  }

  const gst = taxableSubtotal.mul('0.10').toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  return { currency: 'AUD', subtotal: money(subtotal), taxableSubtotal: money(taxableSubtotal),
    gst: money(gst), total: money(subtotal.add(gst)), lineTotals }
}
