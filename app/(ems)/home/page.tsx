import Link from "next/link";
import { getHomeSummary } from "@/lib/home/service";
import { money, timeOfDay, shortDate } from "@/lib/domain/format";
import { Status } from "@/components/ui/status";
import { Icon } from "@/components/shell/icons";
import styles from "./home.module.css";

export default async function HomePage() {
  const data=await getHomeSummary();
  const date=new Intl.DateTimeFormat("en-AU",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(data.today+"T12:00:00Z"));
  const completed=data.visits.filter(v=>v.status==="completed").length;
  return <>
    <div className="page-header"><div><h1 className="page-title">Home</h1><p className="page-description">{date} <span aria-hidden="true">·</span> Here&apos;s your work for today.</p></div>
      <Link className="button" href={data.actor.role==="admin"?"/quotes/new":"/timesheets"}><Icon name="plus" size={17}/>{data.actor.role==="admin"?"New quote":"Record time"}</Link>
    </div>
    <div className={styles.workflow}>
      <Link href="/requests?status=new"><span>Requests</span><strong>{data.counts.new_requests}</strong><small>New enquiries<Icon name="arrow" size={16}/></small></Link>
      {data.finance && <Link href="/quotes?status=issued"><span>Quotes</span><strong>{data.finance.pending_quotes}</strong><small>Awaiting response<Icon name="arrow" size={16}/></small></Link>}
      <Link href="/jobs?status=active"><span>Jobs</span><strong>{data.counts.active_jobs}</strong><small>Active work<Icon name="arrow" size={16}/></small></Link>
      {data.finance ? <Link href="/invoices?status=overdue"><span>Invoices</span><strong>{data.finance.overdue}</strong><small>Past due<Icon name="arrow" size={16}/></small></Link> :
        <Link href="/timesheets"><span>Timesheets</span><strong>{data.counts.open_timers}</strong><small>Running timers<Icon name="arrow" size={16}/></small></Link>}
    </div>
    <div className={styles.columns}><div>
      <section className={styles.section} aria-labelledby="today-heading">
        <div className={styles.sectionHeading}><div><h2 id="today-heading">Today&apos;s schedule <span>{data.visits.length}</span></h2><p>{completed} completed · {data.visits.length-completed} remaining</p></div><Link href={"/schedule?date="+data.today}>View schedule <Icon name="arrow" size={15}/></Link></div>
        <div className={styles.visits}>{data.visits.length?data.visits.map(visit=><Link href={"/schedule/"+visit.id} key={visit.id} className={styles.visit}>
          <div className={styles.visitTime}>{visit.all_day?"Anytime":visit.starts_at?timeOfDay(visit.starts_at):"Unscheduled"}<small>{visit.all_day?"All day":visit.ends_at?timeOfDay(visit.ends_at):""}</small></div>
          <div className={styles.visitDescription}><strong>{visit.title}</strong>{visit.address&&<span>{visit.address}</span>}<small>{visit.assignees.length?visit.assignees.join(" · "):"No team member assigned"}</small></div>
          <Status tone={visit.status==="completed"?"success":visit.status==="in_progress"?"info":"neutral"}>{visit.status.replaceAll("_"," ")}</Status>
        </Link>):<div className={styles.quiet}><Icon name="schedule" size={28}/><h3>Your day has room</h3><p>No visits scheduled for today. Open Schedule to plan a visit or assign unscheduled work.</p><Link className="button button-secondary" href="/schedule">Open schedule</Link></div>}</div>
      </section>
      <section className={styles.section} aria-labelledby="upcoming-heading"><div className={styles.sectionHeading}><div><h2 id="upcoming-heading">Coming up</h2><p>The next seven days</p></div><Link href="/schedule">View schedule</Link></div>{data.upcoming.length?<div className={styles.recent}>{data.upcoming.map(v=><Link key={v.id} href={'/schedule/'+v.id}><div><strong>{v.title}</strong><small>{shortDate(v.date)} · {v.all_day?'All day':v.starts_at?timeOfDay(v.starts_at):''}</small></div><Icon name="arrow" size={17}/></Link>)}</div>:<div className={styles.noWork}><p>No upcoming visits in the next seven days.</p><Link href="/schedule">Plan the schedule</Link></div>}</section>
      <section className={styles.section} aria-labelledby="jobs-heading"><div className={styles.sectionHeading}><div><h2 id="jobs-heading">Recent work</h2><p>Pick up where your team left off.</p></div><Link href="/jobs">All jobs <Icon name="arrow" size={15}/></Link></div>
        {data.recent.length?<div className={styles.recent}>{data.recent.map(job=><Link key={job.id} href={"/jobs/"+job.id}><span className={styles.jobNumber}>{job.number}</span><div><strong>{job.title}</strong><small>{job.client_name}</small></div><Status tone={job.status==="completed"?"success":"neutral"}>{job.status.replaceAll("_"," ")}</Status></Link>)}</div>:<div className={styles.noWork}><p>No jobs to show yet.</p><Link href={data.actor.role==="admin"?"/jobs/new":"/schedule"}>{data.actor.role==="admin"?"Create your first job":"View assigned schedule"}</Link></div>}
      </section>
    </div><aside className={styles.side}>
      {data.finance&&<section className={styles.receivables}><div className={styles.sideHeading}><h2>Receivables</h2><Icon name="invoices" size={20}/></div><span className={styles.amount}>{money(data.finance.outstanding)}</span><p>Outstanding on issued invoices</p><Link href="/invoices?status=outstanding">Review invoices <Icon name="arrow" size={16}/></Link></section>}
      <section className={styles.next}><h2>Keep work moving</h2>{data.finance&&<><Link href="/quotes?status=draft"><span>Finish draft quotes<small>{data.finance.draft_quotes} ready to continue</small></span><Icon name="arrow" size={17}/></Link><Link href="/jobs?status=requires_invoicing"><span>Invoice completed work<small>{data.finance.to_invoice} jobs awaiting an invoice</small></span><Icon name="arrow" size={17}/></Link></>}<Link href="/expenses"><span>Record an expense<small>Keep costs attached to the right job</small></span><Icon name="arrow" size={17}/></Link><Link href="/timesheets"><span>Update timesheets<small>Record time worked, breaks and job</small></span><Icon name="arrow" size={17}/></Link></section>
      <div className={styles.note}><Icon name="jobs" size={18}/><p>One place for the work.<br/><span>From the first enquiry to the final invoice.</span></p></div>
    </aside></div>
  </>;
}

