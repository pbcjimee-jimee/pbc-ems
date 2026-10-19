import { z } from 'zod';
import { publicLineSchema } from '@/lib/quotes/schemas';
export { commandMetaSchema, invalidResult } from '@/lib/clients/schemas';
export const calendarDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;},'Enter a real calendar date.');
export const invoiceSchema=z.object({id:z.uuid(),issuedOn:calendarDate,dueOn:calendarDate}).strict().refine(v=>v.dueOn>=v.issuedOn,{path:['dueOn'],message:'Due date must be on or after the invoice date.'});
export const directInvoiceSchema=z.object({id:z.uuid().optional(),clientId:z.uuid(),propertyId:z.uuid().nullable().optional(),title:z.string().trim().min(1).max(500),issuedOn:calendarDate,dueOn:calendarDate,terms:z.string().max(20000).default(''),publicLines:z.array(publicLineSchema).max(200)}).strict().superRefine((v,ctx)=>{
  if(v.dueOn<v.issuedOn)ctx.addIssue({code:'custom',path:['dueOn'],message:'Due date must be on or after the invoice date.'});
  if(!v.publicLines.some(l=>l.kind==='line_item'&&l.clientVisible&&(!l.optional||l.selected)))ctx.addIssue({code:'custom',path:['publicLines'],message:'Add at least one included customer price line.'});
  if(new Set(v.publicLines.map(l=>l.id)).size!==v.publicLines.length)ctx.addIssue({code:'custom',path:['publicLines'],message:'Each line needs a unique identifier.'});
});
export const paymentSchema=z.object({invoiceId:z.uuid(),amount:z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,'Enter an AUD amount with up to two decimal places.').refine(v=>!/^0(?:\.0{1,2})?$/.test(v),'Enter an amount greater than zero.'),receivedOn:calendarDate,method:z.enum(['bank_transfer','cash','cheque','card','other']),reference:z.string().trim().max(500).default(''),notes:z.string().max(4000).default('')}).strict();
export const invoiceListSchema=z.object({search:z.string().trim().max(200).default(''),status:z.enum(['all','draft','issued','void','unpaid','partial','paid','overdue','outstanding']).default('all'),page:z.coerce.number().int().min(1).max(100000).default(1)});
