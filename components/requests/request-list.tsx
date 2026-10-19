import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { shortDate } from "@/lib/domain/format";
import type { RequestSummary } from "@/lib/requests/service";

const assessment = (value: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function RequestList({ items, admin, filtered = false }: { items: RequestSummary[]; admin: boolean; filtered?: boolean }) {
  if (!items.length) return <EmptyState icon="requests" title={filtered ? "No requests match" : "No requests yet"} description={filtered ? "Change the status or filters to find a request." : "Capture an enquiry for an active client, then plan the assessment and quote."} action={admin ? <ButtonLink href="/requests/new" icon="plus">New request</ButtonLink> : undefined} />;
  return <DataTable caption="Requests" rows={items} rowKey={request => request.id} columns={[
    { key: "title", header: "Request", primary: true, cell: request => <><Link href={`/requests/${request.id}`}>{request.title}</Link><span className="cell-sub">{request.propertyLabel ?? "No site selected"}</span></> },
    { key: "client", header: "Client", cell: request => <Link href={`/clients/${request.clientId}`}>{request.clientName}</Link> },
    { key: "preferred", header: "Preferred date", cell: request => request.preferredDate ? shortDate(request.preferredDate) : <span className="muted">Not set</span> },
    { key: "assessment", header: "Assessment", cell: request => request.assessmentAt ? assessment(request.assessmentAt) : <span className="muted">Not planned</span> },
    { key: "status", header: "Status", cell: request => request.archivedAt ? <StatusBadge status="archived" /> : <StatusBadge status={request.status} /> },
  ]} />;
}
