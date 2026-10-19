'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { timesheetApprovalAction, type TimeFormState } from '@/app/(ems)/timesheets/actions';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/empty-state';
import { TimeFeedback } from './time-form';
import { minutesLabel } from './weekly-grid';
import { shortDate, timeOfDay } from '@/lib/domain/format';
import type { TimeEntry } from '@/lib/timesheets/service';
import styles from './timesheets.module.css';
export function ApprovalList({ items, admin, currentUser }: { items: TimeEntry[]; admin: boolean; currentUser: string }) {
  const [state, action, pending] = useActionState(timesheetApprovalAction, {} as TimeFormState);
  const [selection, setSelection] = useState<string[]>([]);
  if (!items.length) return <EmptyState icon="timesheets" title="No time entries" description="Choose another date, start the timer or add a manual time entry." />;
  return <form onReset={event => event.preventDefault()} action={action} className="panel"><h2>Time entries</h2><p className="field-hint">Select entries with the same status. Submit closed drafts, approve or reject submitted time, and reopen approved time before correcting it.</p><TimeFeedback state={state} />
    <div className={styles.entries}>{items.map(entry => <article className={styles.entry} key={`${entry.id}:${entry.version}`}><div className={styles.entryMain}><label className={styles.selection}><input type="checkbox" name="entry" value={`${entry.id}:${entry.version}`} checked={selection.includes(`${entry.id}:${entry.version}`)} onChange={event => setSelection(current => event.target.checked ? [...current, `${entry.id}:${entry.version}`] : current.filter(value => value !== `${entry.id}:${entry.version}`))} disabled={!entry.endedAt || (!admin && entry.userId !== currentUser) || (!admin && entry.status !== 'draft')} /><span><strong>{entry.jobTitle ?? 'No linked job'}</strong><span>{shortDate(entry.startedAt)} · {timeOfDay(entry.startedAt)} — {entry.endedAt ? `${shortDate(entry.endedAt)} ${timeOfDay(entry.endedAt)}` : 'Running'}</span>{admin ? <span>{entry.worker}</span> : null}</span></label><div className={styles.entrySummary}><StatusBadge status={entry.status} /><strong>{entry.minutes === null ? 'Running' : minutesLabel(entry.minutes)}</strong><small>Break {entry.breakMinutes}m</small></div></div>{entry.notes ? <p>{entry.notes}</p> : null}{entry.rejectionReason ? <p><strong>Correction reason:</strong> {entry.rejectionReason}</p> : null}<Link href={`/timesheets?entryId=${entry.id}${admin && entry.userId !== currentUser ? '&scope=all' : ''}`}>{entry.status === 'draft' && entry.endedAt ? 'Edit draft / history' : 'View entry history'}</Link></article>)}</div>
    <div className="field"><label htmlFor="approval-reason">Reason for rejection or reopening</label><textarea id="approval-reason" name="reason" maxLength={2000} rows={2} defaultValue={state.values?.reason ?? ''} /></div><div className="form-actions"><Button type="submit" name="intent" value="submit" loading={pending}>Submit selected drafts</Button>{admin ? <><Button type="submit" name="intent" value="approve" variant="secondary" loading={pending}>Approve submitted</Button><Button type="submit" name="intent" value="reject" variant="secondary" loading={pending}>Reject submitted</Button><Button type="submit" name="intent" value="reopen" variant="secondary" loading={pending}>Reopen approved</Button></> : null}</div>
  </form>;
}
