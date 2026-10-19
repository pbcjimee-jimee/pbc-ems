import Link from 'next/link';
import { requireMembership } from '@/lib/auth/permissions';
import { listJobs } from '@/lib/jobs/service';
import { jobStatusLabels } from '@/lib/jobs/schemas';
import { JobList } from '@/components/jobs/job-list';
import { Button } from '@/components/ui/button';
export default async function JobsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();const search=await searchParams;const data=await listJobs(search);
  const pageLink=(page:number)=>'/jobs?'+new URLSearchParams({...data.filter,page:String(page)});
  return <><div className="page-header"><div><h1>Jobs</h1><p className="page-description">{actor.role==='admin'?'Manage confirmed work, visits and linked invoices.':'Your assigned work, site instructions and visits.'}</p></div>{actor.role==='admin'?<Link className="button" href="/jobs/new">New job</Link>:null}</div><form method="get" className="toolbar"><div className="field"><label htmlFor="jobs-search">Search jobs</label><input type="search" id="jobs-search" name="search" maxLength={200} defaultValue={data.filter.search}/></div><div className="field"><label htmlFor="jobs-status">Status</label><select id="jobs-status" name="status" defaultValue={data.filter.status}><option value="all">All statuses</option><option value="active">Active work</option>{actor.role==='admin'?<option value="requires_invoicing">Requires invoicing</option>:null}{Object.entries(jobStatusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div><div className="field"><label htmlFor="jobs-archive">Records</label><select id="jobs-archive" name="archive" defaultValue={data.filter.archive}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></select></div><Button type="submit" variant="secondary">Apply filters</Button><Link href="/jobs">Reset</Link></form><p className="field-hint">{data.total} jobs · page {data.page}</p><JobList items={data.items} admin={actor.role==='admin'}/><nav aria-label="Job pages" className="toolbar">{data.page>1?<Link href={pageLink(data.page-1)}>Previous</Link>:null}{data.page*data.pageSize<data.total?<Link href={pageLink(data.page+1)}>Next</Link>:null}</nav></>;
}

