import { randomUUID } from "node:crypto";
import { listActivity } from '@/lib/workflows/queries';
import { ActivityFeed } from '@/components/ui/activity-feed';
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth/permissions";
import { clientOptions } from "@/lib/clients/service";
import { readRequest } from "@/lib/requests/service";
import { RequestForm, ArchiveRequestForm } from "@/components/requests/request-form";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { StatusBadge } from "@/components/ui/status";
import { Notice } from "@/components/ui/notice";
import { WorkflowTrail } from "@/components/ui/workflow-trail";
import { Icon } from "@/components/ui/icon";
import { shortDate } from "@/lib/domain/format";

const sydney = (value: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" }).format(new Date(value));

export default async function RequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const search = await searchParams; const actor = await requireMembership(); const request = await readRequest(id); if (!request) notFound(); const admin = actor.role === "admin"; const options = admin ? await clientOptions() : null;
  const editable = admin && !request.archivedAt;const activity = admin ? await listActivity({ entityType: 'request', entityId: id, includeRelated: true }) : [];
  const quote = request.quotes[0]; const job = request.jobs[0];
  return <>
    <PageHeader back={{ href: "/requests", label: "Requests" }} eyebrow="Request" title={request.title}
      meta={<><StatusBadge status={request.status} />{request.archivedAt ? <StatusBadge status="archived" /> : null}<Link href={`/clients/${request.clientId}`}>{request.clientName}</Link></>}
      actions={editable ? <>
        <MoreMenu>
          <Link href={`/jobs/new?requestId=${id}`}><Icon name="jobs" size={18} />Convert to job</Link>
          <Link href={`/schedule/new?requestId=${id}`}><Icon name="schedule" size={18} />Schedule assessment</Link>
          <hr />
          <a href="#edit-request"><Icon name="edit" size={18} />Edit request</a>
          <a href="#archive-request"><Icon name="archive" size={18} />Archive request</a>
        </MoreMenu>
        <ButtonLink href={`/quotes/new?requestId=${id}`} icon="quotes">Create quote</ButtonLink>
      </> : null} />
    {search.saved ? <Notice tone="success">Request saved.</Notice> : null}
    <WorkflowTrail steps={[
      { kind: "request", title: request.title, status: request.status, current: true },
      ...(admin ? [{ kind: "quote" as const, title: quote?.title, href: quote ? `/quotes/${quote.id}` : undefined, status: quote?.status, emptyLabel: "Not quoted" }] : []),
      { kind: "job", title: job?.title, href: job ? `/jobs/${job.id}` : undefined, status: job?.status, emptyLabel: "No job yet" },
    ]} />

    <div className="detail-layout">
      <div className="detail-main">
        <Card title="Request details"><p className="pre-wrap">{request.description || <span className="muted">No additional details.</span>}</p></Card>
        <Card title="Assessment" flush action={editable ? <ButtonLink href={`/schedule/new?requestId=${id}`} variant="ghost" size="sm" icon="plus">Schedule</ButtonLink> : null}>
          <div className="card-body" style={{ paddingBottom: request.visits.length ? 0 : undefined }}>
            <DetailList items={[{ label: "Planned (Sydney)", value: request.assessmentAt ? sydney(request.assessmentAt) : <span className="muted">Not planned</span> }]} />
          </div>
          {request.visits.length ? <ul className="record-list">{request.visits.map(visit => <li key={visit.id}><Icon name="schedule" size={18} /><div className="record-main"><Link href={`/schedule/${visit.id}`}>{visit.title}</Link></div><StatusBadge status={visit.status} /></li>)}</ul> : null}
        </Card>
        {admin ? <Card title="Quotes" count={request.quotes.length} flush>
          {request.quotes.length ? <ul className="record-list">{request.quotes.map(q => <li key={q.id}><Icon name="quotes" size={18} /><div className="record-main"><Link href={`/quotes/${q.id}`}>{q.title}</Link></div><StatusBadge status={q.status} /></li>)}</ul> : <p className="record-list-empty">No quotes linked yet. A draft does not change the request to Quoted.</p>}
        </Card> : null}
        <Card title="Jobs" count={request.jobs.length} flush>
          {request.jobs.length ? <ul className="record-list">{request.jobs.map(j => <li key={j.id}><Icon name="jobs" size={18} /><div className="record-main"><Link href={`/jobs/${j.id}`}>{j.title}</Link></div><StatusBadge status={j.status} /></li>)}</ul> : <p className="record-list-empty">No jobs linked yet.</p>}
        </Card>
        {editable && options ? <details className="disclosure" id="edit-request"><summary>Edit request</summary><RequestForm request={request} {...options} commandKey={randomUUID()} /></details> : null}
      {admin ? <ActivityFeed items={activity} showEntity={true} /> : null}</div>
      <aside className="detail-side" aria-label="Request summary">
        <Card title="Client and site">
          <DetailList stacked items={[
            { label: "Client", value: <Link href={`/clients/${request.clientId}`}>{request.clientName}</Link> },
            { label: "Work site", value: request.propertyLabel ?? <span className="muted">No site selected</span> },
            { label: "Address", value: <span className="pre-wrap">{request.address}</span>, hidden: !request.address },
            { label: "Preferred work date", value: request.preferredDate ? shortDate(request.preferredDate) : <span className="muted">Not set</span> },
          ]} />
        </Card>
        {admin ? <Card id="archive-request" title={request.archivedAt ? "Restore request" : "Archive request"}><p className="muted" style={{ fontSize: 13 }}>Keep the request and its linked work on record.</p><ArchiveRequestForm request={request} commandKey={randomUUID()} /></Card> : null}
      </aside>
    </div>
  </>;
}
