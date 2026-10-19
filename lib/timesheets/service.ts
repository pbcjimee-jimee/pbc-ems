import 'server-only';
import { z } from 'zod';
import { withEmsTransaction, type EmsTx } from '@/lib/db/transaction';
import { requireAdmin } from '@/lib/auth/permissions';
import type { Result, Versioned } from '@/lib/domain/types';
import { personalMutation, validatePersonalJob } from '@/lib/expenses/service';
import { WorkflowError, runCommand, requireVersion, recordActivity } from '@/lib/workflows/commands';
import { durationMinutes } from './duration';
import { timeEntrySchema, entrySelectionSchema, timeFilterSchema, commandMetaSchema, invalidResult } from './schemas';
export type TimeEntry = Versioned & { userId: string; worker: string; jobId: string | null; jobTitle: string | null; visitId: string | null; startedAt: string; endedAt: string | null; breakMinutes: number; status: 'draft' | 'submitted' | 'approved'; notes: string; rejectionReason: string | null; minutes: number | null };
async function timeSnapshot(tx: EmsTx, id: string) {
  const [row] = await tx.query<{ userId: string; jobId: string | null; visitId: string | null; startedAt: string; endedAt: string | null; breakMinutes: number; status: string; notes: string; version: number }>('select user_id as "userId",job_id as "jobId",visit_id as "visitId",started_at::text as "startedAt",ended_at::text as "endedAt",break_minutes as "breakMinutes",status,notes,version from ems.time_entries where id=$1 and organization_id=$2', [id, tx.actor.organizationId]);
  return { ...row, startedAt: new Date(row.startedAt).toISOString(), endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null };
}
async function lockWorker(tx: EmsTx, userId: string) { await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`time:${tx.actor.organizationId}:${userId}`]); }
async function validateVisit(tx: EmsTx, visitId?: string | null, jobId?: string | null) {
  if (visitId && !(await tx.query('select id from ems.visits where id=$1 and organization_id=$2 and job_id is not distinct from $3::uuid', [visitId, tx.actor.organizationId, jobId ?? null])).length) throw new WorkflowError('INVALID_VISIT', 'Choose an assigned visit belonging to this job.');
}
async function checkOverlap(tx: EmsTx, userId: string, start: string, end: string | null, except?: string) {
  const rows = await tx.query("select id from ems.time_entries where organization_id=$1 and user_id=$2 and ($5::uuid is null or id<>$5) and tstzrange(started_at,ended_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)')", [tx.actor.organizationId, userId, start, end, except ?? null]);
  if (rows.length) throw new WorkflowError('OVERLAPPING_TIME', 'This time overlaps an existing entry or running timer. Review those entries first.');
}
export async function saveTimeEntry(input: unknown, meta: unknown): Promise<Result<Versioned>> {
  const p = timeEntrySchema.safeParse(input); if (!p.success) return invalidResult(p.error); const m = commandMetaSchema.safeParse(meta); if (!m.success) return invalidResult(m.error); const d = p.data;
  try { durationMinutes(d.startedAt, d.endedAt, d.breakMinutes); } catch { return { ok: false, error: { code: 'INVALID_DURATION', message: 'End must follow start and the break must fit inside the entry.', fields: { endedAt: 'Check the end time and break.' } } }; }
  return personalMutation(tx => runCommand(tx, 'time.save', m.data, d, async () => {
    let userId = tx.actor.userId;
    if (d.id) {
      const [owner] = await tx.query<{ user_id: string }>('select user_id from ems.time_entries where id=$1 and organization_id=$2', [d.id, tx.actor.organizationId]);
      if (!owner) throw new WorkflowError('NOT_FOUND', 'Time entry not found.'); userId = owner.user_id;
    }
    await lockWorker(tx, userId);
    if (d.id) { const [current] = await tx.query<Versioned & { status: string; ended_at: string | null }>('select id,version,status,ended_at::text from ems.time_entries where id=$1 and organization_id=$2 for update', [d.id, tx.actor.organizationId]); if (!current) throw new WorkflowError('NOT_FOUND', 'Time entry not found.'); requireVersion(current.version, m.data.expectedVersion); if (current.status !== 'draft' || !current.ended_at) throw new WorkflowError('LOCKED_ENTRY', 'Only closed draft entries can change. Stop running timers first, or ask an administrator to reopen approved time.'); }
    else requireVersion(0, m.data.expectedVersion);
    await validatePersonalJob(tx, d.jobId); await validateVisit(tx, d.visitId, d.jobId); await checkOverlap(tx, userId, d.startedAt, d.endedAt, d.id);
    const before = d.id ? await timeSnapshot(tx, d.id) : null;
    const args = [d.jobId ?? null, d.visitId ?? null, d.startedAt, d.endedAt, d.breakMinutes, d.notes];
    const [saved] = d.id ? await tx.query<Versioned>('update ems.time_entries set job_id=$1,visit_id=$2,started_at=$3,ended_at=$4,break_minutes=$5,notes=$6,version=version+1 where id=$7 and organization_id=$8 returning id,version', [...args, d.id, tx.actor.organizationId]) : await tx.query<Versioned>('insert into ems.time_entries(job_id,visit_id,started_at,ended_at,break_minutes,notes,organization_id,user_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,version', [...args, tx.actor.organizationId, userId]);
    await recordActivity(tx, 'time_entry', saved.id, d.id ? 'updated' : 'created', { before, after: await timeSnapshot(tx, saved.id) }); return saved;
  }));
}
export async function startTimer(jobId: unknown): Promise<Result<Versioned>> {
  const p = z.uuid().safeParse(jobId); if (!p.success) return invalidResult(p.error);
  return personalMutation(async tx => {
    await lockWorker(tx, tx.actor.userId); await validatePersonalJob(tx, p.data);
    const [clock] = await tx.query<{ now: string }>('select clock_timestamp()::text as now');
    await checkOverlap(tx, tx.actor.userId, clock.now, null);
    const [saved] = await tx.query<Versioned>('insert into ems.time_entries(organization_id,user_id,job_id,started_at) values($1,$2,$3,$4) returning id,version', [tx.actor.organizationId, tx.actor.userId, p.data, clock.now]); await recordActivity(tx, 'time_entry', saved.id, 'timer_started', { snapshot: await timeSnapshot(tx, saved.id) }); return saved;
  });
}
export async function stopTimer(entryId: unknown, meta: unknown): Promise<Result<Versioned>> {
  const p = z.object({ id: z.uuid(), meta: commandMetaSchema.extend({ breakMinutes: z.number().int().min(0).max(1440).default(0), notes: z.string().max(10000).optional() }) }).safeParse({ id: entryId, meta }); if (!p.success) return invalidResult(p.error); const d = p.data;
  return personalMutation(tx => runCommand(tx, 'time.stop', d.meta, { id: d.id, breakMinutes: d.meta.breakMinutes, notes: d.meta.notes }, async () => {
    await lockWorker(tx, tx.actor.userId);
    const [current] = await tx.query<Versioned & { started_at: string; ended_at: string | null; user_id: string; status: string }>('select id,version,started_at::text,ended_at::text,user_id,status from ems.time_entries where id=$1 and organization_id=$2 for update', [d.id, tx.actor.organizationId]);
    if (!current || current.user_id !== tx.actor.userId) throw new WorkflowError('NOT_FOUND', 'Your running timer was not found.'); requireVersion(current.version, d.meta.expectedVersion);
    if (current.ended_at || current.status !== 'draft') throw new WorkflowError('TIMER_CLOSED', 'This timer has already stopped. Reload the entry.');
    const [clock] = await tx.query<{ now: string }>('select clock_timestamp()::text as now');
    try { durationMinutes(current.started_at, clock.now, d.meta.breakMinutes); } catch { throw new WorkflowError('INVALID_DURATION', 'The break cannot exceed the running time.'); }
    const before = await timeSnapshot(tx, current.id);
    const [saved] = await tx.query<Versioned>('update ems.time_entries set ended_at=$1,break_minutes=$2,notes=coalesce($3,notes),version=version+1 where id=$4 and organization_id=$5 returning id,version', [clock.now, d.meta.breakMinutes, d.meta.notes ?? null, d.id, tx.actor.organizationId]); await recordActivity(tx, 'time_entry', saved.id, 'timer_stopped', { before, after: await timeSnapshot(tx, saved.id) }); return saved;
  }));
}
async function transition(ids: unknown, action: 'submitted' | 'approved' | 'rejected' | 'reopened', reason?: unknown): Promise<Result<Versioned[]>> {
  const p = z.object({ ids: entrySelectionSchema, reason: z.string().trim().max(2000).default('') }).safeParse({ ids, reason }); if (!p.success) return invalidResult(p.error); const d = p.data;
  if (['rejected', 'reopened'].includes(action) && !d.reason) return { ok: false, error: { code: 'REASON_REQUIRED', message: 'Enter a reason so the worker knows what to correct.' } };
  return personalMutation(async tx => {
    if (action !== 'submitted') { if (tx.actor.role !== 'admin') throw new WorkflowError('FORBIDDEN', 'Only an administrator can approve, reject or reopen time.'); await requireAdmin(tx); }
    const results: Versioned[] = [];
    for (const selected of [...d.ids].sort((a, b) => a.id.localeCompare(b.id))) {
      const [current] = await tx.query<Versioned & { status: string; user_id: string; ended_at: string | null }>('select id,version,status,user_id,ended_at::text from ems.time_entries where id=$1 and organization_id=$2 for update', [selected.id, tx.actor.organizationId]);
      if (!current) throw new WorkflowError('NOT_FOUND', 'One of the selected time entries was not found.'); requireVersion(current.version, selected.version);
      const expected = action === 'submitted' ? 'draft' : action === 'reopened' ? 'approved' : 'submitted';
      if (current.status !== expected || !current.ended_at) throw new WorkflowError('INVALID_STATUS', `Only closed ${expected} entries can be ${action}.`);
      if (action === 'submitted' && current.user_id !== tx.actor.userId) throw new WorkflowError('FORBIDDEN', 'Submit your own time entries.');
      const status = action === 'submitted' ? 'submitted' : action === 'approved' ? 'approved' : 'draft';
      const [saved] = await tx.query<Versioned>("update ems.time_entries set status=$1,rejection_reason=$2,approved_at=case when $1='approved' then now() else null end,version=version+1 where id=$3 and organization_id=$4 returning id,version", [status, ['rejected', 'reopened'].includes(action) ? d.reason : null, current.id, tx.actor.organizationId]);
      await recordActivity(tx, 'time_entry', saved.id, action, { reason: d.reason, previousStatus: current.status, snapshot: await timeSnapshot(tx, saved.id) }); results.push(saved);
    }
    return results;
  });
}
export async function submitTimesheet(ids: unknown): Promise<Result<Versioned[]>> { return transition(ids, 'submitted'); }
export async function approveTimesheet(ids: unknown): Promise<Result<Versioned[]>> { return transition(ids, 'approved'); }
export async function rejectTimesheet(ids: unknown, reason: unknown): Promise<Result<Versioned[]>> { return transition(ids, 'rejected', reason); }
export async function reopenTimesheet(ids: unknown, reason: unknown): Promise<Result<Versioned[]>> { return transition(ids, 'reopened', reason); }
export async function listTimeEntries(filters: unknown = {}) {
  const filter = timeFilterSchema.parse(filters);
  return withEmsTransaction(async tx => {
    const rows = await tx.query<Omit<TimeEntry, 'minutes'>>(`select t.id,t.version,t.user_id as "userId",m.display_name as worker,t.job_id as "jobId",j.title as "jobTitle",t.visit_id as "visitId",t.started_at::text as "startedAt",t.ended_at::text as "endedAt",t.break_minutes as "breakMinutes",t.status,t.notes,t.rejection_reason as "rejectionReason" from ems.time_entries t join ems.memberships m on m.organization_id=t.organization_id and m.user_id=t.user_id left join ems.jobs j on j.id=t.job_id and j.organization_id=t.organization_id where t.organization_id=$1 and ($2::uuid is null or t.user_id=$2) and ($3='' or (t.started_at at time zone 'Australia/Sydney')::date>=nullif($3,'')::date) and ($4='' or (t.started_at at time zone 'Australia/Sydney')::date<=nullif($4,'')::date) and ($5::uuid is null or t.job_id=$5) and ($6='all' or t.status=$6) and ($7::uuid is null or t.id=$7) order by t.started_at desc`, [tx.actor.organizationId, tx.actor.role === 'admin' && filter.scope === 'all' ? filter.userId ?? null : tx.actor.userId, filter.from, filter.to, filter.jobId ?? null, filter.status, filter.entryId ?? null]);
    const items = rows.map(row => ({ ...row, minutes: row.endedAt ? durationMinutes(row.startedAt, row.endedAt, row.breakMinutes) : null }));
    // Restore a personal running timer even when the visible week or approval filters exclude it.
    const [open] = await tx.query<{ id: string; version: number; startedAt: string; jobId: string | null; jobTitle: string | null }>('select t.id,t.version,t.started_at::text as "startedAt",t.job_id as "jobId",j.title as "jobTitle" from ems.time_entries t left join ems.jobs j on j.id=t.job_id and j.organization_id=t.organization_id where t.organization_id=$1 and t.user_id=$2 and t.ended_at is null', [tx.actor.organizationId, tx.actor.userId]);
    const [clock] = await tx.query<{ serverNow: string }>('select clock_timestamp()::text as "serverNow"');
    return { items, open: open ?? null, serverNow: clock.serverNow, filter, totalMinutes: items.reduce((sum, row) => sum + (row.minutes ?? 0), 0) };
  });
}
