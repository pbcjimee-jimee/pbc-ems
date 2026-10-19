import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { z } from 'zod';
import { requireMembership } from '@/lib/auth/permissions';
import { withEmsTransaction } from '@/lib/db/transaction';
import { personalJobOptions } from '@/lib/expenses/service';
import { listTimeEntries } from '@/lib/timesheets/service';
import { timeFilterSchema } from '@/lib/timesheets/schemas';
import { sydneyToday, shortDate, timeOfDay } from '@/lib/domain/format';
import { Timer } from '@/components/timesheets/timer';
import { TimeForm } from '@/components/timesheets/time-form';
import { WeeklyGrid, minutesLabel } from '@/components/timesheets/weekly-grid';
import { ApprovalList } from '@/components/timesheets/approval-list';
import { Button } from '@/components/ui/button';
import styles from '@/components/timesheets/timesheets.module.css';
function addDays(date: string, amount: number): string { const instant = new Date(`${date}T12:00:00Z`); instant.setUTCDate(instant.getUTCDate() + amount); return instant.toISOString().slice(0, 10); }
export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const actor = await requireMembership(); const today = sydneyToday(); const dateInput = z.iso.date().safeParse(params.date); const date = dateInput.success ? dateInput.data : today;
  const mode = params.view === 'day' ? 'day' : 'week'; const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay(); const from = mode === 'day' ? date : addDays(date, -(dayOfWeek === 0 ? 6 : dayOfWeek - 1)); const to = mode === 'day' ? date : addDays(from, 6);
  const parsed = timeFilterSchema.safeParse({ ...params, ...(params.entryId && actor.role === 'admin' && !params.scope ? { scope: 'all' } : {}), from: params.entryId ? '' : from, to: params.entryId ? '' : to }); const data = await listTimeEntries(parsed.success ? parsed.data : { from, to });
  const [jobs, visits] = await Promise.all([personalJobOptions(), withEmsTransaction(tx => tx.query<{ id: string; jobId: string | null; title: string; date: string }>('select id,job_id as "jobId",title,coalesce(start_date,(starts_at at time zone \'Australia/Sydney\')::date)::text as date from ems.visits where organization_id=$1 and status<>\'cancelled\' order by coalesce(start_date,(starts_at at time zone \'Australia/Sydney\')::date) desc', [tx.actor.organizationId]))]);
  const selected = data.filter.entryId ? data.items.find(row => row.id === data.filter.entryId) : undefined;
  const history = selected && actor.role === 'admin' ? await withEmsTransaction(tx => tx.query<{ id: string; action: string; createdAt: string; actor: string; data: { reason?: string } }>('select a.id,a.action,a.created_at::text as "createdAt",m.display_name as actor,a.data from ems.activity_events a join ems.memberships m on m.user_id=a.actor_id and m.organization_id=a.organization_id where a.entity_type=\'time_entry\' and a.entity_id=$1 and a.organization_id=$2 order by a.created_at', [selected.id, tx.actor.organizationId])) : [];
  const dates = Array.from({ length: mode === 'day' ? 1 : 7 }, (_, index) => addDays(from, index));
  const moveLink = (amount: number) => `/timesheets?${new URLSearchParams({ date: addDays(date, amount), view: mode, scope: data.filter.scope, status: data.filter.status, ...(data.filter.jobId ? { jobId: data.filter.jobId } : {}) })}`;
  return <div className={styles.stack}><div className="page-header"><div><h1>Timesheets</h1><p className="page-description">Actual work time in Australia/Sydney · {actor.role === 'admin' && data.filter.scope === 'all' ? 'All workers' : 'Your entries'}</p></div><a className="button button-secondary" href="#manual-time">Add manual time</a></div>
    <Timer open={data.open} serverNow={data.serverNow} jobs={jobs} commandKey={randomUUID()} jobId={data.filter.jobId} />
    {!parsed.success ? <p role="alert">Some filters were invalid. Showing your current week.</p> : null}
    <form method="get" className={styles.filters}><div className="field"><label htmlFor="time-date">Date</label><input id="time-date" name="date" type="date" defaultValue={date} /></div><div className="field"><label htmlFor="time-view">View</label><select id="time-view" name="view" defaultValue={mode}><option value="day">Day</option><option value="week">Week</option></select></div><div className="field"><label htmlFor="time-status">Status</label><select id="time-status" name="status" defaultValue={data.filter.status}><option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option></select></div><div className="field"><label htmlFor="time-job">Job</label><select id="time-job" name="jobId" defaultValue={data.filter.jobId ?? ''}><option value="">All jobs</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.number} · {job.title}</option>)}</select></div>{actor.role === 'admin' ? <div className="field"><label htmlFor="time-scope">Worker scope</label><select id="time-scope" name="scope" defaultValue={data.filter.scope}><option value="own">My time</option><option value="all">All workers / approvals</option></select></div> : null}<Button variant="secondary" type="submit">Apply filters</Button><Link href="/timesheets">Reset</Link></form>
    <nav className="toolbar" aria-label="Time period"><Link className="button button-secondary" href={moveLink(mode === 'day' ? -1 : -7)}>Previous {mode}</Link><strong>{shortDate(from)}{mode === 'week' ? ` — ${shortDate(to)}` : ''}</strong><Link className="button button-secondary" href={moveLink(mode === 'day' ? 1 : 7)}>Next {mode}</Link></nav>
    {!data.filter.entryId ? <WeeklyGrid items={data.items} dates={dates} /> : null}<p>Recorded total <strong>{minutesLabel(data.totalMinutes)}</strong> · Running timers are excluded until stopped.</p>
    {data.filter.entryId && !selected ? <p role="alert">This entry was not found in your accessible records. <Link href="/timesheets">Return to your timesheets</Link>.</p> : null}
    <ApprovalList items={data.items} admin={actor.role === 'admin'} currentUser={actor.userId} />
    {history.length ? <section className="panel"><h2>Entry history</h2><ol className={styles.history}>{history.map(event => <li key={event.id}><strong>{event.action.replaceAll('_', ' ')}</strong> · {shortDate(event.createdAt)} {timeOfDay(event.createdAt)} · {event.actor}{event.data.reason ? <p>{event.data.reason}</p> : null}</li>)}</ol></section> : null}
    <div id="manual-time">{selected && (selected.status !== 'draft' || !selected.endedAt) ? <p className="alert">{selected.endedAt ? 'This entry is locked. Submitted time must be rejected, and approved time must be reopened by an administrator before editing.' : 'Stop the running timer before editing its time.'}</p> : <TimeForm key={selected?.id ?? 'new'} entry={selected} jobs={jobs} visits={visits} commandKey={randomUUID()} date={date} jobId={data.filter.jobId} />}</div>
  </div>;
}
