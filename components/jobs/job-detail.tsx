import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import type React from 'react';
import Link from 'next/link';
import { JobStatusForm,ArchiveJobForm } from './job-form';
import { money,shortDate } from '@/lib/domain/format';
import { Card } from '@/components/ui/card';
import { DetailList } from '@/components/ui/detail-list';
import { StatusBadge } from '@/components/ui/status';
import { ButtonLink } from '@/components/ui/button';
import { WorkflowTrail } from '@/components/ui/workflow-trail';
import { Metric } from '@/components/ui/metric';
import { Icon } from '@/components/ui/icon';
import type { JobDetail as JobData } from '@/lib/jobs/service';

const hours=(minutes:string)=>{const m=Number(minutes);return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`;};

export function JobDetail({job,admin,activity}:{job:JobData;admin:boolean;activity?:React.ReactNode}){
  const invoice=job.invoices?.find(i=>i.status!=='void')??job.invoices?.[0];
  const lines=job.contract?.snapshot.publicLines.filter(l=>l.clientVisible)??[];
  return <>
    {admin?<WorkflowTrail steps={[
      {kind:'request',title:job.requestId?'Originating request':undefined,href:job.requestId?`/requests/${job.requestId}`:undefined,emptyLabel:'Direct job'},
      {kind:'quote',title:job.quoteId?'Source quote':undefined,href:job.quoteId?`/quotes/${job.quoteId}`:undefined,emptyLabel:'Direct contract'},
      {kind:'job',title:`#${job.number}`,status:job.status,current:true},
      {kind:'invoice',title:invoice?.number,href:invoice?`/invoices/${invoice.id}`:undefined,status:invoice?.status==='issued'?'outstanding':invoice?.status,emptyLabel:'Not invoiced'},
    ]}/>:null}
    <div className="detail-layout">
      <div className="detail-main">
        <Card title="Work scope" description="Instructions visible to assigned supervisors">
          <p className="pre-wrap">{job.description||<span className="muted">No work instructions recorded.</span>}</p>
          <h3 className="section-title">Site notes</h3>
          <p className="pre-wrap">{job.notes||<span className="muted">No site notes.</span>}</p>
        </Card>

        <Card title="Visits" count={job.visits.length} flush action={admin?<ButtonLink href={`/schedule/new?jobId=${job.id}`} variant="ghost" size="sm" icon="plus">Schedule visit</ButtonLink>:null}>
          {job.visits.length?<ul className="record-list">{job.visits.map(v=><li key={v.id}><Icon name="schedule" size={18}/><div className="record-main"><Link href={`/schedule/${v.id}`}>{v.title}</Link><small>{shortDate(v.start)}{v.end!==v.start?` – ${shortDate(v.end)}`:''}{v.allDay?' · All day':''}</small></div><StatusBadge status={v.status}/></li>)}</ul>:<p className="record-list-empty">No visits scheduled yet.{admin?<> <Link href={`/schedule/new?jobId=${job.id}`}>Schedule the first visit</Link></>:null}</p>}
        </Card>

        {admin&&job.contract?<Card title="Confirmed contract" description="Customer-visible lines fixed when the job was confirmed" flush>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Contract lines</caption>
              <thead><tr><th scope="col">Line</th><th scope="col" className="align-end">Qty</th><th scope="col" className="align-end">Unit Ex GST</th><th scope="col" className="align-end">Total</th></tr></thead>
              <tbody>{lines.map(l=><tr key={l.id}><td><strong>{l.name||'Text'}</strong>{l.optional&&!l.selected?<span className="cell-sub">Optional, not included</span>:null}{l.description?<span className="cell-sub pre-wrap">{l.description}</span>:null}</td><td className="align-end">{l.kind==='line_item'?l.quantity:''}</td><td className="align-end">{l.kind==='line_item'?money(l.unitPrice):''}</td><td className="align-end">{l.kind==='line_item'&&(!l.optional||l.selected)?money(new Decimal(l.quantity).times(l.unitPrice).toFixed(2)):''}</td></tr>)}</tbody>
            </table>
          </div>
          {job.contract.snapshot.terms?<div className="card-body"><h3 className="section-title">Terms</h3><p className="pre-wrap">{job.contract.snapshot.terms}</p></div>:null}
        </Card>:null}

        <Card title={job.actuals.scope==='own'?'Your expenses and time':'Expenses and time'} description={job.actuals.scope==='own'?'Only your own entries for this job.':'All workers’ entries. Archived expenses and running timers are excluded.'} action={<div className="inline"><ButtonLink href={`/expenses/new?jobId=${job.id}`} variant="secondary" size="sm" icon="expenses">Expense</ButtonLink><ButtonLink href={`/timesheets?jobId=${job.id}`} variant="secondary" size="sm" icon="clock">Time</ButtonLink></div>}>
          <div className="metric-grid" style={{marginBottom:16}}>
            <Metric label="Expenses" value={`${money(job.actuals.expenseTotal)}`} hint="AUD, receipt totals"/>
            <Metric label="Closed worked time" value={hours(job.actuals.workedMinutes)} hint="Unpaid breaks deducted"/>
            <Metric label="Running timers" value={job.actuals.runningTimers}/>
          </div>
          {job.expenses.length?<><h3 className="section-title">Expenses</h3><ul className="record-list" style={{margin:'0 -20px'}}>{job.expenses.map(e=><li key={e.id}><Icon name="expenses" size={18}/><div className="record-main"><Link href={`/expenses/${e.id}`}>{e.title}</Link></div></li>)}</ul></>:null}
          {job.timeEntries.length?<><h3 className="section-title">Time entries</h3><ul className="record-list" style={{margin:'0 -20px'}}>{job.timeEntries.map(t=><li key={t.id}><Icon name="clock" size={18}/><div className="record-main"><Link href={`/timesheets?entryId=${t.id}`}>{shortDate(t.startedAt)}</Link></div><StatusBadge status={t.status}/></li>)}</ul></>:null}
          {!job.expenses.length&&!job.timeEntries.length?<p className="muted" style={{margin:0}}>No accessible expenses or time entries for this job yet.</p>:null}
        </Card>
      {activity}</div>

      <aside className="detail-side" aria-label="Job summary">
        <Card title="Job details">
          <DetailList items={[
            {label:'Job number',value:`#${job.number}`},
            {label:'Client',value:<Link href={`/clients/${job.clientId}`}>{job.clientName}</Link>},
            {label:'Work site',value:job.address??<span className="muted">No site</span>},
            {label:'Request',value:<Link href={`/requests/${job.requestId}`}>Open request</Link>,hidden:!job.requestId},
          ]}/>
          <h3 className="section-title">Update status</h3>
          <JobStatusForm id={job.id} version={job.version} status={job.status} commandKey={randomUUID()}/>
        </Card>
        {admin&&job.contract?<Card title="Billing">
          <DetailList items={[
            {label:'Subtotal',value:`${money(job.contract.subtotal)} Ex GST`},
            {label:'GST',value:money(job.contract.tax)},
            {label:'Contract total',value:<strong>{money(job.contract.total)} AUD</strong>},
          ]}/>
          <h3 className="section-title">Invoices</h3>
          {job.invoices?.length?<ul className="record-list" style={{margin:'0 -20px'}}>{job.invoices.map(i=><li key={i.id}><div className="record-main"><Link href={`/invoices/${i.id}`}>{i.number}</Link></div><StatusBadge status={i.status==='issued'?'outstanding':i.status}/></li>)}</ul>:<p className="muted" style={{fontSize:13}}>No invoice created.</p>}
          {!job.invoices?.some(i=>i.status!=='void')&&job.status!=='cancelled'?<ButtonLink href={`/invoices/new?jobId=${job.id}`} variant="secondary" className="button-block" icon="invoices">Create full invoice</ButtonLink>:null}
        </Card>:null}
        {admin?<Card id="archive-job" title={job.archivedAt?'Restore job':'Archive job'}><p className="muted" style={{fontSize:13}}>Archived jobs keep their visits, time and invoices on record.</p><ArchiveJobForm id={job.id} version={job.version} archived={!!job.archivedAt} commandKey={randomUUID()}/></Card>:null}
      </aside>
    </div>
  </>;
}
