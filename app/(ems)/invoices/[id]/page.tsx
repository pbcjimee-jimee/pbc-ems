import { randomUUID } from 'node:crypto';
import { listActivity } from '@/lib/workflows/queries';
import { ActivityFeed } from '@/components/ui/activity-feed';
import Decimal from 'decimal.js';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { requireMembership } from '@/lib/auth/permissions';
import { readInvoice } from '@/lib/invoices/service';
import { money,shortDate,sydneyToday } from '@/lib/domain/format';
import { InvoiceForm,InvoiceLifecycleForm,DirectInvoiceForm } from '@/components/invoices/invoice-form';
import { PaymentForm,VoidPaymentForm } from '@/components/invoices/payment-form';
import { invoiceState } from '@/components/invoices/invoice-list';
import { clientOptions } from '@/lib/clients/service';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { MoreMenu } from '@/components/ui/more-menu';
import { Card } from '@/components/ui/card';
import { DetailList } from '@/components/ui/detail-list';
import { StatusBadge } from '@/components/ui/status';
import { Notice } from '@/components/ui/notice';
import { WorkflowTrail } from '@/components/ui/workflow-trail';
import { Icon } from '@/components/ui/icon';

export default async function InvoicePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/jobs');const {id}=await params;const search=await searchParams;const invoice=await readInvoice(id);if(!invoice)notFound();
  const directOptions=invoice.status==='draft'&&!invoice.jobId?await clientOptions():null;
  const payable=invoice.status==='issued'&&new Decimal(invoice.balance).gt(0);
  const lines=invoice.snapshot.publicLines.filter(l=>l.clientVisible);const activity=await listActivity({entityType:'invoice',entityId:id,includeRelated:true});
  return <>
    <PageHeader back={{href:'/invoices',label:'Invoices'}} eyebrow={`Invoice #${invoice.number}`} title={invoice.title}
      meta={<><StatusBadge status={invoiceState(invoice)}/><Link href={`/clients/${invoice.clientId}`}>{invoice.customer.name}</Link><span>Due {shortDate(invoice.dueOn)}</span></>}
      actions={<>
        <ButtonLink variant="secondary" href={`/invoices/${id}/print`} icon="print">Print</ButtonLink>
        <MoreMenu>
          {invoice.jobId?<Link href={`/jobs/${invoice.jobId}`}><Icon name="jobs" size={18}/>Open job</Link>:null}
          <Link href={`/clients/${invoice.clientId}`}><Icon name="clients" size={18}/>Open client</Link>
          {invoice.status==='draft'?<a href="#invoice-dates"><Icon name="edit" size={18}/>Edit dates</a>:null}
          {invoice.status!=='void'?<><hr/><a href="#void-invoice"><Icon name="archive" size={18}/>Void invoice</a></>:null}
        </MoreMenu>
        {payable?<ButtonLink href="#record-payment" icon="dollar">Record payment</ButtonLink>:null}
      </>}/>
    {search.saved?<Notice tone="success">Invoice saved.</Notice>:null}
    {invoice.status==='void'?<Notice tone="warning">This invoice is void and not payable. Its history is retained.</Notice>:null}
    {invoice.jobId?<WorkflowTrail steps={[
      {kind:'job',title:'Linked job',href:`/jobs/${invoice.jobId}`},
      {kind:'invoice',title:`#${invoice.number}`,status:invoiceState(invoice),current:true},
    ]}/>:null}

    <div className="detail-layout">
      <div className="detail-main">
        {invoice.status==='draft'?<Card title="Ready to issue?" description="Issuing confirms the invoice locally. No customer message is sent."><InvoiceLifecycleForm id={id} version={invoice.version} operation="issue" commandKey={randomUUID()}/></Card>:null}
        <Card title="Line items" flush>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Invoice lines</caption>
              <thead><tr><th scope="col">Product / service</th><th scope="col" className="align-end">Qty</th><th scope="col" className="align-end">Unit Ex GST</th><th scope="col" className="align-end">Total</th></tr></thead>
              <tbody>{lines.map(l=><tr key={l.id}><td><strong>{l.name||'Text'}</strong>{l.optional&&!l.selected?<span className="cell-sub">Optional, not included</span>:null}{l.description?<span className="cell-sub pre-wrap">{l.description}</span>:null}{l.kind==='line_item'&&!l.taxable?<span className="cell-sub">GST free</span>:null}</td><td className="align-end">{l.kind==='line_item'?l.quantity:''}</td><td className="align-end">{l.kind==='line_item'?money(l.unitPrice):''}</td><td className="align-end">{l.kind==='line_item'&&(!l.optional||l.selected)?money(new Decimal(l.quantity).times(l.unitPrice).toFixed(2)):''}</td></tr>)}</tbody>
              <tfoot>
                <tr><td colSpan={3} className="align-end">Subtotal Ex GST</td><td className="align-end">{money(invoice.subtotal)}</td></tr>
                <tr><td colSpan={3} className="align-end">GST</td><td className="align-end">{money(invoice.tax)}</td></tr>
                <tr><td colSpan={3} className="align-end">Total Inc GST</td><td className="align-end">{money(invoice.total)}</td></tr>
              </tfoot>
            </table>
          </div>
          {invoice.snapshot.terms?<div className="card-body"><h3 className="section-title">Terms</h3><p className="pre-wrap">{invoice.snapshot.terms}</p></div>:null}
        </Card>
        {payable?<div id="record-payment"><PaymentForm invoiceId={id} version={invoice.version} balance={invoice.balance} today={sydneyToday()} commandKey={randomUUID()}/></div>:null}
        <Card title="Payment history" count={invoice.payments.length} flush>
          {invoice.payments.length?<ul className="record-list">{invoice.payments.map(p=><li key={p.id} style={{alignItems:'flex-start'}}>
            <Icon name="dollar" size={18}/>
            <div className="record-main"><strong className="numeric">{money(p.amount)} AUD</strong><small>{shortDate(p.receivedOn)} · {p.method.replaceAll('_',' ')}{p.reference?` · Ref ${p.reference}`:''}</small>{p.notes?<small className="pre-wrap">{p.notes}</small>:null}
              {p.voidedAt?<small>Voided {shortDate(p.voidedAt)}. This history is retained.</small>:<details className="disclosure" style={{marginTop:8}}><summary>Void this payment</summary><VoidPaymentForm paymentId={p.id} invoiceId={id} version={invoice.version} commandKey={randomUUID()}/></details>}
            </div>
            {p.voidedAt?<StatusBadge status="void"/>:<StatusBadge status="paid" label="Received"/>}
          </li>)}</ul>:<p className="record-list-empty">No payments recorded yet.</p>}
        </Card>
        {directOptions?<details className="disclosure"><summary>Edit direct invoice draft</summary><DirectInvoiceForm invoice={invoice} {...directOptions} today={sydneyToday()} commandKey={randomUUID()}/></details>:null}
      <ActivityFeed items={activity} showEntity={true} /></div>
      <aside className="detail-side" aria-label="Invoice summary">
        <Card title="Balance">
          <p style={{fontSize:30,fontWeight:700,margin:'0 0 4px'}} className="numeric">{money(invoice.balance)}</p>
          <p className="muted" style={{fontSize:13}}>AUD outstanding{invoice.overdue?' · past due':''}</p>
          <DetailList items={[{label:'Total Inc GST',value:money(invoice.total)},{label:'Received',value:money(invoice.paid)}]}/>
        </Card>
        <Card title="Client">
          <DetailList stacked items={[
            {label:'Client',value:<><Link href={`/clients/${invoice.clientId}`}>{invoice.customer.name}</Link>{invoice.customer.company?<span className="cell-sub">{invoice.customer.company}</span>:null}</>},
            {label:'Billing address',value:<span className="pre-wrap">{invoice.customer.billingAddress||'Not recorded'}</span>},
            {label:'Work site',value:<span className="pre-wrap">{invoice.customer.propertyAddress||'Not recorded'}</span>},
          ]}/>
        </Card>
        <Card title="Dates" id="invoice-dates">
          {invoice.status==='draft'?<InvoiceForm invoice={invoice} commandKey={randomUUID()}/>:<DetailList items={[{label:'Invoice date',value:shortDate(invoice.issuedOn)},{label:'Due date',value:shortDate(invoice.dueOn)}]}/>}
        </Card>
        {invoice.status!=='void'?<Card id="void-invoice" title="Void invoice"><p className="muted" style={{fontSize:13}}>Cancel any active payment records first. Invoice and receipt history remain available.</p><InvoiceLifecycleForm id={id} version={invoice.version} operation="void" commandKey={randomUUID()}/></Card>:null}
      </aside>
    </div>
  </>;
}
