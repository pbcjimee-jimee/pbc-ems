import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { withEmsTransaction } from '@/lib/db/transaction';
import { CreateInvoiceForm,DirectInvoiceForm } from '@/components/invoices/invoice-form';
import { EmptyState } from '@/components/ui/empty-state';
import { clientOptions } from '@/lib/clients/service';
import { sydneyToday } from '@/lib/domain/format';
export default async function NewInvoicePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/jobs');const search=await searchParams;
  const jobs=await withEmsTransaction(tx=>tx.query<{id:string;version:number;title:string;number:string}>("select j.id,j.version,j.title,j.number from ems.jobs j join ems.job_contracts c on c.job_id=j.id and c.organization_id=j.organization_id where j.organization_id=$1 and j.archived_at is null and j.status<>'cancelled' and not exists(select 1 from ems.invoices i where i.job_id=j.id and i.organization_id=j.organization_id and i.status<>'void') order by j.updated_at desc",[tx.actor.organizationId]));
  const options=await clientOptions();
  return <><h1>New invoice</h1><p className="page-description">Copy a confirmed job contract, or write a direct customer invoice.</p><h2>From a confirmed job</h2>{jobs.length?<CreateInvoiceForm jobs={jobs} jobId={typeof search.jobId==='string'&&jobs.some(j=>j.id===search.jobId)?search.jobId:undefined} commandKey={randomUUID()}/>:<EmptyState title="No jobs ready to invoice" description="Jobs with an active full invoice are listed on their job details. You can also write a direct invoice below." action={<Link className="button" href="/jobs">Open jobs</Link>}/>}<details style={{marginTop:24}} open={search.mode==='direct'||!jobs.length}><summary>Write a direct invoice</summary>{options.clients.length?<DirectInvoiceForm {...options} today={sydneyToday()} commandKey={randomUUID()}/>:<EmptyState title="Add a customer first" description="Direct invoices belong to an active customer." action={<Link className="button" href="/clients/new">New customer</Link>}/>}</details></>;
}
