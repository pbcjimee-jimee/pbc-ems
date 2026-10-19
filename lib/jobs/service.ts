import 'server-only';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { withEmsTransaction, type EmsTx } from '@/lib/db/transaction';
import { clientMutation } from '@/lib/clients/service';
import { calculateCommercialTotals } from '@/lib/quotes/commercial-totals';
import { customerSnapshot, commercialSnapshot } from '@/lib/quotes/snapshots';
import type { CommercialSnapshot, CustomerSnapshot } from '@/lib/documents/types';
import type { Result,Versioned } from '@/lib/domain/types';
import { runCommand,requireVersion,recordActivity,WorkflowError } from '@/lib/workflows/commands';
import { jobSchema,jobListSchema,jobStatusSchema,commandMetaSchema,invalidResult, type JobStatus } from './schemas';
import { assertJobTransition } from './transitions';
export type JobCounts=Record<'all'|'active'|JobStatus,number>&{requires_invoicing?:number};
export type JobPipeline={
  active:{count:number};
  inProgress:{count:number};
  requiresInvoicing?:{count:number;amount:string;missingAmountCount:number};
};
export type JobSummary=Versioned&{number:string;title:string;status:string;clientId:string;propertyId:string|null;requestId:string|null;clientName:string;address:string|null;archivedAt:string|null};
export type JobContract={snapshot:CommercialSnapshot;customer:CustomerSnapshot;subtotal:string;tax:string;total:string};
export type JobDetail=JobSummary&{description:string;notes:string|null;quoteId?:string|null;contract?:JobContract;visits:{id:string;title:string;status:string;allDay:boolean;start:string;end:string}[];invoices?:{id:string;number:string;status:string}[];expenses:{id:string;title:string}[];timeEntries:{id:string;status:string;startedAt:string}[];actuals:{scope:'job'|'own';expenseTotal:string;workedMinutes:string;runningTimers:number}};
const columns='j.id,j.version,j.number,j.title,j.status,j.client_id as "clientId",j.property_id as "propertyId",j.request_id as "requestId",c.display_name as "clientName",p.address,j.archived_at::text as "archivedAt"';
const joins='from ems.jobs j join ems.clients c on c.id=j.client_id and c.organization_id=j.organization_id left join ems.properties p on p.id=j.property_id and p.organization_id=j.organization_id';
const requiresInvoicing="j.archived_at is null and j.status='completed' and not exists(select 1 from ems.invoices i where i.job_id=j.id and i.organization_id=j.organization_id and i.status<>'void')";
export async function convertQuoteToJob(quoteId:unknown,meta:unknown):Promise<Result<Versioned>>{
  const parsed=z.object({quoteId:z.uuid(),meta:commandMetaSchema}).safeParse({quoteId,meta});if(!parsed.success)return invalidResult(parsed.error);const d=parsed.data;
  return clientMutation(tx=>runCommand(tx,'job.convert',d.meta,{quoteId:d.quoteId},async()=>{
    const [quote]=await tx.query<Versioned&{title:string;client_id:string;property_id:string|null;request_id:string|null;approved_revision_id:string|null}>('select id,version,title,client_id,property_id,request_id,approved_revision_id from ems.quotes where id=$1 and organization_id=$2 for update',[d.quoteId,tx.actor.organizationId]);
    if(!quote)throw new WorkflowError('NOT_FOUND','Quote not found.');requireVersion(quote.version,d.meta.expectedVersion);
    if(!quote.approved_revision_id)throw new WorkflowError('NOT_APPROVED','Approve a quote revision before creating its job.');
    const [existing]=await tx.query<Versioned>('select id,version from ems.jobs where quote_revision_id=$1 and organization_id=$2',[quote.approved_revision_id,tx.actor.organizationId]);if(existing)return existing;
    const [revision]=await tx.query<JobContract>(`select snapshot,customer_snapshot as customer,subtotal,tax,total from ems.quote_revisions where id=$1 and organization_id=$2 and status='approved' for share`,[quote.approved_revision_id,tx.actor.organizationId]);
    if(!revision)throw new WorkflowError('NOT_APPROVED','Approved revision is unavailable.');
    const scope=revision.snapshot.publicLines.filter(l=>l.clientVisible&&(!l.optional||l.selected)).map(l=>[l.name,l.description].filter(Boolean).join(' — ')).join('\n');
    const source=revision.snapshot.source??{clientId:quote.client_id,propertyId:quote.property_id};
    const requestId=revision.snapshot.source?.requestId===undefined?quote.request_id:revision.snapshot.source.requestId;
    const [job]=await tx.query<Versioned>('insert into ems.jobs(organization_id,client_id,property_id,request_id,quote_revision_id,title,description) values($1,$2,$3,$4,$5,$6,$7) returning id,version',[tx.actor.organizationId,source.clientId,source.propertyId,requestId,quote.approved_revision_id,revision.snapshot.document?.title??quote.title,scope]);
    await tx.query('insert into ems.job_contracts(organization_id,job_id,quote_revision_id,snapshot,customer_snapshot,subtotal,tax,total) values($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)',[tx.actor.organizationId,job.id,quote.approved_revision_id,JSON.stringify(revision.snapshot),JSON.stringify(revision.customer),revision.subtotal,revision.tax,revision.total]);
    await recordActivity(tx,'job',job.id,'converted',{quoteId:d.quoteId});return job;
  }));
}
export async function saveJob(input:unknown,meta:unknown):Promise<Result<Versioned>>{
  const parsed=jobSchema.safeParse(input);if(!parsed.success)return invalidResult(parsed.error);const command=commandMetaSchema.safeParse(meta);if(!command.success)return invalidResult(command.error);const d=parsed.data;
  return clientMutation(tx=>runCommand(tx,'job.save',command.data,d,async()=>{
    if(d.id){
      const [current]=await tx.query<Versioned&{client_id:string;property_id:string|null;request_id:string|null;status:JobStatus;archived_at:string|null}>('select id,version,client_id,property_id,request_id,status,archived_at from ems.jobs where id=$1 and organization_id=$2 for update',[d.id,tx.actor.organizationId]);
      if(!current)throw new WorkflowError('NOT_FOUND','Job not found.');requireVersion(current.version,command.data.expectedVersion);
      if(current.status!==d.status)assertJobTransition({role:tx.actor.role,from:current.status,to:d.status,archived:current.archived_at!==null});
      if(current.client_id!==d.clientId||current.property_id!==(d.propertyId??null)||(d.requestId!==undefined&&current.request_id!==d.requestId))throw new WorkflowError('FIXED_CONTRACT','The confirmed customer, site and originating request cannot change.');
      const [saved]=await tx.query<Versioned>("update ems.jobs set title=$1,description=$2,notes=$3,status=$4,completed_at=case when $4='completed' then coalesce(completed_at,now()) else null end,version=version+1 where id=$5 and organization_id=$6 returning id,version",[d.title,d.description,d.notes,d.status,d.id,tx.actor.organizationId]);
      await recordActivity(tx,'job',saved.id,'updated',{status:d.status});return saved;
    }
    requireVersion(0,command.data.expectedVersion);
    const snapshotInput={...d,publicLines:d.publicLines!,workType:'Mixed' as const,calculation:{materials:[],selectedMin:3 as const,selectedMax:3 as const},internalMemo:'',refreshPricing:false};
    const customer=await customerSnapshot(tx,snapshotInput);const snapshot=await commercialSnapshot(tx,snapshotInput);const totals=calculateCommercialTotals(d.publicLines!);
    if([totals.total,totals.subtotal,totals.gst].some(n=>new Decimal(n).isNegative()))throw new WorkflowError('INVALID_TOTAL','Contract amounts and GST cannot be negative.');
    const [job]=await tx.query<Versioned>('insert into ems.jobs(organization_id,client_id,property_id,title,description,notes,status,completed_at,request_id) values($1,$2,$3,$4,$5,$6,$7,case when $7=\'completed\' then now() else null end,$8) returning id,version',[tx.actor.organizationId,d.clientId,d.propertyId??null,d.title,d.description,d.notes,d.status,d.requestId??null]);
    await tx.query('insert into ems.job_contracts(organization_id,job_id,snapshot,customer_snapshot,subtotal,tax,total) values($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7)',[tx.actor.organizationId,job.id,JSON.stringify(snapshot),JSON.stringify(customer),totals.subtotal,totals.gst,totals.total]);
    await recordActivity(tx,'job',job.id,'created');return job;
  }));
}
export async function changeJobStatus(id:unknown,status:unknown,meta:unknown):Promise<Result<Versioned>>{
  const parsed=z.object({id:z.uuid(),status:jobStatusSchema,meta:commandMetaSchema}).safeParse({id,status,meta});if(!parsed.success)return invalidResult(parsed.error);const d=parsed.data;
  try{return {ok:true,data:await withEmsTransaction(tx=>runCommand(tx,'job.status',d.meta,{id:d.id,status:d.status},async()=>{
    const [job]=await tx.query<Versioned&{status:JobStatus;archived_at:string|null}>('select id,version,status,archived_at from ems.jobs where id=$1 and organization_id=$2 for update',[d.id,tx.actor.organizationId]);if(!job)throw new WorkflowError('NOT_FOUND','Assigned job not found.');requireVersion(job.version,d.meta.expectedVersion);
    assertJobTransition({role:tx.actor.role,from:job.status,to:d.status,archived:job.archived_at!==null});
    if(job.status===d.status)return {id:job.id,version:job.version};
    const [saved]=await tx.query<Versioned>("update ems.jobs set status=$1,completed_at=case when $1='completed' then coalesce(completed_at,now()) else null end,version=version+1 where id=$2 and organization_id=$3 returning id,version",[d.status,d.id,tx.actor.organizationId]);await recordActivity(tx,'job',d.id,'status_changed',{status:d.status});return saved;
  }))};}catch(error){return {ok:false,error:error instanceof WorkflowError?{code:error.code,message:error.message}:{code:'SAVE_FAILED',message:'Status could not be saved. Reload and try again.'}};}
}
export async function archiveJob(id:unknown,archived:unknown,meta:unknown):Promise<Result<Versioned>>{
  const p=z.object({id:z.uuid(),archived:z.boolean(),meta:commandMetaSchema}).safeParse({id,archived,meta});if(!p.success)return invalidResult(p.error);const d=p.data;
  return clientMutation(tx=>runCommand(tx,'job.archive',d.meta,{id:d.id,archived:d.archived},async()=>{
    const [job]=await tx.query<Versioned>('select id,version from ems.jobs where id=$1 and organization_id=$2 for update',[d.id,tx.actor.organizationId]);if(!job)throw new WorkflowError('NOT_FOUND','Job not found.');requireVersion(job.version,d.meta.expectedVersion);
    const [saved]=await tx.query<Versioned>('update ems.jobs set archived_at=$1,version=version+1 where id=$2 and organization_id=$3 returning id,version',[d.archived?new Date().toISOString():null,d.id,tx.actor.organizationId]);await recordActivity(tx,'job',d.id,d.archived?'archived':'restored');return saved;
  }));
}
export async function listJobs(input:unknown={}){
  const p=jobListSchema.safeParse(input);const filter=p.success?p.data:jobListSchema.parse({});
  return withEmsTransaction(async tx=>{
    if(tx.actor.role!=='admin'&&filter.status==='requires_invoicing')throw new WorkflowError('FORBIDDEN','Administrator permission required for invoice filters.');
    const admin=tx.actor.role==='admin';
    const invoiceColumn=admin?`,(${requiresInvoicing}) as requires_invoicing`:'';
    const invoiceCount=admin?`, 'requires_invoicing',count(*) filter (where requires_invoicing)`:'';
    const invoiceFilter=admin?`or ($3='requires_invoicing' and requires_invoicing)`:'';
    const [row]=await tx.query<{counts:JobCounts;items:JobSummary[]}>(`with scoped as (
      select ${columns},j.updated_at ${invoiceColumn} ${joins}
      where j.organization_id=$1 and ($2='' or j.title ilike '%'||$2||'%' or c.display_name ilike '%'||$2||'%' or j.number ilike '%'||$2||'%')
        and ($4='all' or ($4='active' and j.archived_at is null) or ($4='archived' and j.archived_at is not null))
    ), page as (
      select * from scoped where ($3='all' or status=$3 or ($3='active' and status not in ('completed','cancelled')) ${invoiceFilter})
      order by updated_at desc,id limit 25 offset $5
    ) select jsonb_build_object(
      'all',count(*),'active',count(*) filter (where status not in ('completed','cancelled')),
      'unscheduled',count(*) filter (where status='unscheduled'),'scheduled',count(*) filter (where status='scheduled'),
      'in_progress',count(*) filter (where status='in_progress'),'completed',count(*) filter (where status='completed'),
      'cancelled',count(*) filter (where status='cancelled') ${invoiceCount}
    ) as counts,coalesce((select jsonb_agg(to_jsonb(page)-'updated_at'-'requires_invoicing' order by updated_at desc,id) from page),'[]'::jsonb) as items
    from scoped`,[tx.actor.organizationId,filter.search,filter.status,filter.archive,(filter.page-1)*25]);
    return {items:row.items,total:row.counts[filter.status]??0,counts:row.counts,filter,page:filter.page,pageSize:25};
  });
}
export async function readJobPipeline(tx:EmsTx):Promise<JobPipeline>{
  const admin=tx.actor.role==='admin';
  const invoiceColumns=admin?`,count(*) filter (where ${requiresInvoicing})::int as "requiresInvoicing",
    coalesce(sum(contract.total) filter (where ${requiresInvoicing}),0)::text as amount,
    count(*) filter (where ${requiresInvoicing} and contract.job_id is null)::int as "missingAmountCount"`:'';
  const contractJoin=admin?'left join ems.job_contracts contract on contract.job_id=j.id and contract.organization_id=j.organization_id':'';
  const [row]=await tx.query<{active:number;inProgress:number;requiresInvoicing?:number;amount?:string;missingAmountCount?:number}>(`select
    count(*) filter (where j.status not in ('completed','cancelled'))::int as active,
    count(*) filter (where j.status='in_progress')::int as "inProgress" ${invoiceColumns}
    from ems.jobs j ${contractJoin} where j.organization_id=$1 and j.archived_at is null`,[tx.actor.organizationId]);
  const pipeline:JobPipeline={active:{count:row.active},inProgress:{count:row.inProgress}};
  if(admin)pipeline.requiresInvoicing={count:row.requiresInvoicing!,amount:new Decimal(row.amount!).toFixed(2),missingAmountCount:row.missingAmountCount!};
  return pipeline;
}
export async function readJob(id:string):Promise<JobDetail|null>{
  if(!z.uuid().safeParse(id).success)return null;
  return withEmsTransaction(async tx=>{
    const [job]=await tx.query<JobSummary&{description:string;notes:string|null}>(`select ${columns},j.description,j.notes ${joins} where j.id=$1 and j.organization_id=$2`,[id,tx.actor.organizationId]);if(!job)return null;
    const params=[id,tx.actor.organizationId];
    const visits=await tx.query<JobDetail['visits'][number]>('select id,title,status,all_day as "allDay",coalesce(start_date::text,starts_at::text) as start,coalesce(end_date::text,ends_at::text) as end from ems.visits where job_id=$1 and organization_id=$2 order by coalesce(starts_at,start_date::timestamptz)',params);
    const expenses=await tx.query<JobDetail['expenses'][number]>('select id,title from ems.expenses where job_id=$1 and organization_id=$2 and archived_at is null order by occurred_on desc',params);
    const timeEntries=await tx.query<JobDetail['timeEntries'][number]>('select id,status,started_at::text as "startedAt" from ems.time_entries where job_id=$1 and organization_id=$2 order by started_at desc',params);
    const actualsParams=[...params,tx.actor.role==='admin'?null:tx.actor.userId];
    const [expenseSum]=await tx.query<{total:string}>('select coalesce(sum(amount),0)::text as total from ems.expenses where job_id=$1 and organization_id=$2 and archived_at is null and ($3::uuid is null or user_id=$3)',actualsParams);
    // Match durationMinutes: discard incomplete minutes per closed entry after deducting breaks.
    const [timeSum]=await tx.query<{workedMinutes:string;runningTimers:number}>('select coalesce(sum(floor(extract(epoch from (ended_at-started_at))/60-break_minutes)) filter (where ended_at is not null),0)::text as "workedMinutes",count(*) filter (where ended_at is null)::int as "runningTimers" from ems.time_entries where job_id=$1 and organization_id=$2 and ($3::uuid is null or user_id=$3)',actualsParams);
    const actuals:JobDetail['actuals']={scope:tx.actor.role==='admin'?'job':'own',expenseTotal:new Decimal(expenseSum.total).toFixed(2),...timeSum};
    if(tx.actor.role!=='admin')return {...job,visits,expenses,timeEntries,actuals};
    const [contract]=await tx.query<JobContract>('select snapshot,customer_snapshot as customer,subtotal,tax,total from ems.job_contracts where job_id=$1 and organization_id=$2',params);
    const invoices=await tx.query<NonNullable<JobDetail['invoices']>[number]>('select id,number,status from ems.invoices where job_id=$1 and organization_id=$2 order by created_at desc',params);
    const [quote]=await tx.query<{id:string}>('select r.quote_id as id from ems.jobs j join ems.quote_revisions r on r.id=j.quote_revision_id and r.organization_id=j.organization_id where j.id=$1 and j.organization_id=$2',params);
    return {...job,visits,expenses,timeEntries,actuals,contract,invoices,quoteId:quote?.id??null};
  });
}
