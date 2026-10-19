import Decimal from 'decimal.js';
import type { Money } from '@/lib/domain/types';
export type BalancePayment={amount:Money;voided?:boolean;voidedAt?:string|null;voided_at?:string|null};
export function invoiceBalance(invoice:{total:Money},payments:readonly BalancePayment[]):Money{
  return new Decimal(invoice.total).sub(payments.filter(p=>!p.voided&&!p.voidedAt&&!p.voided_at).reduce((sum,p)=>sum.add(p.amount),new Decimal(0))).toFixed(2);
}
export function invoicePaymentStatus(invoice:{status:string;total:Money},payments:readonly BalancePayment[]):'draft'|'void'|'paid'|'partial'|'unpaid'{
  if(invoice.status==='void'||invoice.status==='draft')return invoice.status;
  const balance=new Decimal(invoiceBalance(invoice,payments));
  return balance.lte(0)?'paid':balance.lt(invoice.total)?'partial':'unpaid';
}
