import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { withEmsTransaction } from '@/lib/db/transaction';
import { CreateInvoiceForm,DirectInvoiceForm } from '@/components/invoices/invoice-form';
import { EmptyState } from '@/components/ui/empty-state';
import { clientOptions } from '@/lib/clients/service';
import { sydneyToday } from '@/lib/domain/format';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
export default async function NewInvoicePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/jobs');const search=await searchParams;
  const jobs=await withEmsTransaction(tx=>tx.query<{id:string;version:number;title:string;number:string}>("select j.id,j.version,j.title,j.number from ems.jobs j join ems.job_contracts c on c.job_id=j.id and c.organization_id=j.organization_id where j.organization_id=$1 and j.archived_at is null and j.status<>'cancelled' and not exists(select 1 from ems.invoices i where i.job_id=j.id and i.organization_id=j.organization_id and i.status<>'void') order by j.updated_at desc",[tx.actor.organizationId]));
  const options=await clientOptions();
  return <div className="form-page stack"><PageHeader back={{href:'/invoices',label:'Invoices'}} title="New invoice" description="Copy a confirmed job contract, or write a direct customer invoice."/><Card title="From a confirmed job" description="Recommended. Prices, GST, addresses and terms come from the contract.">{jobs.length?<CreateInvoiceForm jobs={jobs} jobId={typeof search.jobId==='string'&&jobs.some(j=>j.id===search.jobId)?search.jobId:undefined} commandKey={randomUUID()}/>:<EmptyState icon="jobs" title="No jobs ready to invoice" description="Jobs with an active full invoice are listed on their job details. You can also write a direct invoice below." action={<Link className="button" href="/jobs">Open jobs</Link>}/>}</Card><details className="disclosure" open={search.mode==='direct'||!jobs.length}><summary>Write a direct invoice</summary>{options.clients.length?<DirectInvoiceForm {...options} today={sydneyToday()} commandKey={randomUUID()}/>:<EmptyState icon="clients" title="Add a client first" description="Direct invoices belong to an active client." action={<Link className="button" href="/clients/new">New client</Link>}/>}</details></div>;
}
