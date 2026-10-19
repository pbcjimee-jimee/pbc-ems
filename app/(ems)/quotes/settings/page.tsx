import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { requireMembership } from '@/lib/auth/permissions';
import { getQuoteResources } from '@/lib/quotes/service';
import { QuoteSettings } from '@/components/quotes/settings';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
export default async function QuoteSettingsPage(){
  const actor=await requireMembership();if(actor.role!=='admin')return <div className="panel"><h1>Quote settings</h1><p>Administrator permission required.</p><Link href="/jobs">View assigned jobs</Link></div>;
  const resources=await getQuoteResources();return <><PageHeader back={{href:'/quotes',label:'Quotes'}} title="Products, rates & templates" description="Changes apply to new selections. Saved quote snapshots retain their original prices and settings." actions={<ButtonLink href="/quotes/new" icon="plus">New quote</ButtonLink>}/><QuoteSettings resources={resources} commandKey={randomUUID()}/></>;
}
