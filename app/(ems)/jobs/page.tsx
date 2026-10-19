import { requireMembership } from '@/lib/auth/permissions';
import { listJobs } from '@/lib/jobs/service';
import { jobStatusLabels } from '@/lib/jobs/schemas';
import { JobList } from '@/components/jobs/job-list';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar, SelectFilter } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';

export default async function JobsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();const search=await searchParams;const data=await listJobs(search);const admin=actor.role==='admin';
  const link=(change:Record<string,string>)=>'/jobs?'+new URLSearchParams({...data.filter,page:'1',...change});
  const counts=(data as {counts?:Record<string,number>}).counts;
  const tabs:[string,string][]=[['all','All'],['active','Active'],...(admin?[['requires_invoicing','Requires invoicing'] as [string,string]]:[]),...Object.entries(jobStatusLabels)];
  return <>
    <PageHeader title="Jobs" description={admin?'Confirmed work, visits and the invoices that follow.':'Your assigned work, site instructions and visits.'} actions={admin?<ButtonLink href="/jobs/new" icon="plus">New job</ButtonLink>:null}/>
    <Tabs label="Job status" items={tabs.map(([value,label])=>({label,href:link({status:value}),current:data.filter.status===value,count:counts?.[value]}))}/>
    <FilterBar resetHref="/jobs" search={{id:'jobs-search',label:'Search jobs',defaultValue:data.filter.search,placeholder:'Job number, title or client'}}>
      <input type="hidden" name="status" value={data.filter.status}/>
      <SelectFilter id="jobs-archive" name="archive" label="Records" defaultValue={data.filter.archive} options={[['active','Active'],['archived','Archived'],['all','All records']]}/>
    </FilterBar>
    <JobList items={data.items} admin={admin} filtered={!!data.filter.search||data.filter.status!=='all'||data.filter.archive!=='active'}/>
    <Pagination label="Job pages" page={data.page} pageSize={data.pageSize} total={data.total} href={page=>link({page:String(page)})}/>
  </>;
}
