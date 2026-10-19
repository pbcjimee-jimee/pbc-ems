import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { requireMembership } from '@/lib/auth/permissions';
import { getQuoteResources } from '@/lib/quotes/service';
import { readRequest } from '@/lib/requests/service';
import { QuoteEditor } from '@/components/quotes/quote-editor';
export default async function NewQuotePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')return <div className="panel"><h1>New quote</h1><p>Administrator permission required.</p><Link href="/jobs">View assigned jobs</Link></div>;
  const params=await searchParams;const resources=await getQuoteResources();const request=params.requestId?await readRequest(params.requestId):null;
  const defaults=request?{clientId:request.clientId,propertyId:request.propertyId,requestId:request.id,title:request.title}:{clientId:params.clientId,propertyId:params.propertyId};
  return <QuoteEditor resources={resources} defaults={defaults} commandKey={randomUUID()}/>;
}
