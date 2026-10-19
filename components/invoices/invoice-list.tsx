import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { Status } from '@/components/ui/status';
import type { InvoiceSummary } from '@/lib/invoices/service';
import { money,shortDate } from '@/lib/domain/format';
export function InvoiceList({items}:{items:InvoiceSummary[]}){
  if(!items.length)return <EmptyState title="No invoices found" description="Change the filters or create an invoice from a confirmed job contract." action={<Link className="button" href="/invoices/new">New invoice</Link>}/>;
  return <ul style={{listStyle:'none',padding:0}}>{items.map(i=><li className="panel" key={i.id} style={{marginBottom:12}}><div className="page-header" style={{marginBottom:8}}><h2><Link href={`/invoices/${i.id}`}>{i.number} · {i.title}</Link></h2><Status tone={i.overdue?'danger':i.paymentStatus==='paid'?'success':'info'}>{i.paymentStatus}{i.overdue?' · Overdue':''}</Status></div><p>{i.clientName} · Due {shortDate(i.dueOn)}</p><p style={{fontVariantNumeric:'tabular-nums'}}>Total: {money(i.total)} · Received: {money(i.paid)} · <strong>Balance: {money(i.balance)} AUD</strong></p></li>)}</ul>;
}
