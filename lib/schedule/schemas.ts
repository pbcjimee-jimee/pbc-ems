import { z } from 'zod';
import { validDate } from './dates';
export const visitStatuses={scheduled:'Scheduled',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'} as const;
export const statusSchema=z.enum(['scheduled','in_progress','completed','cancelled']);
const date=z.string().refine(validDate,'Enter a valid date.');
export const visitSchema=z.object({id:z.uuid().optional(),title:z.string().trim().min(1,'Enter a visit title.').max(240),description:z.string().trim().max(10000).default(''),type:z.enum(['visit','assessment','general']).default('visit'),status:statusSchema.default('scheduled'),jobId:z.uuid().nullish().transform(v=>v??null),requestId:z.uuid().nullish().transform(v=>v??null),allDay:z.boolean(),startDate:date.nullish().transform(v=>v??null),endDate:date.nullish().transform(v=>v??null),startsAt:z.iso.datetime({offset:true}).nullish().transform(v=>v??null),endsAt:z.iso.datetime({offset:true}).nullish().transform(v=>v??null),assigneeIds:z.array(z.uuid()).max(100).default([])}).strict().superRefine((d,ctx)=>{
  const issue=(path:string,message:string)=>ctx.addIssue({code:'custom',path:[path],message});
  if(d.allDay){if(!d.startDate||!d.endDate||d.endDate<d.startDate)issue('endDate','Choose an inclusive date range ending on or after its start.');if(d.startsAt||d.endsAt)issue('startsAt','All-day visits use dates only.');}
  else {if(!d.startsAt||!d.endsAt||Date.parse(d.endsAt)<=Date.parse(d.startsAt))issue('endsAt','End time must be after start time.');if(d.startDate||d.endDate)issue('startDate','Timed visits use timestamps only.');}
  if(new Set(d.assigneeIds).size!==d.assigneeIds.length)issue('assigneeIds','Choose each worker once.');
});
export const scheduleRangeSchema=z.object({from:date,to:date}).refine(r=>r.to>=r.from&&Date.parse(r.to)-Date.parse(r.from)<=366*86400000,'Choose a date range of no more than one year.');
export const scheduleFilterSchema=z.object({workerId:z.union([z.uuid(),z.literal('')]).default(''),unassigned:z.boolean().default(false),showCancelled:z.boolean().default(false)});
