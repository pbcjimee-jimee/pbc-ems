import { randomUUID } from "node:crypto";
import { listActivity } from '@/lib/workflows/queries';
import { ActivityFeed } from '@/components/ui/activity-feed';
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth/permissions";
import { readClient } from "@/lib/clients/service";
import { ClientForm, ArchiveClientForm } from "@/components/clients/client-form";
import { PropertyForm } from "@/components/clients/property-form";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { Notice } from "@/components/ui/notice";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { money, shortDate } from "@/lib/domain/format";
import styles from "@/components/clients/clients.module.css";

const savedMessages: Record<string, string> = { client: "Client details saved.", site: "Work site saved.", status: "Client status updated." };

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const search = await searchParams; const actor = await requireMembership(); const client = await readClient(id); if (!client) notFound(); const admin = actor.role === "admin";
  const editable = admin && !client.archivedAt;const activity = admin ? await listActivity({ entityType: 'client', entityId: id, includeRelated: true }) : [];
  const saved = typeof search.saved === "string" ? savedMessages[search.saved] ?? "Changes saved." : null;
  return <>
    <PageHeader back={{ href: "/clients", label: "Clients" }} title={<span className="inline" style={{ gap: 12 }}><Avatar name={client.displayName} size="lg" />{client.displayName}</span>}
      meta={<><StatusBadge status={client.archivedAt ? "archived" : "active"} />{client.companyName ? <span>{client.companyName}</span> : null}<span>{client.properties.filter(p => !p.archivedAt).length} work site{client.properties.filter(p => !p.archivedAt).length === 1 ? "" : "s"}</span></>}
      actions={editable ? <>
        <MoreMenu>
          <span className="menu-label">Create for this client</span>
          <Link href={`/quotes/new?clientId=${id}`}><Icon name="quotes" size={18} />New quote</Link>
          <Link href={`/jobs/new?clientId=${id}`}><Icon name="jobs" size={18} />New job</Link>
          <Link href="/invoices/new?mode=direct"><Icon name="invoices" size={18} />New invoice</Link>
          <hr />
          <a href="#edit-client"><Icon name="edit" size={18} />Edit client details</a>
          <a href="#add-site"><Icon name="pin" size={18} />Add work site</a>
          <a href="#archive-client"><Icon name="archive" size={18} />Archive client</a>
        </MoreMenu>
        <ButtonLink href={`/requests/new?clientId=${id}`} icon="plus">New request</ButtonLink>
      </> : null} />
    {saved ? <Notice tone="success">{saved}</Notice> : null}
    {client.archivedAt ? <Notice tone="warning">This client is archived. Past work stays on record, but new requests are blocked until the client is restored.</Notice> : null}

    <div className="detail-layout">
      <div className="detail-main">
        <Card id="sites" title="Work sites" count={client.properties.length} flush action={editable ? <ButtonLink href="#add-site" variant="ghost" size="sm" icon="plus">Add site</ButtonLink> : null}>
          {client.properties.length ? <ul className={styles.sites}>{client.properties.map(property => <li key={property.id} className={styles.site}>
            <div className={styles.siteHead}>
              <div>
                <h3>{property.label}{property.archivedAt ? <StatusBadge status="archived" /> : null}</h3>
                <p className={styles.siteAddress}><Icon name="pin" size={15} />{property.address}</p>
              </div>
              {editable && !property.archivedAt ? <div className={styles.siteActions}><ButtonLink size="sm" variant="secondary" href={`/requests/new?clientId=${id}&propertyId=${property.id}`}>New request</ButtonLink><ButtonLink size="sm" variant="ghost" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`} target="_blank" rel="noreferrer">Map</ButtonLink></div> : null}
            </div>
            {property.notes ? <p className={styles.siteNotes}>{property.notes}</p> : null}
            {editable ? <details className={`disclosure ${styles.siteEdit}`}><summary>Edit site</summary><PropertyForm clientId={id} property={property} commandKey={randomUUID()} /></details> : null}
          </li>)}</ul> : <p className="record-list-empty">No work sites yet. Add the work address separately from the billing address.</p>}
        </Card>

        <Card id="requests" title="Requests" count={client.requests.length} flush action={editable ? <ButtonLink href={`/requests/new?clientId=${id}`} variant="ghost" size="sm" icon="plus">New</ButtonLink> : null}>
          {client.requests.length ? <ul className="record-list">{client.requests.map(request => <li key={request.id}><Icon name="requests" size={18} /><div className="record-main"><Link href={`/requests/${request.id}`}>{request.title}</Link></div><StatusBadge status={request.status} /></li>)}</ul> : <p className="record-list-empty">No requests yet.</p>}
        </Card>

        <Card id="jobs" title="Jobs" count={client.jobs.length} flush action={editable ? <ButtonLink href={`/jobs/new?clientId=${id}`} variant="ghost" size="sm" icon="plus">New</ButtonLink> : null}>
          {client.jobs.length ? <ul className="record-list">{client.jobs.map(job => <li key={job.id}><Icon name="jobs" size={18} /><div className="record-main"><Link href={`/jobs/${job.id}`}>{job.title}</Link><small>#{job.number}</small></div><StatusBadge status={job.status} /></li>)}</ul> : <p className="record-list-empty">No jobs yet.</p>}
        </Card>

        {client.quotes ? <Card id="quotes" title="Quotes" count={client.quotes.length} flush action={editable ? <ButtonLink href={`/quotes/new?clientId=${id}`} variant="ghost" size="sm" icon="plus">New</ButtonLink> : null}>
          {client.quotes.length ? <ul className="record-list">{client.quotes.map(quote => <li key={quote.id}><Icon name="quotes" size={18} /><div className="record-main"><Link href={`/quotes/${quote.id}`}>{quote.title}</Link><small>#{quote.number}</small></div><span className="record-end"><StatusBadge status={quote.status} /><strong>{money(quote.total)}</strong></span></li>)}</ul> : <p className="record-list-empty">No quotes yet.</p>}
        </Card> : null}

        {client.invoices ? <Card id="invoices" title="Invoices" count={client.invoices.length} flush>
          {client.invoices.length ? <ul className="record-list">{client.invoices.map(invoice => <li key={invoice.id}><Icon name="invoices" size={18} /><div className="record-main"><Link href={`/invoices/${invoice.id}`}>{invoice.title}</Link><small>#{invoice.number} · Due {shortDate(invoice.dueOn)}</small></div><span className="record-end"><StatusBadge status={invoice.overdue ? "overdue" : invoice.status === "issued" ? "outstanding" : invoice.status} label={invoice.status === "issued" && !invoice.overdue && Number(invoice.balance) <= 0 ? "Paid" : undefined} tone={invoice.status === "issued" && !invoice.overdue && Number(invoice.balance) <= 0 ? "success" : undefined} /><strong>{money(invoice.balance)}</strong></span></li>)}</ul> : <p className="record-list-empty">No invoices yet.</p>}
        </Card> : null}

        {editable ? <details className="disclosure" id="add-site"><summary>Add a work site</summary><PropertyForm clientId={id} commandKey={randomUUID()} /></details> : null}
        {admin ? <details className="disclosure" id="edit-client"><summary>Edit client details</summary><ClientForm client={client} commandKey={randomUUID()} /></details> : null}
      {admin ? <ActivityFeed items={activity} showEntity={true} /> : null}</div>

      <aside className="detail-side" aria-label="Client summary">
        {client.receivables ? <Card title="Billing">
          <p className="numeric" style={{ fontSize: 28, fontWeight: 700, margin: "0 0 2px" }}>{money(client.receivables.outstandingAmount)}</p>
          <p className="muted" style={{ fontSize: 13 }}>Outstanding on {client.receivables.outstandingCount} issued invoice{client.receivables.outstandingCount === 1 ? "" : "s"}</p>
          {client.receivables.overdueCount ? <p className="alert notice-danger" style={{ margin: 0, fontSize: 13 }}><strong>{money(client.receivables.overdueAmount)}</strong> past due on {client.receivables.overdueCount} invoice{client.receivables.overdueCount === 1 ? "" : "s"}</p> : null}
        </Card> : null}
        <Card title="Contact">
          <p className={styles.contact}><Icon name="mail" size={16} />{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : <span className="muted">No email</span>}</p>
          <p className={styles.contact}><Icon name="phone" size={16} />{client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : <span className="muted">No phone</span>}</p>
          {admin ? <>
            <h3 className="section-title">Billing address</h3>
            <p className="pre-wrap">{client.billingAddress || <span className="muted">No billing address</span>}</p>
            <h3 className="section-title">Tags</h3>
            {client.tags.length ? <div className={styles.tags}>{client.tags.map(tag => <span key={tag} className={styles.tag}>{tag}</span>)}</div> : <p className="muted">No tags</p>}
          </> : null}
        </Card>
        {admin ? <Card title="Internal notes" description="Only visible to administrators"><p className="pre-wrap">{client.notes || <span className="muted">No notes</span>}</p></Card> : null}
        {admin ? <Card id="archive-client" title={client.archivedAt ? "Restore client" : "Archive client"}><p className="muted" style={{ fontSize: 13 }}>Keep the client and past work on record. Archived clients are excluded from new requests.</p><ArchiveClientForm client={client} commandKey={randomUUID()} /></Card> : null}
      </aside>
    </div>
  </>;
}
