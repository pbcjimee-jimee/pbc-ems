'use client';
import { useActionState, useEffect, useState } from 'react';
import { timerAction, type TimeFormState } from '@/app/(ems)/timesheets/actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { CommandFields } from '@/components/clients/client-form';
import { TimeFeedback } from './time-form';
import { timeOfDay } from '@/lib/domain/format';
import styles from './timesheets.module.css';
type OpenTimer = { id: string; version: number; startedAt: string; jobId: string | null; jobTitle: string | null };
export function Timer({ open, serverNow, jobs, commandKey, jobId }: { open: OpenTimer | null; serverNow: string; jobs: { id: string; title: string; number: string }[]; commandKey: string; jobId?: string }) {
  const [state, action, pending] = useActionState(timerAction, {} as TimeFormState);
  const initialSeconds = open ? Math.max(0, Math.floor((Date.parse(serverNow) - Date.parse(open.startedAt)) / 1000)) : 0;
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (!open) return;
    const baseline = performance.now(); const tick = () => setSeconds(initialSeconds + Math.floor((performance.now() - baseline) / 1000));
    const interval = setInterval(tick, 1000); return () => clearInterval(interval);
  }, [open, initialSeconds]);
  return <section className={`panel ${styles.timer}`} aria-labelledby="timer-title"><div><h2 id="timer-title">{open ? 'Timer running' : 'Work timer'}</h2>{open ? <><p>{open.jobTitle ?? 'No linked job'} · started {timeOfDay(open.startedAt)} Sydney time</p><p className={styles.elapsed} aria-label="Elapsed time">{Math.floor(seconds / 3600)}h {String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}m {String(seconds % 60).padStart(2, '0')}s</p><p className="field-hint">Start time is saved on the server and restored when you return.</p></> : <p className="field-hint">One timer at a time. Returning to this page restores your running timer.</p>}</div><form onReset={event => event.preventDefault()} action={action} className={styles.timerForm}><TimeFeedback state={state} /><input type="hidden" name="intent" value={open ? 'stop' : 'start'} />{open ? <><CommandFields id={open.id} version={open.version} commandKey={commandKey} /><Field name="breakMinutes" label="Break (minutes)" type="number" min={0} max={1440} required defaultValue={state.values?.breakMinutes ?? '0'} /><Button type="submit" loading={pending}>Stop timer</Button></> : <><div className="field"><label htmlFor="timer-job">Assigned job</label><select id="timer-job" name="jobId" required defaultValue={state.values?.jobId ?? jobId ?? ''}><option value="">Choose a job</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.number} · {job.title}</option>)}</select></div><Button type="submit" loading={pending} disabled={!jobs.length}>Start timer</Button>{!jobs.length ? <p className="field-hint">No assigned jobs are available. You can still add manual time below.</p> : null}</>}</form></section>;
}
