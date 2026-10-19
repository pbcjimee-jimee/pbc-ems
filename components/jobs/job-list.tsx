import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { Status } from '@/components/ui/status';
import { jobStatusLabels } from '@/lib/jobs/schemas';
import type { JobSummary } from '@/lib/jobs/service';
export function JobList({items,admin}:{items:JobSummary[];admin:boolean}){
  if(!items.length)return <EmptyState title="No jobs found" description="Change the filters or create a job from an approved quote or direct contract." action={admin?<Link className="button" href="/jobs/new">New job</Link>:undefined}/>;
  return <ul style={{listStyle:'none',padding:0}}>{items.map(j=><li className="panel" key={j.id} style={{marginBottom:12}}><div className="page-header" style={{marginBottom:8}}><h2><Link href={`/jobs/${j.id}`}>{j.number} · {j.title}</Link></h2><Status tone={j.status==='completed'?'success':'info'}>{jobStatusLabels[j.status as keyof typeof jobStatusLabels]}{j.archivedAt?' · Archived':''}</Status></div><p><Link href={`/clients/${j.clientId}`}>{j.clientName}</Link></p><p className="field-hint">{j.address??'No work site selected'}</p></li>)}</ul>;
}
