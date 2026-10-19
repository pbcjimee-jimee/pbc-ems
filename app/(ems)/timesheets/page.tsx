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
import { Button, ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/tabs';
import { Notice } from '@/components/ui/notice';
import { Icon } from '@/components/ui/icon';
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
  const viewLink = (view: 'day' | 'week') => `/timesheets?${new URLSearchParams({ date, view, scope: data.filter.scope, status: data.filter.status, ...(data.filter.jobId ? { jobId: data.filter.jobId } : {}) })}`;
  return <div className={styles.stack}><PageHeader title="Timesheets" description={`Actual work time in Australia/Sydney · ${actor.role === 'admin' && data.filter.scope === 'all' ? 'All workers' : 'Your entries'}`} actions={<ButtonLink href="#manual-time" variant="secondary" icon="plus">Add manual time</ButtonLink>} />
    <Timer open={data.open} serverNow={data.serverNow} jobs={jobs} commandKey={randomUUID()} jobId={data.filter.jobId} />
    {!parsed.success ? <Notice tone="warning">Some filters were invalid. Showing your current week.</Notice> : null}
    <form method="get" className="filter-bar"><div className="field"><label htmlFor="time-date">Date</label><input id="time-date" name="date" type="date" defaultValue={date} /></div><div className="field"><label htmlFor="time-view">View</label><select id="time-view" name="view" defaultValue={mode}><option value="day">Day</option><option value="week">Week</option></select></div><div className="field"><label htmlFor="time-status">Status</label><select id="time-status" name="status" defaultValue={data.filter.status}><option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option></select></div><div className="field"><label htmlFor="time-job">Job</label><select id="time-job" name="jobId" defaultValue={data.filter.jobId ?? ''}><option value="">All jobs</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.number} · {job.title}</option>)}</select></div>{actor.role === 'admin' ? <div className="field"><label htmlFor="time-scope">Worker scope</label><select id="time-scope" name="scope" defaultValue={data.filter.scope}><option value="own">My time</option><option value="all">All workers / approvals</option></select></div> : null}<div className="filter-actions"><Button variant="secondary" type="submit">Apply</Button><Link href="/timesheets" className="button button-ghost">Reset</Link></div></form>
    <div className={styles.periodBar}><nav className="inline" aria-label="Time period"><ButtonLink href={`/timesheets?view=${mode}`} variant="secondary" size="sm">Today</ButtonLink><ButtonLink className="button-icon" variant="ghost" size="sm" href={moveLink(mode === 'day' ? -1 : -7)} aria-label={`Previous ${mode}`}><Icon name="chevron-left" size={18} /></ButtonLink><ButtonLink className="button-icon" variant="ghost" size="sm" href={moveLink(mode === 'day' ? 1 : 7)} aria-label={`Next ${mode}`}><Icon name="chevron-right" size={18} /></ButtonLink><h2 className={styles.period}>{shortDate(from)}{mode === 'week' ? ` – ${shortDate(to)}` : ''}</h2></nav><Segmented label="Timesheet view" items={[{ label: 'Day', href: viewLink('day'), current: mode === 'day' }, { label: 'Week', href: viewLink('week'), current: mode === 'week' }]} /></div>
    {!data.filter.entryId ? <WeeklyGrid items={data.items} dates={dates} today={today} /> : null}<p className="filter-summary"><span>Recorded total <strong className="numeric">{minutesLabel(data.totalMinutes)}</strong></span><span>Running timers are excluded until stopped.</span></p>
    {data.filter.entryId && !selected ? <Notice tone="danger">This entry was not found in your accessible records. <Link href="/timesheets">Return to your timesheets</Link>.</Notice> : null}
    <ApprovalList items={data.items} admin={actor.role === 'admin'} currentUser={actor.userId} />
    {history.length ? <section className="panel"><h2>Entry history</h2><ol className={styles.history}>{history.map(event => <li key={event.id}><strong>{event.action.replaceAll('_', ' ')}</strong> · {shortDate(event.createdAt)} {timeOfDay(event.createdAt)} · {event.actor}{event.data.reason ? <p>{event.data.reason}</p> : null}</li>)}</ol></section> : null}
    <div id="manual-time">{selected && (selected.status !== 'draft' || !selected.endedAt) ? <p className="alert notice-warning">{selected.endedAt ? 'This entry is locked. Submitted time must be rejected, and approved time must be reopened by an administrator before editing.' : 'Stop the running timer before editing its time.'}</p> : <TimeForm key={selected?.id ?? 'new'} entry={selected} jobs={jobs} visits={visits} commandKey={randomUUID()} date={date} jobId={data.filter.jobId} />}</div>
  </div>;
}
