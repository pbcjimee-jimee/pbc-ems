import { randomUUID } from 'node:crypto';
import { listActivity } from '@/lib/workflows/queries';
import { ActivityFeed } from '@/components/ui/activity-feed';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { getQuoteEditor, getQuoteRevision } from '@/lib/quotes/service';
import { money,shortDate } from '@/lib/domain/format';
import { QuoteStatusActions } from '@/components/quotes/status-actions';
import { Summary } from '@/components/quotes/summary';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { MoreMenu } from '@/components/ui/more-menu';
import { Card } from '@/components/ui/card';
import { DetailList } from '@/components/ui/detail-list';
import { StatusBadge } from '@/components/ui/status';
import { Notice } from '@/components/ui/notice';
import { EmptyState } from '@/components/ui/empty-state';
import { WorkflowTrail } from '@/components/ui/workflow-trail';
import { Icon } from '@/components/ui/icon';
import Decimal from 'decimal.js';

export default async function QuotePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')return <EmptyState icon="quotes" title="Administrator permission required" description="Quote prices and calculations are restricted." action={<ButtonLink href="/jobs">View assigned jobs</ButtonLink>}/>;
  const {id}=await params;const query=await searchParams;const quote=await getQuoteEditor(id);if(!quote)notFound();
  const old=query.revision&&quote.history.some(r=>r.id===query.revision)?await getQuoteRevision(query.revision):null;const revision=old??quote.revision;
  const lines=revision.snapshot.publicLines;const activity=await listActivity({entityType:'quote',entityId:id});
  const primary=quote.approvedRevisionId?<ButtonLink href={'/jobs/new?quoteId='+id} icon="jobs">Convert to job</ButtonLink>:quote.status!=='archived'?<ButtonLink href={'/quotes/'+id+'/edit'} icon="edit">Edit quote</ButtonLink>:null;
  return <>
    <PageHeader back={{href:'/quotes',label:'Quotes'}} eyebrow={`Quote #${quote.number} · Revision ${revision.revisionNumber}`} title={quote.title}
      meta={<><StatusBadge status={quote.status}/><Link href={`/clients/${quote.clientId}`}>{revision.customer.name}</Link><span className="numeric"><strong>{money(revision.total)}</strong> Inc GST</span></>}
      actions={<>
        <ButtonLink variant="secondary" href={'/quotes/'+id+'/print?revision='+revision.id} icon="print">Print / PDF</ButtonLink>
        <MoreMenu>
          {quote.status!=='archived'&&quote.approvedRevisionId?<Link href={'/quotes/'+id+'/edit'}><Icon name="edit" size={18}/>Create editing revision</Link>:null}
          {quote.requestId?<Link href={'/requests/'+quote.requestId}><Icon name="requests" size={18}/>Open request</Link>:null}
          <Link href={`/clients/${quote.clientId}`}><Icon name="clients" size={18}/>Open client</Link>
          <hr/>
          <a href="#quote-status"><Icon name="check" size={18}/>Record customer decision</a>
          <a href="#revisions"><Icon name="copy" size={18}/>Revision history</a>
        </MoreMenu>
        {primary}
      </>}/>
    {old?<Notice tone="warning">Viewing saved revision {old.revisionNumber}. <Link href={'/quotes/'+id}>Return to current revision</Link></Notice>:null}
    <WorkflowTrail steps={[
      {kind:'request',title:quote.requestId?'Originating request':undefined,href:quote.requestId?'/requests/'+quote.requestId:undefined,emptyLabel:'No request'},
      {kind:'quote',title:`#${quote.number}`,status:quote.status,current:true},
      {kind:'job',title:quote.approvedRevisionId?'Create or open job':undefined,href:quote.approvedRevisionId?'/jobs/new?quoteId='+id:undefined,emptyLabel:'Awaiting approval'},
    ]}/>

    <div className="detail-layout">
      <div className="detail-main">
        <Card title="Customer scope" description="Exactly what the customer sees on the printed quote" flush>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Customer quote lines</caption>
              <thead><tr><th scope="col">Product / service</th><th scope="col" className="align-end">Qty</th><th scope="col" className="align-end">Unit Ex GST</th><th scope="col" className="align-end">Total</th></tr></thead>
              <tbody>{lines.map(line=><tr key={line.id} style={line.clientVisible?undefined:{opacity:.65}}>
                <td><strong>{line.name||'Text'}</strong>{line.description?<span className="cell-sub pre-wrap">{line.description}</span>:null}<span className="inline" style={{marginTop:6}}>{!line.clientVisible?<StatusBadge status="hidden" label="Internal / hidden" tone="neutral"/>:null}{line.optional?<StatusBadge status="optional" label={line.selected?'Optional · Selected':'Optional · Not selected'} tone={line.selected?'success':'warning'}/>:null}{line.kind==='line_item'&&!line.taxable?<StatusBadge status="gst" label="GST free" tone="neutral"/>:null}</span></td>
                <td className="align-end">{line.kind==='line_item'?line.quantity:''}</td>
                <td className="align-end">{line.kind==='line_item'?money(line.unitPrice):''}</td>
                <td className="align-end">{line.kind==='line_item'?(!line.optional||line.selected?money(new Decimal(line.quantity).times(line.unitPrice).toFixed(2)):<span className="muted">Not included</span>):''}</td>
              </tr>)}</tbody>
              <tfoot>
                <tr><td colSpan={3} className="align-end">Subtotal Ex GST</td><td className="align-end">{money(revision.subtotal)}</td></tr>
                <tr><td colSpan={3} className="align-end">GST</td><td className="align-end">{money(revision.tax)}</td></tr>
                <tr><td colSpan={3} className="align-end">Total Inc GST</td><td className="align-end">{money(revision.total)}</td></tr>
              </tfoot>
            </table>
          </div>
          <div className="card-body"><h3 className="section-title">Terms</h3><p className="pre-wrap">{revision.snapshot.terms||<span className="muted">No terms entered.</span>}</p></div>
        </Card>
        <details className="disclosure">
          <summary>Internal estimate &amp; reconciliation</summary>
          <div><Summary calculation={revision.calculation} lines={lines}/><h3 className="section-title">Internal memo</h3><p className="pre-wrap">{revision.internalMemo||<span className="muted">No internal memo.</span>}</p></div>
        </details>
        <Card id="revisions" title="Revision history" count={quote.history.length} flush>
          <ul className="record-list">{quote.history.map(r=><li key={r.id}><div className="record-main"><Link href={'/quotes/'+id+'?revision='+r.id}>Revision {r.revisionNumber}</Link>{r.id===quote.approvedRevisionId?<small>Approved contract</small>:null}</div><span className="record-end"><StatusBadge status={r.status}/><strong>{money(r.total)}</strong></span></li>)}</ul>
        </Card>
      <ActivityFeed items={activity} showEntity={false} /></div>
      <aside className="detail-side" aria-label="Quote summary">
        <Card id="quote-status" title="Quote status" description="Record the customer’s decision">
          <QuoteStatusActions key={quote.version} quote={quote} commandKey={randomUUID()}/>
        </Card>
        <Card title="Client and site">
          <DetailList stacked items={[
            {label:'Client',value:<><Link href={`/clients/${quote.clientId}`}>{revision.customer.name}</Link>{revision.customer.company?<span className="cell-sub">{revision.customer.company}</span>:null}</>},
            {label:'Contact',value:<>{revision.customer.email?<a href={`mailto:${revision.customer.email}`}>{revision.customer.email}</a>:null}{revision.customer.phone?<span className="cell-sub">{revision.customer.phone}</span>:null}</>,hidden:!revision.customer.email&&!revision.customer.phone},
            {label:'Work site',value:<span className="pre-wrap">{revision.customer.propertyAddress??'No site selected'}</span>},
            {label:'Billing address',value:<span className="pre-wrap">{revision.customer.billingAddress??'Not provided'}</span>},
          ]}/>
        </Card>
        <Card title="Quote details">
          <DetailList items={[
            {label:'Work type',value:revision.snapshot.workType??'—'},
            {label:'Valid until',value:quote.validUntil?shortDate(quote.validUntil):<span className="muted">Not set</span>},
            {label:'Revision',value:`${revision.revisionNumber} · ${revision.status.replaceAll('_',' ')}`},
            {label:'Total',value:<strong>{money(revision.total)} AUD</strong>},
          ]}/>
        </Card>
      </aside>
    </div>
  </>;
}
