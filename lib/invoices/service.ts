import 'server-only';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { withEmsTransaction,type EmsTx } from '@/lib/db/transaction';
import { requireAdmin } from '@/lib/auth/permissions';
import { clientMutation } from '@/lib/clients/service';
import type { Result,Versioned } from '@/lib/domain/types';
import type { CommercialSnapshot,CustomerSnapshot } from '@/lib/documents/types';
import { sydneyToday } from '@/lib/domain/format';
import { runCommand,recordActivity,requireVersion,WorkflowError } from '@/lib/workflows/commands';
import { calculateCommercialTotals } from '@/lib/quotes/commercial-totals';
import { customerSnapshot,commercialSnapshot } from '@/lib/quotes/snapshots';
import { invoiceSchema,directInvoiceSchema,paymentSchema,invoiceListSchema,commandMetaSchema,invalidResult } from './schemas';
import { invoiceBalance,invoicePaymentStatus } from './totals';
export type Payment=Versioned&{amount:string;receivedOn:string;method:string;reference:string|null;notes:string|null;voidedAt:string|null};
export type InvoiceSummary=Versioned&{number:string;title:string;status:string;clientId:string;propertyId:string|null;clientName:string;jobId:string|null;issuedOn:string|null;dueOn:string|null;subtotal:string;tax:string;total:string;balance:string;paid:string;paymentStatus:string;overdue:boolean};
export type InvoiceDetail=InvoiceSummary&{snapshot:CommercialSnapshot;customer:CustomerSnapshot;payments:Payment[]};
export type InvoiceTabKey=z.infer<typeof invoiceListSchema>['status'];
export type InvoicePipeline={
  draft:{count:number};
  outstanding:{count:number;amount:string};
  overdue:{count:number;amount:string};
};
const columns='i.id,i.version,i.number,i.title,i.status,i.client_id as "clientId",i.property_id as "propertyId",c.display_name as "clientName",i.job_id as "jobId",i.issued_on::text as "issuedOn",i.due_on::text as "dueOn",i.subtotal,i.tax,i.total';
const paymentTotalsJoin="left join lateral(select coalesce(sum(p.amount),0) paid from ems.payments p where p.invoice_id=i.id and p.organization_id=i.organization_id and p.voided_at is null) p on true";
const outstandingCondition="i.status='issued' and i.total-p.paid>0";
const invoiceTabConditions:Record<InvoiceTabKey,string>={
  all:'true',
  draft:"i.status='draft'",
  issued:"i.status='issued'",
  outstanding:outstandingCondition,
  overdue:`${outstandingCondition} and i.due_on<$4::date`,
  unpaid:"i.status='issued' and p.paid=0 and i.total>0",
  partial:"i.status='issued' and p.paid>0 and i.total-p.paid>0",
  paid:"i.status='issued' and i.total-p.paid<=0",
  void:"i.status='void'",
};
type LockedInvoice=Versioned&{status:string;total:string;issued_on:string|null;due_on:string|null};
async function lockInvoice(tx:EmsTx,id:string,version:number):Promise<LockedInvoice>{
  const [invoice]=await tx.query<LockedInvoice>('select id,version,status,total,issued_on::text,due_on::text from ems.invoices where id=$1 and organization_id=$2 for update',[id,tx.actor.organizationId]);
  if(!invoice)throw new WorkflowError('NOT_FOUND','Invoice not found.');requireVersion(invoice.version,version);return invoice;
}
async function paymentsFor(tx:EmsTx,id:string):Promise<Payment[]>{return tx.query<Payment>('select id,version,amount,received_on::text as "receivedOn",method,reference,notes,voided_at::text as "voidedAt" from ems.payments where invoice_id=$1 and organization_id=$2 order by received_on,created_at',[id,tx.actor.organizationId]);}
async function writeInvoiceLines(tx:EmsTx,id:string,snapshot:CommercialSnapshot){
  const totals=calculateCommercialTotals(snapshot.publicLines);
  for(const [position,line] of snapshot.publicLines.entries()){
    if(line.kind!=='line_item'||!line.clientVisible||(line.optional&&!line.selected))continue;
    await tx.query('insert into ems.invoice_lines(organization_id,invoice_id,position,name,description,quantity,unit_price,taxable,total) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tx.actor.organizationId,id,position,line.name,line.description,line.quantity,line.unitPrice,line.taxable,totals.lineTotals.find(l=>l.id===line.id)!.subtotal]);
  }
}
export async function saveDirectInvoice(input:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=directInvoiceSchema.safeParse(input);if(!p.success)return invalidResult(p.error);const c=commandMetaSchema.safeParse(meta);if(!c.success)return invalidResult(c.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'invoice.direct.save',c.data,d,async()=>{
    if(d.id){
      const invoice=await lockInvoice(tx,d.id,c.data.expectedVersion);if(invoice.status!=='draft')throw new WorkflowError('INVALID_STATUS','Issued invoice amounts and customer details are fixed.');
      const [linked]=await tx.query<{job_id:string|null}>('select job_id from ems.invoices where id=$1 and organization_id=$2',[d.id,tx.actor.organizationId]);if(linked.job_id)throw new WorkflowError('FIXED_CONTRACT','Job invoices retain the confirmed job contract.');
    }else requireVersion(0,c.data.expectedVersion);
    const snapshotInput={...d,workType:'Mixed' as const,calculation:{materials:[],selectedMin:3 as const,selectedMax:3 as const},internalMemo:'',refreshPricing:false};
    const customer=await customerSnapshot(tx,snapshotInput);const snapshot=await commercialSnapshot(tx,snapshotInput);const totals=calculateCommercialTotals(d.publicLines);
    if([totals.total,totals.subtotal,totals.gst].some(n=>new Decimal(n).isNegative()))throw new WorkflowError('INVALID_TOTAL','Invoice amounts and GST cannot be negative.');
    const values=[tx.actor.organizationId,d.clientId,d.propertyId??null,d.title,d.issuedOn,d.dueOn,JSON.stringify(snapshot),JSON.stringify(customer),totals.subtotal,totals.gst,totals.total];
    const [saved]=d.id?await tx.query<Versioned>('update ems.invoices set client_id=$2,property_id=$3,title=$4,issued_on=$5,due_on=$6,snapshot=$7::jsonb,customer_snapshot=$8::jsonb,subtotal=$9,tax=$10,total=$11,version=version+1 where organization_id=$1 and id=$12 returning id,version',[...values,d.id]):await tx.query<Versioned>('insert into ems.invoices(organization_id,client_id,property_id,title,issued_on,due_on,snapshot,customer_snapshot,subtotal,tax,total) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11) returning id,version',values);
    if(d.id)await tx.query('delete from ems.invoice_lines where invoice_id=$1 and organization_id=$2',[d.id,tx.actor.organizationId]);
    await writeInvoiceLines(tx,saved.id,snapshot);await recordActivity(tx,'invoice',saved.id,d.id?'updated':'created',{source:'direct'});return saved;
  }));
}
export async function createInvoiceFromJob(jobId:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=z.object({jobId:z.uuid(),meta:commandMetaSchema}).safeParse({jobId,meta});if(!p.success)return invalidResult(p.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'invoice.create',d.meta,{jobId:d.jobId},async()=>{
    const org=tx.actor.organizationId;
    const [job]=await tx.query<Versioned&{title:string;client_id:string;property_id:string|null;status:string}>('select id,version,title,client_id,property_id,status from ems.jobs where id=$1 and organization_id=$2 for update',[d.jobId,org]);
    if(!job)throw new WorkflowError('NOT_FOUND','Job not found.');requireVersion(job.version,d.meta.expectedVersion);
    if(job.status==='cancelled')throw new WorkflowError('INVALID_STATUS','A cancelled job cannot be invoiced.');
    if((await tx.query("select id from ems.invoices where job_id=$1 and organization_id=$2 and status<>'void'",[job.id,org])).length)throw new WorkflowError('ALREADY_INVOICED','This job already has a full invoice. Open it from the job details.');
    const [contract]=await tx.query<{snapshot:CommercialSnapshot;customer_snapshot:CustomerSnapshot;subtotal:string;tax:string;total:string}>('select snapshot,customer_snapshot,subtotal,tax,total from ems.job_contracts where job_id=$1 and organization_id=$2 for share',[job.id,org]);
    if(!contract)throw new WorkflowError('NO_CONTRACT','Confirm the job contract before invoicing.');
    const today=sydneyToday();const due=new Date(today+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+14);
    const [invoice]=await tx.query<Versioned>('insert into ems.invoices(organization_id,client_id,property_id,job_id,title,issued_on,due_on,snapshot,customer_snapshot,subtotal,tax,total) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12) returning id,version',[org,job.client_id,job.property_id,job.id,job.title,today,due.toISOString().slice(0,10),JSON.stringify(contract.snapshot),JSON.stringify(contract.customer_snapshot),contract.subtotal,contract.tax,contract.total]);
    await writeInvoiceLines(tx,invoice.id,contract.snapshot);
    await recordActivity(tx,'invoice',invoice.id,'created',{jobId:job.id});return invoice;
  }));
}
export async function saveInvoice(input:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=invoiceSchema.safeParse(input);if(!p.success)return invalidResult(p.error);const c=commandMetaSchema.safeParse(meta);if(!c.success)return invalidResult(c.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'invoice.save',c.data,d,async()=>{
    const invoice=await lockInvoice(tx,d.id,c.data.expectedVersion);if(invoice.status!=='draft')throw new WorkflowError('INVALID_STATUS','Only draft invoice dates can be edited.');
    const [saved]=await tx.query<Versioned>('update ems.invoices set issued_on=$1,due_on=$2,version=version+1 where id=$3 and organization_id=$4 returning id,version',[d.issuedOn,d.dueOn,d.id,tx.actor.organizationId]);await recordActivity(tx,'invoice',d.id,'updated');return saved;
  }));
}
export async function issueInvoice(id:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=z.object({id:z.uuid(),meta:commandMetaSchema}).safeParse({id,meta});if(!p.success)return invalidResult(p.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'invoice.issue',d.meta,{id:d.id},async()=>{
    const invoice=await lockInvoice(tx,d.id,d.meta.expectedVersion);if(invoice.status!=='draft')throw new WorkflowError('INVALID_STATUS','Only a draft invoice can be issued.');
    if(!invoice.issued_on||!invoice.due_on)throw new WorkflowError('DATES_REQUIRED','Set the invoice and due dates before issuing.');
    const [saved]=await tx.query<Versioned>("update ems.invoices set status='issued',issued_at=now(),version=version+1 where id=$1 and organization_id=$2 returning id,version",[d.id,tx.actor.organizationId]);await recordActivity(tx,'invoice',d.id,'issued');return saved;
  }));
}
export async function voidInvoice(id:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=z.object({id:z.uuid(),meta:commandMetaSchema}).safeParse({id,meta});if(!p.success)return invalidResult(p.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'invoice.void',d.meta,{id:d.id},async()=>{
    const invoice=await lockInvoice(tx,d.id,d.meta.expectedVersion);if(invoice.status==='void')throw new WorkflowError('INVALID_STATUS','This invoice is already void.');
    if((await paymentsFor(tx,d.id)).some(p=>!p.voidedAt))throw new WorkflowError('ACTIVE_PAYMENTS','Void recorded payments before voiding this invoice.');
    const [saved]=await tx.query<Versioned>("update ems.invoices set status='void',voided_at=now(),version=version+1 where id=$1 and organization_id=$2 returning id,version",[d.id,tx.actor.organizationId]);await recordActivity(tx,'invoice',d.id,'voided');return saved;
  }));
}
export async function recordPayment(input:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=paymentSchema.safeParse(input);if(!p.success)return invalidResult(p.error);const c=commandMetaSchema.safeParse(meta);if(!c.success)return invalidResult(c.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'payment.record',c.data,d,async()=>{
    const invoice=await lockInvoice(tx,d.invoiceId,c.data.expectedVersion);if(invoice.status!=='issued')throw new WorkflowError('INVALID_STATUS','Issue the invoice before recording a received payment.');
    if(d.receivedOn>sydneyToday())throw new WorkflowError('FUTURE_PAYMENT','Record the date the payment was actually received.');
    const balance=invoiceBalance(invoice,await paymentsFor(tx,d.invoiceId));if(new Decimal(d.amount).gt(balance))throw new WorkflowError('OVERPAYMENT','The received amount exceeds the remaining invoice balance.');
    const [payment]=await tx.query<Versioned>('insert into ems.payments(organization_id,invoice_id,amount,received_on,method,reference,notes) values($1,$2,$3,$4,$5,$6,$7) returning id,version',[tx.actor.organizationId,d.invoiceId,d.amount,d.receivedOn,d.method,d.reference,d.notes]);
    await tx.query('update ems.invoices set version=version+1 where id=$1 and organization_id=$2',[d.invoiceId,tx.actor.organizationId]);await recordActivity(tx,'invoice',d.invoiceId,'payment_recorded',{paymentId:payment.id,amount:d.amount});return payment;
  }));
}
export async function voidPayment(id:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=z.object({id:z.uuid(),meta:commandMetaSchema}).safeParse({id,meta});if(!p.success)return invalidResult(p.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'payment.void',d.meta,{id:d.id},async()=>{
    const [payment]=await tx.query<{invoice_id:string;voided_at:string|null}>('select invoice_id,voided_at::text from ems.payments where id=$1 and organization_id=$2',[d.id,tx.actor.organizationId]);if(!payment)throw new WorkflowError('NOT_FOUND','Payment not found.');
    const invoice=await lockInvoice(tx,payment.invoice_id,d.meta.expectedVersion);
    const [current]=await tx.query<{voided_at:string|null}>('select voided_at::text from ems.payments where id=$1 and organization_id=$2 for update',[d.id,tx.actor.organizationId]);
    if(invoice.status!=='issued'||current.voided_at)throw new WorkflowError('INVALID_STATUS','Only an active payment on an issued invoice can be voided.');
    const [saved]=await tx.query<Versioned>('update ems.payments set voided_at=now(),version=version+1 where id=$1 and organization_id=$2 returning id,version',[d.id,tx.actor.organizationId]);
    await tx.query('update ems.invoices set version=version+1 where id=$1 and organization_id=$2',[payment.invoice_id,tx.actor.organizationId]);await recordActivity(tx,'invoice',payment.invoice_id,'payment_voided',{paymentId:d.id});return saved;
  }));
}
function withBalance<T extends {status:string;total:string;dueOn:string|null}>(invoice:T,payments:Payment[]){
  const rawBalance=invoiceBalance(invoice,payments);const balance=invoice.status==='issued'?rawBalance:'0.00';const today=sydneyToday();return {...invoice,balance,paid:new Decimal(invoice.total).sub(rawBalance).toFixed(2),paymentStatus:invoicePaymentStatus(invoice,payments),overdue:invoice.status==='issued'&&new Decimal(balance).gt(0)&&!!invoice.dueOn&&invoice.dueOn<today};
}
export async function readInvoice(id:string):Promise<InvoiceDetail|null>{
  return withEmsTransaction(async tx=>{await requireAdmin(tx);if(!z.uuid().safeParse(id).success)return null;
    const [invoice]=await tx.query<Omit<InvoiceDetail,'payments'|'balance'|'paid'|'paymentStatus'|'overdue'>>(`select ${columns},i.snapshot,i.customer_snapshot as customer from ems.invoices i join ems.clients c on c.id=i.client_id and c.organization_id=i.organization_id where i.id=$1 and i.organization_id=$2`,[id,tx.actor.organizationId]);if(!invoice)return null;const payments=await paymentsFor(tx,id);return {...withBalance(invoice,payments),payments};
  });
}
export async function listInvoices(input:unknown={}){
  const p=invoiceListSchema.safeParse(input);const filter=p.success?p.data:invoiceListSchema.parse({});
  return withEmsTransaction(async tx=>{await requireAdmin(tx);
    const today=sydneyToday();
    const from=`from ems.invoices i join ems.clients c on c.id=i.client_id and c.organization_id=i.organization_id ${paymentTotalsJoin}`;
    const searchWhere="i.organization_id=$1 and ($2='' or i.title ilike '%'||$2||'%' or i.number ilike '%'||$2||'%' or c.display_name ilike '%'||$2||'%')";
    const statusWhere=Object.entries(invoiceTabConditions).map(([key,condition])=>`($3='${key}' and (${condition}))`).join(' or ');
    const where=`${searchWhere} and (${statusWhere})`;const values=[tx.actor.organizationId,filter.search,filter.status,today];
    const countColumns=Object.entries(invoiceTabConditions).map(([key,condition])=>`count(*) filter (where ${condition})::text as "${key}"`).join(',');
    const [count]=await tx.query<Record<InvoiceTabKey|'total',string>>(`select count(*) filter (where ${statusWhere})::text total,${countColumns} ${from} where ${searchWhere}`,values);
    const counts:Record<InvoiceTabKey,number>={all:Number(count.all),draft:Number(count.draft),issued:Number(count.issued),outstanding:Number(count.outstanding),overdue:Number(count.overdue),unpaid:Number(count.unpaid),partial:Number(count.partial),paid:Number(count.paid),void:Number(count.void)};
    const rows=await tx.query<Omit<InvoiceSummary,'paymentStatus'|'overdue'>>(`select ${columns},p.paid::text as paid,(case when i.status='issued' then i.total-p.paid else 0.00 end)::text as balance ${from} where ${where} order by i.updated_at desc,i.id limit 25 offset $5`,[...values,(filter.page-1)*25]);
    const items=rows.map(r=>({...r,paymentStatus:invoicePaymentStatus(r,[{amount:r.paid}]),overdue:r.status==='issued'&&new Decimal(r.balance).gt(0)&&!!r.dueOn&&r.dueOn<today}));return {items,total:Number(count.total),page:filter.page,pageSize:25,filter,counts};
  });
}
export async function readInvoicePipeline(tx:EmsTx,today:string):Promise<InvoicePipeline>{
  if(tx.actor.role!=='admin')throw new WorkflowError('FORBIDDEN','Administrator permission required.');
  const overdueCondition=`${outstandingCondition} and i.due_on<$2::date`;
  const [row]=await tx.query<{draft:string;outstanding:string;outstandingAmount:string;overdue:string;overdueAmount:string}>(`select
    count(*) filter (where i.status='draft')::text as draft,
    count(*) filter (where ${outstandingCondition})::text as outstanding,
    coalesce(sum(i.total-p.paid) filter (where ${outstandingCondition}),0)::text as "outstandingAmount",
    count(*) filter (where ${overdueCondition})::text as overdue,
    coalesce(sum(i.total-p.paid) filter (where ${overdueCondition}),0)::text as "overdueAmount"
    from ems.invoices i ${paymentTotalsJoin} where i.organization_id=$1`,[tx.actor.organizationId,today]);
  return {draft:{count:Number(row.draft)},outstanding:{count:Number(row.outstanding),amount:new Decimal(row.outstandingAmount).toFixed(2)},overdue:{count:Number(row.overdue),amount:new Decimal(row.overdueAmount).toFixed(2)}};
}
