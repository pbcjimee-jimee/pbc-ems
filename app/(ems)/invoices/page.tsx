import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { listInvoices } from '@/lib/invoices/service';
import { InvoiceList } from '@/components/invoices/invoice-list';
import { Button } from '@/components/ui/button';
export default async function InvoicesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/jobs');const search=await searchParams;const data=await listInvoices(search);const pageLink=(page:number)=>'/invoices?'+new URLSearchParams({...data.filter,page:String(page)});
  return <><div className="page-header"><div><h1>Invoices</h1><p className="page-description">Issue confirmed job invoices and track actual received payments.</p></div><Link href="/invoices/new" className="button">New invoice</Link></div><form method="get" className="toolbar"><div className="field"><label htmlFor="invoices-search">Search invoices</label><input type="search" name="search" id="invoices-search" maxLength={200} defaultValue={data.filter.search}/></div><div className="field"><label htmlFor="invoices-status">Status / balance</label><select id="invoices-status" name="status" defaultValue={data.filter.status}>{['all','draft','issued','outstanding','unpaid','partial','paid','overdue','void'].map(s=><option key={s} value={s}>{s==='all'?'All invoices':s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></div><Button variant="secondary" type="submit">Apply filters</Button><Link href="/invoices">Reset</Link></form><p className="field-hint">{data.total} invoices · page {data.page}</p><InvoiceList items={data.items}/><nav aria-label="Invoice pages" className="toolbar">{data.page>1?<Link href={pageLink(data.page-1)}>Previous</Link>:null}{data.page*data.pageSize<data.total?<Link href={pageLink(data.page+1)}>Next</Link>:null}</nav></>;
}

