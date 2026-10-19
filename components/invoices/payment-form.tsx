'use client';
import { useActionState } from 'react';
import { recordPaymentAction,voidPaymentAction } from '@/app/(ems)/invoices/actions';
import { CommandFields,FormFeedback,TextArea } from '@/components/clients/client-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { FormState } from '@/lib/clients/schemas';
import { money } from '@/lib/domain/format';
export function PaymentForm({invoiceId,version,balance,today,commandKey}:{invoiceId:string;version:number;balance:string;today:string;commandKey:string}){
  const [state,action,pending]=useActionState(recordPaymentAction,{} as FormState);const errors=state.result&&!state.result.ok?state.result.error.fields:undefined;const value=(key:string,fallback='')=>state.values?.[key]??fallback;
  return <form onReset={event => event.preventDefault()} action={action} className="panel"><h2>Record received payment</h2><p className="field-hint">Record money already received. Outstanding: {money(balance)} AUD.</p><CommandFields version={version} commandKey={commandKey}/><input type="hidden" name="invoiceId" value={invoiceId}/><FormFeedback state={state}/><div className="form-grid"><Field name="amount" label="Received amount · AUD" required inputMode="decimal" defaultValue={value('amount',balance)} error={errors?.amount}/><Field name="receivedOn" label="Received date · Sydney" type="date" required max={today} defaultValue={value('receivedOn',today)} error={errors?.receivedOn}/><div className="field"><label htmlFor="payment-method">Payment method</label><select id="payment-method" name="method" defaultValue={value('method','bank_transfer')}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="card">Card (already received)</option><option value="other">Other</option></select></div><Field name="reference" label="Receipt / bank reference" maxLength={500} defaultValue={value('reference')} error={errors?.reference}/><TextArea name="notes" label="Payment notes" value={value('notes')} error={errors?.notes}/></div><div className="form-actions"><Button type="submit" loading={pending}>Record received payment</Button></div></form>;
}
export function VoidPaymentForm({paymentId,invoiceId,version,commandKey}:{paymentId:string;invoiceId:string;version:number;commandKey:string}){
  const [state,action,pending]=useActionState(voidPaymentAction,{} as FormState);return <form onReset={event => event.preventDefault()} action={action}><CommandFields id={paymentId} version={version} commandKey={commandKey}/><input type="hidden" name="invoiceId" value={invoiceId}/><FormFeedback state={state}/><label style={{display:'block',marginBottom:8}}><input type="checkbox" required/> Confirm cancelling this receipt entry</label><Button type="submit" variant="secondary" loading={pending}>Void payment record</Button></form>;
}
