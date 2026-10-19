'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createInvoiceFromJob,saveDirectInvoice,saveInvoice,issueInvoice,voidInvoice,recordPayment,voidPayment } from '@/lib/invoices/service';
import type { FormState } from '@/lib/clients/schemas';
const values=(f:FormData)=>Object.fromEntries([...f.entries()].filter((e):e is [string,string]=>typeof e[1]==='string'));
const meta=(f:FormData)=>({expectedVersion:Number(f.get('expectedVersion')),idempotencyKey:f.get('idempotencyKey')});
export async function saveDirectInvoiceAction(_p:FormState,f:FormData):Promise<FormState>{
  let publicLines:unknown;try{publicLines=JSON.parse(String(f.get('publicLines')));}catch{return {values:values(f),result:{ok:false,error:{code:'VALIDATION',message:'Check the invoice lines.',fields:{publicLines:'The invoice rows could not be read.'}}}};}
  const result=await saveDirectInvoice({id:f.get('id')||undefined,clientId:f.get('clientId'),propertyId:f.get('propertyId')||null,title:f.get('title'),issuedOn:f.get('issuedOn'),dueOn:f.get('dueOn'),terms:f.get('terms'),publicLines},meta(f));
  if(!result.ok)return {result,values:values(f)};revalidatePath('/invoices');redirect(`/invoices/${result.data.id}?saved=direct`);
}
export async function createInvoiceAction(_p:FormState,f:FormData):Promise<FormState>{
  const result=await createInvoiceFromJob(f.get('jobId'),meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/invoices');redirect(`/invoices/${result.data.id}?saved=created`);
}
export async function saveInvoiceAction(_p:FormState,f:FormData):Promise<FormState>{
  const result=await saveInvoice({id:f.get('id'),issuedOn:f.get('issuedOn'),dueOn:f.get('dueOn')},meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/invoices');redirect(`/invoices/${result.data.id}?saved=dates`);
}
export async function issueInvoiceAction(_p:FormState,f:FormData):Promise<FormState>{
  const result=await issueInvoice(f.get('id'),meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/invoices');redirect(`/invoices/${result.data.id}?saved=issued`);
}
export async function voidInvoiceAction(_p:FormState,f:FormData):Promise<FormState>{
  const result=await voidInvoice(f.get('id'),meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/invoices');redirect(`/invoices/${result.data.id}?saved=void`);
}
export async function recordPaymentAction(_p:FormState,f:FormData):Promise<FormState>{
  const result=await recordPayment({invoiceId:f.get('invoiceId'),amount:f.get('amount'),receivedOn:f.get('receivedOn'),method:f.get('method'),reference:f.get('reference'),notes:f.get('notes')},meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/invoices');redirect(`/invoices/${String(f.get('invoiceId'))}?saved=payment`);
}
export async function voidPaymentAction(_p:FormState,f:FormData):Promise<FormState>{
  const result=await voidPayment(f.get('id'),meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/invoices');redirect(`/invoices/${String(f.get('invoiceId'))}?saved=payment-void`);
}
