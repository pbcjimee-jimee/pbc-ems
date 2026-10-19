import { z } from 'zod';
import { publicLineSchema } from '@/lib/quotes/schemas';
export { commandMetaSchema, invalidResult } from '@/lib/clients/schemas';
export const jobStatusSchema=z.enum(['unscheduled','scheduled','in_progress','completed','cancelled']);
export type JobStatus=z.infer<typeof jobStatusSchema>;
export const jobStatusLabels={unscheduled:'Unscheduled',scheduled:'Scheduled',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'};
export const jobSchema=z.object({id:z.uuid().optional(),clientId:z.uuid(),propertyId:z.uuid().nullable().optional(),requestId:z.uuid().nullable().optional(),title:z.string().trim().min(1).max(500),description:z.string().trim().max(20000).default(''),notes:z.string().max(20000).default(''),status:jobStatusSchema.default('unscheduled'),terms:z.string().max(20000).default(''),publicLines:z.array(publicLineSchema).max(200).optional()}).strict().superRefine((v,ctx)=>{
  if(!v.id && !v.description)ctx.addIssue({code:'custom',path:['description'],message:'Confirm the work scope before creating the job.'});
  if(!v.id && !v.publicLines?.some(l=>l.kind==='line_item'&&l.clientVisible&&(!l.optional||l.selected))) ctx.addIssue({code:'custom',path:['publicLines'],message:'Confirm at least one customer price line.'});
  if(v.publicLines && new Set(v.publicLines.map(l=>l.id)).size!==v.publicLines.length)ctx.addIssue({code:'custom',path:['publicLines'],message:'Each line needs a unique identifier.'});
});
export const jobListSchema=z.object({search:z.string().trim().max(200).default(''),status:z.enum(['all','active','requires_invoicing',...jobStatusSchema.options]).default('all'),archive:z.enum(['active','archived','all']).default('active'),page:z.coerce.number().int().min(1).max(100000).default(1)});
