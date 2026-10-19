import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {withEmsTransaction,type EmsTx} from '@/lib/db/transaction';
import {requireAdmin} from '@/lib/auth/permissions';
import {runCommand,recordActivity,requireVersion,WorkflowError} from '@/lib/workflows/commands';
import {commandMetaSchema,invalidResult} from '@/lib/clients/schemas';
import type {Result,Versioned} from '@/lib/domain/types';
import {visitSchema,statusSchema,scheduleRangeSchema,scheduleFilterSchema} from './schemas';
import {addDays,sydneyMidnight,visitInterval} from './dates';
import type {Visit,ConflictWarning,SavedVisit,ScheduleOptions} from './types';
const columns=`v.id,v.version,v.title,v.description,v.type,v.status,v.all_day as "allDay",v.start_date::text as "startDate",v.end_date::text as "endDate",v.starts_at::text as "startsAt",v.ends_at::text as "endsAt",v.job_id as "jobId",v.request_id as "requestId",j.title as "jobTitle",r.title as "requestTitle",c.display_name as "clientName",p.address,
 coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',m.display_name) order by m.display_name) from ems.visit_assignments a join ems.memberships m on m.organization_id=a.organization_id and m.user_id=a.user_id where a.organization_id=v.organization_id and a.visit_id=v.id),'[]'::jsonb) as assignees`;
const joins=`from ems.visits v left join ems.jobs j on j.id=v.job_id and j.organization_id=v.organization_id left join ems.requests r on r.id=v.request_id and r.organization_id=v.organization_id left join ems.clients c on c.id=coalesce(j.client_id,r.client_id) and c.organization_id=v.organization_id left join ems.properties p on p.id=coalesce(j.property_id,r.property_id) and p.organization_id=v.organization_id`;
async function mutation<T>(work:(tx:EmsTx)=>Promise<T>):Promise<Result<T>> {try{return {ok:true,data:await withEmsTransaction(work)};}catch(error){return {ok:false,error:error instanceof WorkflowError?{code:error.code,message:error.message}:{code:'SAVE_FAILED',message:'The visit could not be saved. Check your connection and try again.'}};}}
export async function saveVisit(input:unknown,meta:unknown):Promise<Result<SavedVisit>> {
  const parsed=visitSchema.safeParse(input);if(!parsed.success)return invalidResult(parsed.error);const command=commandMetaSchema.safeParse(meta);if(!command.success)return invalidResult(command.error);const d=parsed.data;
  return mutation(async tx=>{
    if(tx.actor.role!=='admin')throw new WorkflowError('FORBIDDEN','Only administrators can change dates, details and assignments.');await requireAdmin(tx);
    return runCommand(tx,'visit.save',command.data,d,async()=>{
      const org=tx.actor.organizationId;const id=d.id??randomUUID();
      // Serialize the conflict snapshot and job scheduling decision across concurrent saves.
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`schedule:${org}`]);
      let before:Record<string,unknown>|null=null;
      if(d.id){const [current]=await tx.query<Versioned&{snapshot:Record<string,unknown>}>(`select id,version,jsonb_build_object('allDay',all_day,'startsAt',starts_at,'endsAt',ends_at,'startDate',start_date,'endDate',end_date,'status',status,'jobId',job_id,'requestId',request_id) as snapshot from ems.visits where id=$1 and organization_id=$2 for update`,[id,org]);if(!current)throw new WorkflowError('NOT_FOUND','Visit not found.');requireVersion(current.version,command.data.expectedVersion);const assigned=await tx.query<{user_id:string}>('select user_id from ems.visit_assignments where visit_id=$1 and organization_id=$2 order by user_id',[id,org]);before={...current.snapshot,assigneeIds:assigned.map(a=>a.user_id)};}else requireVersion(0,command.data.expectedVersion);
      let job:{client_id:string;property_id:string|null;status:string}|undefined;
      if(d.jobId){[job]=await tx.query<{client_id:string;property_id:string|null;status:string}>('select client_id,property_id,status from ems.jobs where id=$1 and organization_id=$2 and archived_at is null for update',[d.jobId,org]);if(!job||job.status==='cancelled')throw new WorkflowError('INVALID_JOB','Choose an active job.');}
      if(d.requestId){const [request]=await tx.query<{client_id:string;property_id:string|null}>('select client_id,property_id from ems.requests where id=$1 and organization_id=$2 and archived_at is null for share',[d.requestId,org]);if(!request)throw new WorkflowError('INVALID_REQUEST','Choose an active request.');if(job&&(job.client_id!==request.client_id||job.property_id!==request.property_id))throw new WorkflowError('LINK_MISMATCH','The job and request must refer to the same customer and work site.');}
      if(d.assigneeIds.length){const workers=await tx.query<{user_id:string}>('select user_id from ems.memberships where organization_id=$1 and user_id=any($2::uuid[]) and active',[org,d.assigneeIds]);if(workers.length!==d.assigneeIds.length)throw new WorkflowError('INVALID_WORKER','Choose active workers from your company.');}
      const warnings:ConflictWarning[]=d.status==='cancelled'||!d.assigneeIds.length?[]:await tx.query<ConflictWarning>(`select v.id as "visitId",v.title,a.user_id as "userId",m.display_name as "workerName" from ems.visits v join ems.visit_assignments a on a.visit_id=v.id and a.organization_id=v.organization_id join ems.memberships m on m.user_id=a.user_id and m.organization_id=v.organization_id where v.organization_id=$1 and v.id<>$2 and v.status<>'cancelled' and a.user_id=any($3::uuid[]) and (case when v.all_day then v.start_date::timestamp at time zone 'Australia/Sydney' else v.starts_at end)<$5::timestamptz and (case when v.all_day then (v.end_date+1)::timestamp at time zone 'Australia/Sydney' else v.ends_at end)>$4::timestamptz order by v.id,a.user_id`,[org,id,d.assigneeIds,new Date(visitInterval(d).start).toISOString(),new Date(visitInterval(d).end).toISOString()]);
      const values=[d.jobId,d.requestId,d.title,d.description,d.type,d.status,d.allDay,d.startsAt,d.endsAt,d.startDate,d.endDate,id,org];
      const [saved]=d.id?await tx.query<Versioned>('update ems.visits set job_id=$1,request_id=$2,title=$3,description=$4,type=$5,status=$6,all_day=$7,starts_at=$8,ends_at=$9,start_date=$10,end_date=$11,version=version+1,updated_at=now() where id=$12 and organization_id=$13 returning id,version',values):await tx.query<Versioned>('insert into ems.visits(job_id,request_id,title,description,type,status,all_day,starts_at,ends_at,start_date,end_date,id,organization_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id,version',values);
      await tx.query('delete from ems.visit_assignments where visit_id=$1 and organization_id=$2',[id,org]);
      for(const userId of d.assigneeIds)await tx.query('insert into ems.visit_assignments(organization_id,visit_id,user_id) values($1,$2,$3)',[org,id,userId]);
      if(d.jobId&&d.status!=='cancelled')await tx.query("update ems.jobs set status='scheduled',version=version+1,updated_at=now() where id=$1 and organization_id=$2 and status='unscheduled'",[d.jobId,org]);
      await recordActivity(tx,'visit',id,d.id?'updated':'created',{before,after:{allDay:d.allDay,startsAt:d.startsAt,endsAt:d.endsAt,startDate:d.startDate,endDate:d.endDate,status:d.status,jobId:d.jobId,requestId:d.requestId,assigneeIds:d.assigneeIds}});return {...saved,warnings};
    });
  });
}
export async function changeVisitStatus(id:unknown,status:unknown,meta:unknown):Promise<Result<SavedVisit>> {
  const parsed=z.object({id:z.uuid(),status:statusSchema,meta:commandMetaSchema}).strict().safeParse({id,status,meta});if(!parsed.success)return invalidResult(parsed.error);const d=parsed.data;
  return mutation(tx=>runCommand(tx,'visit.status',d.meta,{id:d.id,status:d.status},async()=>{
    const [visit]=await tx.query<Versioned>('select id,version from ems.visits where id=$1 and organization_id=$2 for update',[d.id,tx.actor.organizationId]);if(!visit)throw new WorkflowError('NOT_FOUND','Assigned visit not found.');requireVersion(visit.version,d.meta.expectedVersion);
    if(tx.actor.role!=='admin'&&d.status==='cancelled')throw new WorkflowError('FORBIDDEN','Ask an administrator to cancel this visit.');
    const [saved]=await tx.query<Versioned>('update ems.visits set status=$1,version=version+1,updated_at=now() where id=$2 and organization_id=$3 returning id,version',[d.status,d.id,tx.actor.organizationId]);await recordActivity(tx,'visit',d.id,'status_changed',{status:d.status});return {...saved,warnings:[]};
  }));
}
export async function readVisit(id:string):Promise<Visit|null>{if(!z.uuid().safeParse(id).success)return null;return withEmsTransaction(async tx=>(await tx.query<Visit>(`select ${columns} ${joins} where v.id=$1 and v.organization_id=$2`,[id,tx.actor.organizationId]))[0]??null);}
export async function querySchedule(range:unknown,filters:unknown={}):Promise<Visit[]> {
  const r=scheduleRangeSchema.parse(range);const f=scheduleFilterSchema.parse(filters);
  return withEmsTransaction(tx=>tx.query<Visit>(`select ${columns} ${joins} where v.organization_id=$1 and ($2 or v.status<>'cancelled') and ((v.all_day and v.start_date<=$4::date and v.end_date>=$3::date) or (not v.all_day and v.starts_at<$6::timestamptz and v.ends_at>$5::timestamptz)) and ($7='' or exists(select 1 from ems.visit_assignments a where a.visit_id=v.id and a.organization_id=v.organization_id and a.user_id=nullif($7,'')::uuid)) and (not $8 or not exists(select 1 from ems.visit_assignments a where a.visit_id=v.id and a.organization_id=v.organization_id)) order by coalesce(v.starts_at,v.start_date::timestamp at time zone 'Australia/Sydney'),v.title,v.id`,[tx.actor.organizationId,f.showCancelled,r.from,r.to,new Date(sydneyMidnight(r.from)).toISOString(),new Date(sydneyMidnight(addDays(r.to,1))).toISOString(),f.workerId,f.unassigned]));
}
export async function scheduleOptions():Promise<ScheduleOptions>{return withEmsTransaction(async tx=>{
  const workers=await tx.query<{id:string;name:string}>('select user_id as id,display_name as name from ems.memberships where organization_id=$1 and active order by display_name',[tx.actor.organizationId]);
  if(tx.actor.role!=='admin')return {workers:workers.filter(w=>w.id===tx.actor.userId),jobs:[],requests:[]};
  const jobs=await tx.query<{id:string;title:string}>("select id,number||' · '||title as title from ems.jobs where organization_id=$1 and archived_at is null and status<>'cancelled' order by updated_at desc",[tx.actor.organizationId]);
  const requests=await tx.query<{id:string;title:string}>("select id,title from ems.requests where organization_id=$1 and archived_at is null and status<>'closed' order by updated_at desc",[tx.actor.organizationId]);return {workers,jobs,requests};
});}
export async function unscheduledJobs():Promise<{id:string;title:string}[]>{return withEmsTransaction(async tx=>tx.actor.role!=='admin'?[]:tx.query<{id:string;title:string}>("select j.id,j.number||' · '||j.title as title from ems.jobs j where j.organization_id=$1 and j.archived_at is null and j.status='unscheduled' and not exists(select 1 from ems.visits v where v.job_id=j.id and v.organization_id=j.organization_id and v.status<>'cancelled') order by j.created_at",[tx.actor.organizationId]));}
