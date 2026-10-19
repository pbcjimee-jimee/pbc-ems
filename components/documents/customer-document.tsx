import Link from 'next/link';
import Decimal from 'decimal.js';
import type { CustomerDocument } from '@/lib/documents/types';
import { money,shortDate } from '@/lib/domain/format';
import { PrintButton } from './print-button';
import styles from './document.module.css';

export function CustomerDocumentView({document:d}:{document:CustomerDocument}){
  const invoice=d.kind==='invoice';
  const voided=invoice&&d.status==='void';
  return <div className={styles.printRoot}>
    <div className={styles.tools}><Link href={`/${invoice?'invoices':'quotes'}/${d.id}`} className="button button-secondary">Back to {d.kind}</Link><span>Customer copy · Internal calculations are excluded</span><PrintButton/></div>
    <article className={styles.paper} aria-label={`Customer ${d.kind} ${d.number}`}>
      <header className={styles.heading}><div><strong className={styles.brand}>{d.company.name}</strong>{d.company.legalName&&<div>{d.company.legalName}</div>}{d.company.abn&&<div>ABN {d.company.abn}</div>}<address>{[d.company.address,d.company.email,d.company.phone].filter(Boolean).join('\n')}</address></div><div className={styles.documentTitle}><h1>{invoice?'Tax invoice':'Quote'}</h1><strong>{d.number}</strong><p>{d.status.replaceAll('_',' ')}{d.status==='draft'?' · For review':''}</p></div></header>
      <div className={styles.parties}><section><h2>Prepared for</h2><strong>{d.customer.name}</strong>{d.customer.company&&<div>{d.customer.company}</div>}<address>{d.customer.billingAddress}</address>{d.customer.email&&<div>{d.customer.email}</div>}{d.customer.phone&&<div>{d.customer.phone}</div>}</section><section><dl><div><dt>Date</dt><dd>{shortDate(d.date)}</dd></div>{d.dueDate&&<div><dt>{invoice?(voided?'Original due date':'Payment due'):'Valid until'}</dt><dd>{shortDate(d.dueDate)}</dd></div>}<div><dt>Currency</dt><dd>AUD</dd></div></dl></section></div>
      <section className={styles.scope}><h2>{d.title}</h2>{d.customer.propertyAddress&&<p><strong>Site:</strong> {d.customer.propertyAddress}</p>}</section>
      {voided&&<p className={styles.voidNotice}><strong>VOID — NOT PAYABLE</strong><br/>This invoice has been cancelled. Amounts below are retained for your records. No payment is due.</p>}
      <table className={styles.lines}><thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Rate</th><th scope="col">Amount</th></tr></thead><tbody>{d.lines.map((line,i)=>line.kind==='text'?<tr key={i}><td colSpan={4}><strong>{line.name}</strong><p>{line.description}</p></td></tr>:<tr key={i}><td><strong>{line.name}</strong><p>{line.description}</p>{line.optional&&<p className={styles.option}>{line.selected?'Selected option · Included in total':'Optional · Excluded from total'}</p>}{!line.taxable&&<small>GST free</small>}</td><td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td>{money(new Decimal(line.quantity||0).mul(line.unitPrice||0).toDecimalPlaces(2).toFixed(2))}</td></tr>)}</tbody></table>
      <div className={styles.totals}><dl><div><dt>Subtotal</dt><dd>{money(d.subtotal)}</dd></div><div><dt>GST</dt><dd>{money(d.tax)}</dd></div><div className={styles.total}><dt>{voided?'Original total incl. GST':'Total incl. GST'}</dt><dd>{money(d.total)}</dd></div>{invoice&&<><div><dt>Payments received</dt><dd>{money(d.paid)}</dd></div><div className={styles.total}><dt>{voided?'Amount payable':'Balance due'}</dt><dd>{money(d.balance)}</dd></div></>}</dl></div>
      {d.terms&&<section className={styles.terms}><h2>Terms and inclusions</h2><p>{d.terms}</p></section>}
      {invoice&&!voided&&d.company.bankDetails&&<section className={styles.terms}><h2>Payment details</h2><p>{d.company.bankDetails}</p><small>Please use {d.number} as your payment reference.</small></section>}
      <footer className={styles.paperFooter}>{d.company.name} · {d.number} · All amounts in AUD</footer>
    </article>
  </div>
}
