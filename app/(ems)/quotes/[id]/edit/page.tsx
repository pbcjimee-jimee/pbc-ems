import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { getQuoteEditor, getQuoteResources } from '@/lib/quotes/service';
import { QuoteEditor } from '@/components/quotes/quote-editor';
export default async function EditQuotePage({params}:{params:Promise<{id:string}>}){
  const actor=await requireMembership();if(actor.role!=='admin')return <div className="panel"><h1>Edit quote</h1><p>Administrator permission required.</p><Link href="/jobs">View assigned jobs</Link></div>;
  const {id}=await params;const [quote,resources]=await Promise.all([getQuoteEditor(id),getQuoteResources()]);if(!quote)notFound();
  if(quote.status==='archived')return <div className="panel"><h1>{quote.number} is archived</h1><p>Duplicate this quote from its details to start a new draft.</p><Link href={'/quotes/'+id}>Open quote</Link></div>;
  return <QuoteEditor quote={quote} resources={resources} commandKey={randomUUID()}/>;
}
