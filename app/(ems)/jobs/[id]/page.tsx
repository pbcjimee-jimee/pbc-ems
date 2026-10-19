import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { readJob } from '@/lib/jobs/service';
import { JobDetail } from '@/components/jobs/job-detail';
import { JobForm } from '@/components/jobs/job-form';
export default async function JobPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();const {id}=await params;const search=await searchParams;const job=await readJob(id);if(!job)notFound();
  return <><div className="page-header"><div><h1>{job.number} · {job.title}</h1><p className="page-description">{job.status.replaceAll('_',' ')}{job.archivedAt?' · Archived':''}</p></div><Link href="/jobs">All jobs</Link></div>{search.saved?<p className="alert" role="status">Job saved.</p>:null}<JobDetail job={job} admin={actor.role==='admin'}/>{actor.role==='admin'?<details style={{marginTop:24}}><summary>Edit work details</summary><p className="field-hint">Contract prices and customer addresses remain fixed.</p><JobForm job={job} commandKey={randomUUID()}/></details>:null}</>;
}
