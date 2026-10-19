import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status';
import { ButtonLink } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import type { InvoiceSummary } from '@/lib/invoices/service';
import { money,shortDate } from '@/lib/domain/format';

export function invoiceState(i:Pick<InvoiceSummary,'status'|'paymentStatus'|'overdue'>){return i.status==='issued'?(i.overdue?'overdue':i.paymentStatus):i.status;}

export function InvoiceList({items,filtered=false}:{items:InvoiceSummary[];filtered?:boolean}){
  if(!items.length)return <EmptyState icon="invoices" title={filtered?'No invoices match':'No invoices yet'} description={filtered?'Change the status or search to find an invoice.':'Create an invoice from a confirmed job contract.'} action={<ButtonLink href="/invoices/new" icon="plus">New invoice</ButtonLink>}/>;
  return <DataTable caption="Invoices" rows={items} rowKey={i=>i.id} columns={[
    {key:'title',header:'Invoice',primary:true,cell:i=><><Link href={`/invoices/${i.id}`}>{i.title}</Link><span className="cell-sub">#{i.number}</span></>},
    {key:'client',header:'Client',cell:i=><Link href={`/clients/${i.clientId}`}>{i.clientName}</Link>},
    {key:'due',header:'Due',cell:i=>i.dueOn?<span style={i.overdue?{color:'var(--color-danger)',fontWeight:600}:undefined}>{shortDate(i.dueOn)}</span>:<span className="muted">Not set</span>},
    {key:'status',header:'Status',cell:i=><StatusBadge status={invoiceState(i)}/>},
    {key:'total',header:'Total',align:'end',hideOnMobile:true,cell:i=>money(i.total)},
    {key:'balance',header:'Balance',align:'end',cell:i=><strong>{money(i.balance)}</strong>},
  ]}/>;
}
