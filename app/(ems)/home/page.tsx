import Link from "next/link";
import { getHomeSummary } from "@/lib/home/service";
import { money, timeOfDay, shortDate } from "@/lib/domain/format";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icon";
import styles from "./home.module.css";

type Stage = { title: string; icon: IconName; href: string; headline: { value: string; label: string }; rows: { label: string; value: string; href: string }[] };

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: "Australia/Sydney" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const data = await getHomeSummary();
  const date = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(data.today + "T12:00:00Z"));
  const admin = data.actor.role === "admin";
  const completed = data.visits.filter(v => v.status === "completed").length;
  const firstName = data.actor.displayName.trim().split(/\s+/)[0];
  const finance = data.finance;
  const { requests, jobs, quotes, invoices } = data.pipeline;
  const count = (n: number | string) => String(n);
  const stages: Stage[] = [
    { title: "Requests", icon: "requests", href: "/requests", headline: { value: count(requests.new.count), label: "New" }, rows: [
      { label: "Assessments booked", value: count(requests.assessmentScheduled.count), href: "/schedule?view=list" },
      { label: "Assessments overdue", value: count(requests.assessmentOverdue.count), href: "/schedule?view=list" },
    ] },
    ...(quotes ? [{ title: "Quotes", icon: "quotes" as const, href: "/quotes", headline: { value: money(quotes.approvedUnconverted.amount), label: `${quotes.approvedUnconverted.count} approved, ready for a job` }, rows: [
      { label: `Awaiting response · ${quotes.awaitingResponse.count}`, value: money(quotes.awaitingResponse.amount), href: "/quotes?status=issued" },
      { label: "Changes requested", value: count(quotes.changesRequested.count), href: "/quotes?status=changes_requested" },
      { label: "Draft", value: count(quotes.draft.count), href: "/quotes?status=draft" },
    ] }] : []),
    { title: "Jobs", icon: "jobs", href: "/jobs", headline: jobs.requiresInvoicing ? { value: money(jobs.requiresInvoicing.amount), label: `${jobs.requiresInvoicing.count} completed, requires invoicing` } : { value: count(jobs.active.count), label: "Active" }, rows: [
      { label: "Active", value: count(jobs.active.count), href: "/jobs?status=active" },
      { label: "In progress", value: count(jobs.inProgress.count), href: "/jobs?status=in_progress" },
      ...(jobs.requiresInvoicing ? [{ label: "Requires invoicing", value: count(jobs.requiresInvoicing.count), href: "/jobs?status=requires_invoicing" }] : []),
    ] },
    invoices
      ? { title: "Invoices", icon: "invoices", href: "/invoices", headline: { value: money(invoices.outstanding.amount), label: `${invoices.outstanding.count} awaiting payment` }, rows: [
        { label: `Past due · ${invoices.overdue.count}`, value: money(invoices.overdue.amount), href: "/invoices?status=overdue" },
        { label: "Draft", value: count(invoices.draft.count), href: "/invoices?status=draft" },
      ] }
      : { title: "Timesheets", icon: "timesheets", href: "/timesheets", headline: { value: data.counts.open_timers, label: "Running timers" }, rows: [{ label: "Record time", value: "Open", href: "/timesheets" }] },
  ];

  return <>
    <div className="page-header">
      <div>
        <span className="page-eyebrow">{date}</span>
        <h1 className="page-title">{greeting()}, {firstName}</h1>
        <p className="page-description">{data.visits.length ? `${data.visits.length} visit${data.visits.length === 1 ? "" : "s"} today · ${completed} completed` : "No visits booked for today."}</p>
      </div>
      <div className="page-actions">
        {admin ? <><ButtonLink href="/clients/new" variant="secondary" icon="clients">New client</ButtonLink><ButtonLink href="/quotes/new" icon="plus">New quote</ButtonLink></> : <ButtonLink href="/timesheets" icon="clock">Record time</ButtonLink>}
      </div>
    </div>

    <section aria-labelledby="workflow-heading" className={styles.workflowSection}>
      <h2 id="workflow-heading" className="sr-only">Workflow</h2>
      <div className={styles.workflow}>
        {stages.map(stage => <article key={stage.title} className={styles.stage}>
          <Link href={stage.href} className={styles.stageHead}><span className={styles.stageIcon}><Icon name={stage.icon} size={18} /></span>{stage.title}<Icon name="chevron-right" size={16} /></Link>
          <Link href={stage.href} className={styles.stageHeadline}><strong>{stage.headline.value}</strong><span>{stage.headline.label}</span></Link>
          <ul>{stage.rows.map(row => <li key={row.label}><Link href={row.href}><span>{row.label}</span><strong>{row.value}</strong></Link></li>)}</ul>
        </article>)}
      </div>
    </section>

    <div className={styles.columns}>
      <div className="stack">
        <Card id="today" title="Today's visits" count={data.visits.length} description={`${completed} completed · ${data.visits.length - completed} remaining`} flush action={<ButtonLink href={"/schedule?view=day&date=" + data.today} variant="ghost" size="sm">View schedule<Icon name="arrow" size={16} /></ButtonLink>}>
          {data.visits.length ? <ul className={styles.visits}>{data.visits.map(visit => <li key={visit.id}>
            <Link href={"/schedule/" + visit.id} className={styles.visit}>
              <span className={styles.visitTime}>{visit.all_day ? "All day" : visit.starts_at ? timeOfDay(visit.starts_at) : "Anytime"}<small>{!visit.all_day && visit.ends_at ? timeOfDay(visit.ends_at) : ""}</small></span>
              <span className={styles.visitBody}><strong>{visit.title}</strong>{visit.address ? <span><Icon name="pin" size={14} />{visit.address}</span> : null}<small><Icon name="user" size={14} />{visit.assignees.length ? visit.assignees.join(", ") : "No team member assigned"}</small></span>
              <StatusBadge status={visit.status} />
            </Link>
          </li>)}</ul> : <EmptyState icon="schedule" title="Your day has room" description="No visits are scheduled for today. Plan a visit or pick up unscheduled work." action={<ButtonLink href="/schedule" variant="secondary">Open schedule</ButtonLink>} />}
        </Card>

        <div className={styles.split}>
          <Card id="upcoming" title="Coming up" description="Next seven days" flush action={<ButtonLink href="/schedule?view=week" variant="ghost" size="sm">Week view</ButtonLink>}>
            {data.upcoming.length ? <ul className="record-list">{data.upcoming.map(v => <li key={v.id}><span className={styles.dateChip}><strong>{new Intl.DateTimeFormat("en-AU", { day: "numeric", timeZone: "UTC" }).format(new Date(v.date + "T12:00:00Z"))}</strong>{new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(new Date(v.date + "T12:00:00Z"))}</span><div className="record-main"><Link href={"/schedule/" + v.id}>{v.title}</Link><small>{shortDate(v.date)} · {v.all_day ? "All day" : v.starts_at ? timeOfDay(v.starts_at) : "Anytime"}</small></div></li>)}</ul> : <p className="record-list-empty">No visits in the next seven days. <Link href="/schedule">Plan the schedule</Link></p>}
          </Card>
          <Card id="recent" title="Recent jobs" description="Pick up where your team left off" flush action={<ButtonLink href="/jobs" variant="ghost" size="sm">All jobs</ButtonLink>}>
            {data.recent.length ? <ul className="record-list">{data.recent.map(job => <li key={job.id}><div className="record-main"><Link href={"/jobs/" + job.id}>{job.title}</Link><small>#{job.number} · {job.client_name}</small></div><StatusBadge status={job.status} /></li>)}</ul> : <p className="record-list-empty">No jobs yet. <Link href={admin ? "/jobs/new" : "/schedule"}>{admin ? "Create your first job" : "View assigned schedule"}</Link></p>}
          </Card>
        </div>
      </div>

      <aside className="stack" aria-label="Shortcuts">
        {finance ? <Card title="Receivables" id="receivables" footer={<Link href="/invoices?status=outstanding" className={styles.footerLink}>Review invoices<Icon name="arrow" size={16} /></Link>}>
          <p className={styles.amount}>{money(finance.outstanding)}</p>
          <p className="muted" style={{ fontSize: 13 }}>Outstanding on issued invoices{Number(finance.overdue) ? <> · <Link href="/invoices?status=overdue">{finance.overdue} past due</Link></> : null}</p>
        </Card> : null}
        <Card title="Keep work moving" id="next" flush>
          <ul className={styles.next}>
            {finance ? <>
              <li><Link href="/quotes?status=draft"><Icon name="quotes" size={18} /><span>Finish draft quotes<small>{finance.draft_quotes} ready to continue</small></span><Icon name="chevron-right" size={16} /></Link></li>
              <li><Link href="/jobs?status=requires_invoicing"><Icon name="invoices" size={18} /><span>Invoice completed work<small>{finance.to_invoice} jobs awaiting an invoice</small></span><Icon name="chevron-right" size={16} /></Link></li>
            </> : null}
            <li><Link href="/expenses/new"><Icon name="expenses" size={18} /><span>Record an expense<small>Attach the receipt to the right job</small></span><Icon name="chevron-right" size={16} /></Link></li>
            <li><Link href="/timesheets"><Icon name="timesheets" size={18} /><span>Update timesheets<small>Time worked, breaks and job</small></span><Icon name="chevron-right" size={16} /></Link></li>
          </ul>
        </Card>
      </aside>
    </div>
  </>;
}
