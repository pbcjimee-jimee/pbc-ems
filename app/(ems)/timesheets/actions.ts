'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Result } from '@/lib/domain/types';
import { resolveSydneyDateTime } from '@/lib/domain/sydney-date-time';
import { saveTimeEntry, startTimer, stopTimer, submitTimesheet, approveTimesheet, rejectTimesheet, reopenTimesheet } from '@/lib/timesheets/service';
import { invalidResult } from '@/lib/timesheets/schemas';
export type TimeFormState = { result?: Result<unknown>; values?: Record<string, string>; selectedIds?: string[] };
const localSchema = z.object({ startDate: z.iso.date(), startTime: z.string().regex(/^\d{2}:\d{2}$/), endDate: z.iso.date(), endTime: z.string().regex(/^\d{2}:\d{2}$/), startOccurrence: z.enum(['', 'earlier', 'later']), endOccurrence: z.enum(['', 'earlier', 'later']) });
export async function saveTimeAction(_previous: unknown, input: unknown): Promise<TimeFormState> {
  if (!(input instanceof FormData)) return { result: { ok: false, error: { code: 'VALIDATION', message: 'Reload the form and try again.' } } };
  const values = Object.fromEntries([...input.entries()].filter((item): item is [string, string] => typeof item[1] === 'string')); const p = localSchema.safeParse(values);
  if (!p.success) return { values, result: invalidResult(p.error) };
  const start = resolveSydneyDateTime(p.data.startDate, p.data.startTime, p.data.startOccurrence || undefined); const end = resolveSydneyDateTime(p.data.endDate, p.data.endTime, p.data.endOccurrence || undefined);
  if (!start.ok) return { values, result: { ok: false, error: { ...start.error, fields: { startTime: start.error.message } } } }; if (!end.ok) return { values, result: { ok: false, error: { ...end.error, fields: { endTime: end.error.message } } } };
  const result = await saveTimeEntry({ id: values.id || undefined, jobId: values.jobId || null, visitId: values.visitId || null, startedAt: start.data.iso, endedAt: end.data.iso, breakMinutes: Number(values.breakMinutes), notes: values.notes }, { expectedVersion: Number(values.expectedVersion), idempotencyKey: values.idempotencyKey });
  if (!result.ok) return { values, result }; revalidatePath('/timesheets'); revalidatePath('/jobs'); redirect('/timesheets');
}
export async function timerAction(_previous: unknown, input: unknown): Promise<TimeFormState> {
  if (!(input instanceof FormData)) return {};
  const values = Object.fromEntries([...input.entries()].filter((item): item is [string, string] => typeof item[1] === 'string'));
  const p = z.enum(['start', 'stop']).safeParse(values.intent); if (!p.success) return { values, result: invalidResult(p.error) };
  const result = p.data === 'start' ? await startTimer(values.jobId) : await stopTimer(values.id, { expectedVersion: Number(values.expectedVersion), idempotencyKey: values.idempotencyKey, breakMinutes: Number(values.breakMinutes), notes: values.notes ?? '' });
  revalidatePath('/timesheets'); revalidatePath('/jobs'); return { values: result.ok ? undefined : values, result };
}
export async function timesheetApprovalAction(_previous: unknown, input: unknown): Promise<TimeFormState> {
  if (!(input instanceof FormData)) return {};
  const p = z.object({ intent: z.enum(['submit', 'approve', 'reject', 'reopen']), entries: z.array(z.string().max(100)).min(1).max(100), reason: z.string().max(2000) }).safeParse({ intent: input.get('intent'), entries: input.getAll('entry'), reason: input.get('reason') ?? '' });
  if (!p.success) return { result: { ok: false, error: { code: 'VALIDATION', message: 'Select at least one entry and the matching action.' } } };
  const ids = p.data.entries.map(entry => { const [id, version] = entry.split(':'); return { id, version: Number(version) }; });
  const result = p.data.intent === 'submit' ? await submitTimesheet(ids) : p.data.intent === 'approve' ? await approveTimesheet(ids) : p.data.intent === 'reject' ? await rejectTimesheet(ids, p.data.reason) : await reopenTimesheet(ids, p.data.reason);
  revalidatePath('/timesheets'); return { values: { reason: p.data.reason }, selectedIds: result.ok ? [] : p.data.entries, result };
}
