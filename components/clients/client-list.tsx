import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import type { ClientSummary } from "@/lib/clients/service";
import styles from "./clients.module.css";

export function ClientList({ items, admin, filtered = false }: { items: ClientSummary[]; admin: boolean; filtered?: boolean }) {
  if (!items.length) return <EmptyState icon="clients" title={filtered ? "No clients match" : "Add your first client"} description={filtered ? "Adjust the search or status, or add a new client and their sites." : "Clients hold contact details, billing addresses and every work site."} action={admin ? <ButtonLink href="/clients/new" icon="plus">New client</ButtonLink> : undefined} />;
  return <DataTable caption="Clients" rows={items} rowKey={client => client.id} columns={[
    { key: "name", header: "Client", primary: true, cell: client => <span className={styles.nameCell}><Avatar name={client.displayName} /><span><Link href={`/clients/${client.id}`}>{client.displayName}</Link>{client.companyName ? <span className="cell-sub">{client.companyName}</span> : null}</span></span> },
    { key: "email", header: "Email", cell: client => client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : <span className="muted">—</span> },
    { key: "phone", header: "Phone", cell: client => client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : <span className="muted">—</span> },
    { key: "status", header: "Status", cell: client => <StatusBadge status={client.archivedAt ? "archived" : "active"} /> },
  ]} />;
}
