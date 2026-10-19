import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { clientOptions } from '@/lib/clients/service';
import { getQuoteEditor } from '@/lib/quotes/service';
import { readRequest } from '@/lib/requests/service';
import { withEmsTransaction } from '@/lib/db/transaction';
import { JobForm,ConvertQuoteForm } from '@/components/jobs/job-form';
import { EmptyState } from '@/components/ui/empty-state';
import { money } from '@/lib/domain/format';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import type { CommercialSnapshot,CustomerSnapshot } from '@/lib/documents/types';
export default async function NewJobPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/jobs');const search=await searchParams;
  if(typeof search.quoteId==='string'){
    const quote=await getQuoteEditor(search.quoteId);
    const revision=quote?.approvedRevisionId?await withEmsTransaction(async tx=>(await tx.query<{snapshot:CommercialSnapshot;customer:CustomerSnapshot;total:string}>('select snapshot,customer_snapshot as customer,total from ems.quote_revisions where id=$1 and organization_id=$2 and status=\'approved\'',[quote.approvedRevisionId,tx.actor.organizationId]))[0]):null;
    return <div className="form-page"><PageHeader back={{href:'/quotes/'+search.quoteId,label:'Quote'}} title="Convert quote to job" description="The approved revision’s client, site, accepted lines, prices and terms will be retained."/>{quote&&revision?<Card title={`#${quote.number} · ${quote.title}`}><p>{revision.customer.name}<br/>{revision.customer.propertyAddress}</p><p>Confirmed contract: <strong>{money(revision.total)} AUD Inc GST</strong></p><ConvertQuoteForm quoteId={quote.id} version={quote.version} commandKey={randomUUID()}/></Card>:<EmptyState icon="quotes" title="No approved revision" description="Open the quote and approve an issued revision before creating its job." action={<Link href="/quotes" className="button">Open quotes</Link>}/>}</div>;
  }
  const request=typeof search.requestId==='string'?await readRequest(search.requestId):null;
  if(typeof search.requestId==='string'&&!request)return <><PageHeader back={{href:'/jobs',label:'Jobs'}} title="New job"/><EmptyState icon="requests" title="Request not found" description="Open an accessible request to create its job." action={<Link className="button" href="/requests">Open requests</Link>}/></>;
  const options=await clientOptions();return <div className="form-page"><PageHeader back={request?{href:'/requests/'+request.id,label:'Request'}:{href:'/jobs',label:'Jobs'}} title="New job" description={<>Confirm a direct contract, or <Link href="/quotes?status=approved">convert an approved quote</Link>.</>}/>{options.clients.length?<JobForm {...options} defaultClientId={typeof search.clientId==='string'&&options.clients.some(c=>c.id===search.clientId)?search.clientId:undefined} request={request?{id:request.id,clientId:request.clientId,propertyId:request.propertyId,clientName:request.clientName,address:request.address,title:request.title,description:request.description}:undefined} commandKey={randomUUID()}/>:<EmptyState icon="clients" title="Add a client first" description="A confirmed job belongs to an active client." action={<Link className="button" href="/clients/new">New client</Link>}/>}</div>;
}
