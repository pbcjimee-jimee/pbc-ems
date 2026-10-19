import Link from 'next/link';
import { requireMembership } from '@/lib/auth/permissions';
import { listQuotes } from '@/lib/quotes/service';
import { money,shortDate } from '@/lib/domain/format';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status';

const statusTabs:[string,string][]=[['all','All'],['draft','Draft'],['issued','Awaiting response'],['changes_requested','Changes requested'],['approved','Approved'],['declined','Declined'],['archived','Archived']];

export default async function QuotesPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const actor=await requireMembership();
  if(actor.role!=='admin')return <EmptyState icon="quotes" title="Quotes are for administrators" description="Quote prices and calculations are restricted. Your assigned work is in Jobs." action={<ButtonLink href="/jobs">View assigned jobs</ButtonLink>}/>;
  const params=await searchParams;const data=await listQuotes({search:params.search??'',status:params.status??'all',page:params.page??1});
  const link=(change:Record<string,string>)=>'/quotes?'+new URLSearchParams({search:data.filter.search,status:data.filter.status,page:'1',...change});
  const counts=(data as {counts?:Record<string,number>}).counts;
  const filtered=!!data.filter.search||data.filter.status!=='all';
  return <>
    <PageHeader title="Quotes" description="Prepare estimates, keep revisions and record customer decisions." actions={<><ButtonLink variant="secondary" href="/quotes/settings" icon="settings">Products &amp; rates</ButtonLink><ButtonLink href="/quotes/new" icon="plus">New quote</ButtonLink></>}/>
    <Tabs label="Quote status" items={statusTabs.map(([value,label])=>({label,href:link({status:value}),current:data.filter.status===value,count:counts?.[value]}))}/>
    <FilterBar resetHref="/quotes" search={{id:'quote-search',label:'Search quotes',defaultValue:data.filter.search,placeholder:'Number, title or client'}}><input type="hidden" name="status" value={data.filter.status}/></FilterBar>
    {data.items.length?<DataTable caption="Quotes" rows={data.items} rowKey={q=>q.id} columns={[
      {key:'title',header:'Quote',primary:true,cell:q=><><Link href={'/quotes/'+q.id}>{q.title}</Link><span className="cell-sub">#{q.number}</span></>},
      {key:'client',header:'Client',cell:q=>q.clientName},
      {key:'valid',header:'Valid until',hideOnMobile:true,cell:q=>q.validUntil?shortDate(q.validUntil):<span className="muted">Not set</span>},
      {key:'status',header:'Status',cell:q=><StatusBadge status={q.status}/>},
      {key:'total',header:'Total Inc GST',align:'end',cell:q=><strong>{money(q.total)}</strong>},
    ]}/>:<EmptyState icon="quotes" title={filtered?'No matching quotes':'Your first quote starts here'} description={filtered?'Try another title, quote number, client or status.':'Create a quote with internal calculations and a separate customer offer.'} action={<ButtonLink href="/quotes/new" icon="plus">Create quote</ButtonLink>}/>}
    <Pagination label="Quote pages" page={data.filter.page} pageSize={25} total={data.total} href={page=>link({page:String(page)})}/>
  </>;
}
