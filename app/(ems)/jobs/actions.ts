'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { saveJob,convertQuoteToJob,changeJobStatus,archiveJob } from '@/lib/jobs/service';
import type { FormState } from '@/lib/clients/schemas';
const values=(f:FormData)=>Object.fromEntries([...f.entries()].filter((e):e is [string,string]=>typeof e[1]==='string'));
const meta=(f:FormData)=>({expectedVersion:Number(f.get('expectedVersion')),idempotencyKey:f.get('idempotencyKey')});
export async function saveJobAction(_previous:FormState,f:FormData):Promise<FormState>{
  let publicLines:unknown;try{publicLines=f.get('publicLines')?JSON.parse(String(f.get('publicLines'))):undefined;}catch{return {values:values(f),result:{ok:false,error:{code:'VALIDATION',message:'Check the contract lines.',fields:{publicLines:'The contract rows could not be read.'}}}};}
  const result=await saveJob({id:f.get('id')||undefined,clientId:f.get('clientId'),propertyId:f.get('propertyId')||null,requestId:f.get('requestId')||undefined,title:f.get('title'),description:f.get('description'),notes:f.get('notes'),status:f.get('status'),terms:f.get('terms')??'',publicLines},meta(f));
  if(!result.ok)return {result,values:values(f)};revalidatePath('/jobs');redirect(`/jobs/${result.data.id}?saved=job`);
}
export async function convertQuoteAction(_previous:FormState,f:FormData):Promise<FormState>{
  const result=await convertQuoteToJob(f.get('quoteId'),meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/jobs');revalidatePath('/quotes');redirect(`/jobs/${result.data.id}?saved=conversion`);
}
export async function changeJobStatusAction(_previous:FormState,f:FormData):Promise<FormState>{
  const result=await changeJobStatus(f.get('id'),f.get('status'),meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/jobs');revalidatePath('/schedule');redirect(`/jobs/${result.data.id}?saved=status`);
}
export async function archiveJobAction(_previous:FormState,f:FormData):Promise<FormState>{
  const result=await archiveJob(f.get('id'),f.get('archived')==='true',meta(f));if(!result.ok)return {result,values:values(f)};revalidatePath('/jobs');redirect(`/jobs/${result.data.id}?saved=archive`);
}
