'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { saveTimeAction, type TimeFormState } from '@/app/(ems)/timesheets/actions';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { CommandFields, TextArea } from '@/components/clients/client-form';
import { formatSydneyInput, resolveSydneyDateTime } from '@/lib/domain/sydney-date-time';
import type { TimeEntry } from '@/lib/timesheets/service';
export function TimeFeedback({ state }: { state: TimeFormState }) { return state.result ? state.result.ok ? <p role="status">Saved.</p> : <div className="alert" role="alert"><p>{state.result.error.message}</p>{state.result.error.code === 'VERSION_CONFLICT' ? <a href="">Reload the latest entries</a> : null}</div> : null; }
function occurrence(instant?: string | null): string { return instant ? formatSydneyInput(instant) : ''; }
function repeatedOccurrence(instant?: string | null): string {
  if (!instant) return ''; const wall = formatSydneyInput(instant); const unique = resolveSydneyDateTime(wall.slice(0, 10), wall.slice(11));
  if (unique.ok || unique.error.code !== 'AMBIGUOUS_TIME') return '';
  const earlier = resolveSydneyDateTime(wall.slice(0, 10), wall.slice(11), 'earlier');
  return earlier.ok && Date.parse(earlier.data.iso) === Date.parse(instant) ? 'earlier' : 'later';
}
export function TimeForm({ entry, jobs, visits, commandKey, date, jobId }: { entry?: TimeEntry; jobs: { id: string; title: string; number: string }[]; visits: { id: string; jobId: string | null; title: string; date: string }[]; commandKey: string; date: string; jobId?: string }) {
  const [state, action, pending] = useActionState(saveTimeAction, {} as TimeFormState); const errors = state.result && !state.result.ok ? state.result.error.fields : undefined;
  const [selectedJob, setSelectedJob] = useState(entry?.jobId ?? jobId ?? '');
  const [selectedVisit, setSelectedVisit] = useState(entry?.visitId ?? '');
  const start = occurrence(entry?.startedAt); const end = occurrence(entry?.endedAt); const value = (key: string, fallback?: string | null) => state.values?.[key] ?? fallback ?? '';
  return <form onReset={event => event.preventDefault()} className="panel" action={action}><h2>{entry ? 'Edit draft time' : 'Add manual time'}</h2><p className="field-hint">Times use Australia/Sydney. Use a separate end date for overnight work. Breaks reduce actual elapsed time.</p><CommandFields id={entry?.id} version={entry?.version ?? 0} commandKey={commandKey} /><TimeFeedback state={state} />
    <div className="form-grid"><div className="field"><label htmlFor="manual-job">Job (optional)</label><select id="manual-job" name="jobId" value={selectedJob} onChange={event => { setSelectedJob(event.target.value); setSelectedVisit(''); }}><option value="">No linked job</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.number} · {job.title}</option>)}</select></div>
      <div className="field"><label htmlFor="manual-visit">Visit (optional)</label><select id="manual-visit" name="visitId" value={selectedVisit} onChange={event => setSelectedVisit(event.target.value)}><option value="">No linked visit</option>{visits.filter(visit => visit.jobId === (selectedJob || null)).map(visit => <option key={visit.id} value={visit.id}>{visit.date} · {visit.title}</option>)}</select><p className="field-hint">Only accessible visits belonging to the selected job are listed.</p></div>
      <Field name="breakMinutes" label="Unpaid break (minutes)" type="number" required min={0} max={1440} defaultValue={value('breakMinutes', String(entry?.breakMinutes ?? 0))} error={errors?.breakMinutes} />
      <Field name="startDate" label="Start date" type="date" required defaultValue={value('startDate', start.slice(0, 10) || date)} error={errors?.startDate} /><Field name="startTime" label="Start time" type="time" required defaultValue={value('startTime', start.slice(11) || '07:00')} error={errors?.startTime} />
      <Field name="endDate" label="End date" type="date" required defaultValue={value('endDate', end.slice(0, 10) || date)} error={errors?.endDate} /><Field name="endTime" label="End time" type="time" required defaultValue={value('endTime', end.slice(11) || '15:00')} error={errors?.endTime} />
      {(['start', 'end'] as const).map(side => <div className="field" key={side}><label htmlFor={`${side}Occurrence`}>{side === 'start' ? 'Start' : 'End'} daylight saving occurrence</label><select id={`${side}Occurrence`} name={`${side}Occurrence`} defaultValue={value(`${side}Occurrence`, repeatedOccurrence(side === 'start' ? entry?.startedAt : entry?.endedAt))}><option value="">Automatic (unique times)</option><option value="earlier">Earlier repeated time (daylight time)</option><option value="later">Later repeated time (standard time)</option></select><p className="field-hint">Choose earlier or later only when a Sydney time repeats as daylight saving ends.</p></div>)}
      <TextArea name="notes" label="Work notes" value={value('notes', entry?.notes)} error={errors?.notes} /></div><div className="form-actions">{entry ? <Link href="/timesheets" className="button button-secondary">Cancel edit</Link> : null}<Button type="submit" loading={pending}>Save time entry</Button></div>
  </form>;
}
