import { randomUUID } from 'node:crypto';
import { listActivity } from '@/lib/workflows/queries';
import { ActivityFeed } from '@/components/ui/activity-feed';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { readJob } from '@/lib/jobs/service';
import { JobDetail } from '@/components/jobs/job-detail';
import { JobForm } from '@/components/jobs/job-form';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { MoreMenu } from '@/components/ui/more-menu';
import { StatusBadge } from '@/components/ui/status';
import { Notice } from '@/components/ui/notice';
import { Icon } from '@/components/ui/icon';

export default async function JobPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();const {id}=await params;const search=await searchParams;const job=await readJob(id);if(!job)notFound();
  const admin=actor.role==='admin';const activity=admin?await listActivity({entityType:'job',entityId:id,includeRelated:true}):[];const activeInvoice=job.invoices?.find(i=>i.status!=='void');
  const canInvoice=admin&&!!job.contract&&!activeInvoice&&job.status!=='cancelled';
  const primary=!admin?<ButtonLink href={`/timesheets?jobId=${id}`} icon="clock">Record time</ButtonLink>
    :job.status==='completed'&&canInvoice?<ButtonLink href={`/invoices/new?jobId=${id}`} icon="invoices">Create invoice</ButtonLink>
    :<ButtonLink href={`/schedule/new?jobId=${id}`} icon="schedule">Schedule visit</ButtonLink>;
  return <>
    <PageHeader back={{href:'/jobs',label:'Jobs'}} eyebrow={`Job #${job.number}`} title={job.title}
      meta={<><StatusBadge status={job.status}/>{job.archivedAt?<StatusBadge status="archived"/>:null}<Link href={`/clients/${job.clientId}`}>{job.clientName}</Link></>}
      actions={<>
        <MoreMenu>
          {admin&&canInvoice&&job.status!=='completed'?<Link href={`/invoices/new?jobId=${id}`}><Icon name="invoices" size={18}/>Create invoice</Link>:null}
          {admin&&job.status==='completed'?<Link href={`/schedule/new?jobId=${id}`}><Icon name="schedule" size={18}/>Schedule visit</Link>:null}
          <Link href={`/expenses/new?jobId=${id}`}><Icon name="expenses" size={18}/>Record expense</Link>
          {admin?<Link href={`/timesheets?jobId=${id}`}><Icon name="clock" size={18}/>Record time</Link>:null}
          {admin?<><hr/><a href="#edit-job"><Icon name="edit" size={18}/>Edit work details</a><a href="#archive-job"><Icon name="archive" size={18}/>{job.archivedAt?'Restore job':'Archive job'}</a></>:null}
        </MoreMenu>
        {primary}
      </>}/>
    {search.saved?<Notice tone="success">Job saved.</Notice>:null}
    <JobDetail job={job} admin={admin} activity={admin?<ActivityFeed items={activity} showEntity />:null}/>
    {admin?<details className="disclosure" id="edit-job" style={{marginTop:24}}><summary>Edit work details</summary><div><p className="field-hint">Contract prices and customer addresses remain fixed.</p><JobForm job={job} commandKey={randomUUID()}/></div></details>:null}
  </>;
}
