import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { requireMembership } from '@/lib/auth/permissions';
import { getQuoteResources } from '@/lib/quotes/service';
import { QuoteSettings } from '@/components/quotes/settings';
export default async function QuoteSettingsPage(){
  const actor=await requireMembership();if(actor.role!=='admin')return <div className="panel"><h1>Quote settings</h1><p>Administrator permission required.</p><Link href="/jobs">View assigned jobs</Link></div>;
  const resources=await getQuoteResources();return <><div className="page-header"><div><Link href="/quotes">Quotes</Link><h1>Products, rates &amp; templates</h1><p className="page-description">Changes apply to new selections. Saved quote snapshots retain their original prices and settings.</p></div><Link className="button" href="/quotes/new">New quote</Link></div><QuoteSettings resources={resources} commandKey={randomUUID()}/></>;
}
