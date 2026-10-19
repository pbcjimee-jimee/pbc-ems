'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {saveVisit,changeVisitStatus} from '@/lib/schedule/service';
import {resolveSydneyDateTime} from '@/lib/domain/sydney-date-time';
import type {VisitFormState} from '@/lib/schedule/types';
const values=(f:FormData)=>Object.fromEntries([...f.entries()].filter((e):e is [string,string]=>typeof e[1]==='string'));
const meta=(f:FormData)=>({expectedVersion:Number(f.get('expectedVersion')),idempotencyKey:f.get('idempotencyKey')});
export async function saveVisitAction(_previous:VisitFormState,f:FormData):Promise<VisitFormState>{
  const preserved={values:values(f),assigneeIds:f.getAll('assigneeIds').map(String)};const allDay=f.get('allDay')==='on';
  const timestamps:{startsAt:string|null;endsAt:string|null}={startsAt:null,endsAt:null};
  if(!allDay){for(const [field,local] of [['startsAt','startLocal'],['endsAt','endLocal']] as const){const input=String(f.get(local)??'');const occurrence=f.get(`${local}Occurrence`);if(occurrence&&occurrence!=='earlier'&&occurrence!=='later')return {...preserved,result:{ok:false,error:{code:'VALIDATION',message:'Choose a valid daylight saving occurrence.'}}};const result=resolveSydneyDateTime(input.slice(0,10),input.slice(11,16),occurrence==='earlier'||occurrence==='later'?occurrence:undefined);if(!result.ok)return {...preserved,result:{ok:false,error:{...result.error,fields:{[local]:result.error.message}}}};timestamps[field]=result.data.iso;}}
  const result=await saveVisit({id:f.get('id')||undefined,title:f.get('title'),description:f.get('description'),type:f.get('type'),status:f.get('status'),jobId:f.get('jobId')||null,requestId:f.get('requestId')||null,allDay,...timestamps,startDate:allDay?f.get('startDate'):null,endDate:allDay?f.get('endDate'):null,assigneeIds:preserved.assigneeIds},meta(f));
  if(!result.ok)return {...preserved,result};revalidatePath('/schedule');revalidatePath('/jobs');revalidatePath('/requests');revalidatePath('/home');
  // Return warnings with the successful command so they survive refresh and retries.
  return {...preserved,result};
}
export async function changeVisitStatusAction(_previous:VisitFormState,f:FormData):Promise<VisitFormState>{
  const result=await changeVisitStatus(f.get('id'),f.get('status'),meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/schedule');revalidatePath('/home');revalidatePath('/jobs');redirect(`/schedule/${result.data.id}?saved=status`);
}
