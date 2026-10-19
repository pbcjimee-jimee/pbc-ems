import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { requestStatusLabels } from "@/lib/requests/schemas";
import type { RequestSummary } from "@/lib/requests/service";
export function RequestList({ items, admin }: { items: RequestSummary[]; admin: boolean }) {
  if (!items.length) return <EmptyState title="No requests found" description="Change the filters or add a request for an active customer." action={admin ? <Link className="button" href="/requests/new">New request</Link> : undefined} />;
  return <ul style={{ listStyle: "none", padding: 0 }}>{items.map(request => <li className="panel" key={request.id} style={{ marginBottom: 12 }}><div className="page-header" style={{ marginBottom: 8 }}><h2><Link href={`/requests/${request.id}`}>{request.title}</Link></h2><Status tone={request.status === "closed" ? "neutral" : "info"}>{requestStatusLabels[request.status]}{request.archivedAt ? " · Archived" : ""}</Status></div><p><Link href={`/clients/${request.clientId}`}>{request.clientName}</Link>{request.propertyLabel ? ` · ${request.propertyLabel}` : " · No site selected"}</p><p className="field-hint">Preferred: {request.preferredDate ?? "Not set"} · Assessment: {request.assessmentAt ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(new Date(request.assessmentAt)) : "Not planned"}</p></li>)}</ul>;
}
