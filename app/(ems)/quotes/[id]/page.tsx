import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { getQuoteEditor, getQuoteRevision } from '@/lib/quotes/service';
import { money } from '@/lib/domain/format';
import { Status } from '@/components/ui/status';
import { QuoteStatusActions } from '@/components/quotes/status-actions';
import { Summary } from '@/components/quotes/summary';
import styles from '@/components/quotes/quotes.module.css';
export default async function QuotePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')return <div className="panel"><h1>Quote</h1><p>Administrator permission required.</p><Link href="/jobs">View assigned jobs</Link></div>;
  const {id}=await params;const query=await searchParams;const quote=await getQuoteEditor(id);if(!quote)notFound();
  const old=query.revision&&quote.history.some(r=>r.id===query.revision)?await getQuoteRevision(query.revision):null;const revision=old??quote.revision;
  return <div className={styles.detail}><div className="page-header"><div><Link href="/quotes">Quotes</Link><h1>{quote.number} · {quote.title}</h1><Status>{quote.status.replaceAll('_',' ')}</Status><p className="page-description">Revision {revision.revisionNumber} · {revision.status.replaceAll('_',' ')}</p></div><div className="toolbar">{quote.status!=='archived'&&<Link className="button" href={'/quotes/'+id+'/edit'}>{quote.status==='approved'?'Create editing revision':'Edit quote'}</Link>}<Link className="button button-secondary" href={'/quotes/'+id+'/print?revision='+revision.id}>Print / PDF</Link>{quote.approvedRevisionId&&<Link className="button button-secondary" href={'/jobs/new?quoteId='+id}>Create job from approved quote</Link>}</div></div>
    {old&&<p className="alert">Viewing saved revision {old.revisionNumber}. <Link href={'/quotes/'+id}>Return to current revision</Link></p>}
    <section className={styles.section}><h2>Customer &amp; site</h2><div className={styles.grid}><div><h3>{revision.customer.name}</h3>{revision.customer.company&&<p>{revision.customer.company}</p>}<p>{revision.customer.email}<br/>{revision.customer.phone}</p></div><div><h3>Site address</h3><p>{revision.customer.propertyAddress??'No site selected'}</p><h3>Billing address</h3><p>{revision.customer.billingAddress??'Not provided'}</p></div><div><h3>Quote details</h3><p>{revision.snapshot.workType}<br/>Valid until {quote.validUntil??'not set'}</p><strong>{money(revision.total)} Inc GST</strong></div></div><QuoteStatusActions key={quote.version} quote={quote} commandKey={randomUUID()}/></section>
    <section className={styles.section}><h2>Customer scope</h2>{revision.snapshot.publicLines.map(line=><div key={line.id} className={styles.row}><h3>{line.name||'Text'}</h3><p style={{whiteSpace:'pre-wrap'}}>{line.description}</p>{line.kind==='line_item'&&<p>{line.quantity} × {money(line.unitPrice)} Ex GST{line.taxable?' · GST taxable':' · GST free'}</p>}<small>{line.clientVisible?'Customer visible':'Internal / hidden'}{line.optional?' · Optional':''}{line.optional?(line.selected?' · Selected':' · Not selected'):''}</small></div>)}<h3>Terms</h3><p style={{whiteSpace:'pre-wrap'}}>{revision.snapshot.terms||'No terms entered.'}</p></section>
    <section className={styles.section}><h2>Internal estimate &amp; reconciliation</h2><Summary calculation={revision.calculation} lines={revision.snapshot.publicLines}/><h3>Internal memo</h3><p style={{whiteSpace:'pre-wrap'}}>{revision.internalMemo||'No internal memo.'}</p></section>
    <section className={styles.section}><h2>Revision history</h2><ul className={styles.list}>{quote.history.map(r=><li key={r.id}><Link href={'/quotes/'+id+'?revision='+r.id}>Revision {r.revisionNumber}{r.id===quote.approvedRevisionId?' · Approved contract':''}</Link><span>{r.status.replaceAll('_',' ')} · {money(r.total)} Inc GST</span></li>)}</ul></section>
  </div>;
}
