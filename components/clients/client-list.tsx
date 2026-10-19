import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import type { ClientSummary } from "@/lib/clients/service";
export function ClientList({ items, admin }: { items: ClientSummary[]; admin: boolean }) {
  if (!items.length) return <EmptyState title="No customers found" description="Adjust the search or filters, or add your first customer and their sites." action={admin ? <Link className="button" href="/clients/new">New customer</Link> : undefined} />;
  return <ul className="record-list" style={{ listStyle: "none", padding: 0 }}>{items.map(client => <li key={client.id} className="panel" style={{ marginBottom: 12 }}><div className="page-header" style={{ marginBottom: 8 }}><div><h2><Link href={`/clients/${client.id}`}>{client.displayName}</Link></h2>{client.companyName ? <p>{client.companyName}</p> : null}</div><Status tone={client.archivedAt ? "neutral" : "success"}>{client.archivedAt ? "Archived" : "Active"}</Status></div><div className="toolbar" style={{ marginBottom: 0 }}>{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : <span>No email</span>}{client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : <span>No phone</span>}</div></li>)}</ul>;
}
