import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status';
import { ButtonLink } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import type { JobSummary } from '@/lib/jobs/service';

export function JobList({items,admin,filtered=false}:{items:JobSummary[];admin:boolean;filtered?:boolean}){
  if(!items.length)return <EmptyState icon="jobs" title={filtered?'No jobs match':'No jobs yet'} description={filtered?'Change the status or filters to find a job.':'Create a job from an approved quote or confirm a direct contract.'} action={admin?<ButtonLink href="/jobs/new" icon="plus">New job</ButtonLink>:undefined}/>;
  return <DataTable caption="Jobs" rows={items} rowKey={j=>j.id} columns={[
    {key:'number',header:'Job',primary:true,cell:j=><><Link href={`/jobs/${j.id}`}>{j.title}</Link><span className="cell-sub">#{j.number}</span></>},
    {key:'client',header:'Client',cell:j=><Link href={`/clients/${j.clientId}`}>{j.clientName}</Link>},
    {key:'site',header:'Work site',hideOnMobile:true,cell:j=>j.address??<span className="muted">No site</span>},
    {key:'status',header:'Status',cell:j=>j.archivedAt?<StatusBadge status="archived"/>:<StatusBadge status={j.status}/>},
  ]}/>;
}
