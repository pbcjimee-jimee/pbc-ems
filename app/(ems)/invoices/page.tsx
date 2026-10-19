import { redirect } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { listInvoices } from '@/lib/invoices/service';
import { InvoiceList } from '@/components/invoices/invoice-list';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';

const statusTabs:[string,string][]=[['all','All'],['draft','Draft'],['outstanding','Awaiting payment'],['overdue','Past due'],['partial','Partially paid'],['paid','Paid'],['void','Void']];

export default async function InvoicesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/jobs');const search=await searchParams;const data=await listInvoices(search);
  const link=(change:Record<string,string>)=>'/invoices?'+new URLSearchParams({...data.filter,page:'1',...change});
  const counts=(data as {counts?:Record<string,number>}).counts;
  return <>
    <PageHeader title="Invoices" description="Issue confirmed job invoices and track payments actually received." actions={<ButtonLink href="/invoices/new" icon="plus">New invoice</ButtonLink>}/>
    <Tabs label="Invoice status" items={statusTabs.map(([value,label])=>({label,href:link({status:value}),current:data.filter.status===value,count:counts?.[value]}))}/>
    <FilterBar resetHref="/invoices" search={{id:'invoices-search',label:'Search invoices',defaultValue:data.filter.search,placeholder:'Number, title or client'}}><input type="hidden" name="status" value={data.filter.status}/></FilterBar>
    <InvoiceList items={data.items} filtered={!!data.filter.search||data.filter.status!=='all'}/>
    <Pagination label="Invoice pages" page={data.page} pageSize={data.pageSize} total={data.total} href={page=>link({page:String(page)})}/>
  </>;
}
