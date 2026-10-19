import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient as createAuthClient, type SupabaseClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verify-user', () => ({ verifyRequestUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
import { createClient as createStorageClient } from '@/lib/supabase/server';
import { uploadReceipt, receiptSignedUrl, deleteUnattachedReceipt } from '@/lib/expenses/receipts';
import { saveExpense, listExpenses, archiveExpense } from '@/lib/expenses/service';
import { readExpense } from '@/lib/expenses/service';
import { expenseFilterSchema } from '@/lib/expenses/schemas';
import { saveTimeEntry, startTimer, stopTimer, listTimeEntries, submitTimesheet, approveTimesheet, rejectTimesheet, reopenTimesheet } from '@/lib/timesheets/service';
import { durationMinutes } from '@/lib/timesheets/duration';
import { asLocalUser, fixtures, resetFixtures, adminQuery } from '../helpers/database';
import { countOpenTimers } from '../helpers/time';
const meta = (expectedVersion = 0) => ({ expectedVersion, idempotencyKey: randomUUID() });
const admin = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcAdmin, work);
const own = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcSupervisor, work);
const must = <T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T => { if (!r.ok) throw Error(r.error.message); return r.data; };
const expense = (extra = {}) => ({ title: 'Paint receipt', category: 'Materials', amount: '10.10', occurredOn: '2026-10-16', jobId: fixtures.pbcJobId, notes: '', ...extra });
const entry = (extra = {}) => ({ jobId: fixtures.pbcJobId, startedAt: '2026-04-04T14:30:00Z', endedAt: '2026-04-04T16:30:00Z', breakMinutes: 15, notes: '', ...extra });
describe('elapsed duration', () => {
  it('uses real elapsed minutes through Sydney DST and midnight', () => {
    expect(durationMinutes('2026-04-04T14:30:00Z', '2026-04-04T16:30:00Z', 15)).toBe(105);
    expect(durationMinutes('2026-10-03T15:30:00Z', '2026-10-03T16:30:00Z', 0)).toBe(60);
    expect(() => durationMinutes('2026-10-16T01:00:00Z', '2026-10-16T00:00:00Z', 0)).toThrow();
    expect(() => durationMinutes('2026-10-16T00:00:00Z', '2026-10-16T01:00:00Z', 61)).toThrow();
  });
});

describe.sequential('expenses and timesheets services', () => {
  beforeAll(async () => { await resetFixtures(); }, 60_000);
  it('preserves decimal amounts, retries once and scopes expense CRUD and totals', async () => {
    const saved = await own(async () => { const command = meta(); const first = must(await saveExpense(expense(), command)); expect(await saveExpense(expense(), command)).toEqual({ ok: true, data: first }); return first; });
    await admin(() => saveExpense(expense({ amount: '20.20' }), meta()));
    await own(async () => {
      const list = await listExpenses({}); expect(list.items.every(e => e.userId === fixtures.pbcSupervisor)).toBe(true); expect(list.total).toBe('10.10');
      expect(await saveExpense(expense({ id: saved.id, amount: '11.11' }), meta(1))).toMatchObject({ ok: true, data: { version: 2 } });
      expect(await saveExpense(expense({ id: saved.id }), meta(1))).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT' } });
      must(await archiveExpense(saved.id, true, meta(2))); expect((await listExpenses({})).items).toHaveLength(0);
    });
  });
  it('rejects money precision, foreign jobs and forged receipt ownership', () => own(async () => {
    expect((await saveExpense(expense({ amount: '1.001' }), meta())).ok).toBe(false);
    expect((await saveExpense(expense({ jobId: fixtures.unassignedJobId }), meta())).ok).toBe(false);
    expect((await saveExpense(expense({ jobId: randomUUID() }), meta())).ok).toBe(false);
    expect((await saveExpense(expense({ receiptPath: `${fixtures.pbcOrganizationId}/${fixtures.pbcAdmin}/${randomUUID()}.png` }), meta())).ok).toBe(false);
  }));
  it('validates receipt bytes and size, saves privately, scopes signed links and cleans unsaved uploads', async () => {
    const auth = createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await auth.auth.signInWithPassword({ email: 'supervisor@ems.local', password: process.env.EMS_LOCAL_TEST_PASSWORD! })).error).toBeNull();
    vi.mocked(createStorageClient).mockResolvedValue(auth as SupabaseClient);
    await own(async () => {
      expect((await uploadReceipt(new File(['malicious'], 'wrong.png', { type: 'image/png' }))).ok).toBe(false);
      expect((await uploadReceipt(new File([new Uint8Array(10485761)], 'huge.pdf', { type: 'application/pdf' }))).ok).toBe(false);
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=', 'base64');
      const command = meta(); const file = new File([bytes], 'receipt.png', { type: 'image/png' });
      const uploaded = must(await uploadReceipt(file, command.idempotencyKey));
      const saved = must(await saveExpense(expense({ receiptPath: uploaded.path }), command));
      const replayed = must(await uploadReceipt(file, command.idempotencyKey)); expect(replayed.path).toBe(uploaded.path);
      expect(await saveExpense(expense({ receiptPath: replayed.path }), command)).toEqual({ ok: true, data: saved });
      expect(await uploadReceipt(new File([bytes, 'different'], 'receipt.png', { type: 'image/png' }), command.idempotencyKey)).toMatchObject({ ok: false, error: { code: 'COMMAND_CONFLICT' } });
      expect((await receiptSignedUrl(saved.id)).ok).toBe(true);
      expect((await auth.storage.from('ems-receipts').download(uploaded.path)).error).toBeNull();
      expect((await deleteUnattachedReceipt(uploaded.path)).ok).toBe(false);
      const orphan = must(await uploadReceipt(new File([bytes], 'unused.png', { type: 'image/png' })));
      expect((await deleteUnattachedReceipt(orphan.path)).ok).toBe(true);
      await asLocalUser(fixtures.otherCompanyAdmin, async () => { expect((await receiptSignedUrl(saved.id)).ok).toBe(false); });
      vi.mocked(createStorageClient).mockReset();
    });
    await auth.auth.signOut({ scope: 'local' });
  });
  it('allows admin receipt replacement for a coworker while preserving owner downloads and rejecting foreign paths', async () => {
    const auth = createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await auth.auth.signInWithPassword({ email: 'admin@ems.local', password: process.env.EMS_LOCAL_TEST_PASSWORD! })).error).toBeNull();
    expect((await owner.auth.signInWithPassword({ email: 'supervisor@ems.local', password: process.env.EMS_LOCAL_TEST_PASSWORD! })).error).toBeNull();
    const saved = must(await own(() => saveExpense(expense({ title: 'Coworker replacement' }), meta())));
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=', 'base64');
    vi.mocked(createStorageClient).mockResolvedValue(auth as SupabaseClient);
    const key = randomUUID(); const file = new File([bytes], 'admin-replacement.png', { type: 'image/png' });
    const uploaded = must(await admin(() => uploadReceipt(file, key, saved.id)));
    expect(uploaded.path).toContain(`/${fixtures.pbcSupervisor}/`);
    const command = meta(1); const payload = expense({ id: saved.id, title: 'Coworker replacement', receiptPath: uploaded.path });
    await admin(async () => {
      must(await saveExpense(payload, command));
      expect((await saveExpense({ ...payload, title: 'Changed retry' }, command)).ok).toBe(false);
      expect((await deleteUnattachedReceipt(uploaded.path)).ok).toBe(false);
      const cleanupKey = randomUUID(); const unused = must(await uploadReceipt(file, cleanupKey)); must(await deleteUnattachedReceipt(unused.path));
      const retry = must(await uploadReceipt(file, cleanupKey)); expect(retry.path).not.toBe(unused.path); must(await deleteUnattachedReceipt(retry.path));
      expect((await uploadReceipt(file, randomUUID(), randomUUID())).ok).toBe(false);
    });
    const foreign = await auth.storage.from('ems-receipts').upload(`${fixtures.otherOrganizationId}/${fixtures.otherCompanyAdmin}/${randomUUID()}.png`, bytes, { contentType: 'image/png' }); expect(foreign.error).not.toBeNull();
    vi.mocked(createStorageClient).mockResolvedValue(owner as SupabaseClient);
    expect((await own(() => receiptSignedUrl(saved.id))).ok).toBe(true); expect((await owner.storage.from('ems-receipts').download(uploaded.path)).error).toBeNull();
    await auth.auth.signOut({ scope: 'local' }); await owner.auth.signOut({ scope: 'local' }); vi.mocked(createStorageClient).mockReset();
  });
  it('rejects overlapping and invalid intervals and protects stale writes', () => own(async () => {
    const saved = must(await saveTimeEntry(entry(), meta()));
    expect((await saveTimeEntry(entry(), meta())).ok).toBe(false);
    expect((await saveTimeEntry(entry({ endedAt: '2026-04-04T14:00:00Z' }), meta())).ok).toBe(false);
    expect((await saveTimeEntry(entry({ breakMinutes: 121 }), meta())).ok).toBe(false);
    expect((await saveTimeEntry(entry({ jobId: fixtures.unassignedJobId }), meta())).ok).toBe(false);
    const linked = must(await saveTimeEntry(entry({ visitId: fixtures.pbcVisitId, startedAt: '2026-07-01T22:00:00Z', endedAt: '2026-07-01T23:00:00Z' }), meta()));
    expect((await listTimeEntries({})).items.find(row => row.id === linked.id)?.visitId).toBe(fixtures.pbcVisitId);
    expect((await saveTimeEntry(entry({ visitId: fixtures.pbcVisitId, jobId: null }), meta())).ok).toBe(false);
    expect((await saveTimeEntry(entry({ visitId: randomUUID() }), meta())).ok).toBe(false);
    expect((await saveTimeEntry(entry({ id: saved.id, notes: 'updated' }), meta(1))).ok).toBe(true);
    expect(await saveTimeEntry(entry({ id: saved.id }), meta(1))).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT' } });
  }));
  it('serializes timer start and restores persisted server time before stopping with a break', () => own(async () => {
    const starts = await Promise.all([startTimer(fixtures.pbcJobId), startTimer(fixtures.pbcJobId)]);
    expect(starts.filter(r => r.ok)).toHaveLength(1); expect(await countOpenTimers(fixtures.pbcSupervisor)).toBe(1);
    const open = (await listTimeEntries({})).open!; expect(open.startedAt).toBeTruthy();
    expect(await saveTimeEntry(entry({ id: open.id }), meta(open.version))).toMatchObject({ ok: false, error: { code: 'LOCKED_ENTRY' } });
    await adminQuery("update ems.time_entries set started_at=now()-interval '65 minutes' where id=$1", [open.id]);
    must(await stopTimer(open.id, { ...meta(open.version), breakMinutes: 5 })); expect(await countOpenTimers(fixtures.pbcSupervisor)).toBe(0);
    const stopped = (await listTimeEntries({})).items.find(e => e.id === open.id)!; expect(stopped.minutes).toBe(60);
  }));
  it('submits, rejects, resubmits, approves and admin reopens with retained audit history', async () => {
    const saved = must(await own(() => saveTimeEntry(entry({ startedAt: '2026-04-05T22:00:00Z', endedAt: '2026-04-05T23:00:00Z', breakMinutes: 0 }), meta())));
    let submitted = must(await own(() => submitTimesheet([saved])))[0];
    expect((await own(() => approveTimesheet([submitted]))).ok).toBe(false);
    expect((await own(() => saveTimeEntry(entry({ id: saved.id }), meta(submitted.version)))).ok).toBe(false);
    const rejected = must(await admin(() => rejectTimesheet([submitted], 'Check the start time')))[0];
    submitted = must(await own(() => submitTimesheet([rejected])))[0];
    const approved = must(await admin(() => approveTimesheet([submitted])))[0];
    expect((await admin(() => saveTimeEntry(entry({ id: saved.id }), meta(approved.version)))).ok).toBe(false);
    const reopened = must(await admin(() => reopenTimesheet([approved], 'Correction requested')))[0]; expect(reopened.version).toBe(approved.version + 1);
    must(await admin(() => saveTimeEntry(entry({ id: saved.id, startedAt: '2026-04-05T22:00:00Z', endedAt: '2026-04-05T22:30:00Z', breakMinutes: 0 }), meta(reopened.version))));
    const history = await adminQuery<{ action: string; data: { before?: { endedAt: string }; after?: { endedAt: string }; snapshot?: { endedAt: string } } }>('select action,data from ems.activity_events where entity_id=$1 order by created_at', [saved.id]);
    expect(history.map(e => e.action)).toEqual(['created', 'submitted', 'rejected', 'submitted', 'approved', 'reopened', 'updated']);
    expect(history.find(e => e.action === 'approved')?.data.snapshot?.endedAt).toBe('2026-04-05T23:00:00.000Z');
    expect(history.at(-1)?.data).toMatchObject({ before: { endedAt: '2026-04-05T23:00:00.000Z' }, after: { endedAt: '2026-04-05T22:30:00.000Z' } });
  });
});

describe.sequential('expense pagination and direct lookup', () => {
  beforeAll(async () => { await resetFixtures(); }, 60_000);
  it('defaults and coerces valid pages while rejecting invalid pages', () => {
    expect(expenseFilterSchema.parse({}).page).toBe(1);
    expect(expenseFilterSchema.parse({ page: '2' }).page).toBe(2);
    for (const page of [0, -1, 1.5, 'invalid']) expect(expenseFilterSchema.safeParse({ page }).success).toBe(false);
  });

  it('paginates 51 expenses without changing counts or money totals and reads later pages directly', async () => {
    const search = `pagination-${randomUUID()}`;
    await adminQuery(`insert into ems.expenses(organization_id,user_id,title,category,amount,occurred_on,notes)
      select $1,$2,$3||' '||n,'Materials',10.10,date '2026-10-16','' from generate_series(1,51) n`,
    [fixtures.pbcOrganizationId, fixtures.pbcSupervisor, search]);
    await own(async () => {
      const pages = [];
      for (const page of [1, 2, 3, 4]) {
        const result = await listExpenses({ search, page });
        expect(result).toMatchObject({ page, pageSize: 25, count: 51, total: '515.10', counts: { active: 51, archived: 0, all: 51 } });
        expect(result.filter.page).toBe(page);
        pages.push(result);
      }
      expect(pages.map(page => page.items.length)).toEqual([25, 25, 1, 0]);
      expect(new Set(pages.flatMap(page => page.items.map(item => item.id))).size).toBe(51);
      expect((await listExpenses({ search })).items).toEqual(pages[0].items);
      for (const item of [...pages[1].items, ...pages[2].items]) expect(await readExpense(item.id)).toEqual(item);
      expect(await readExpense(randomUUID())).toBeNull();
      expect(await readExpense('invalid')).toBeNull();
    });
  });

  it('scopes totals and archive counts to the supervisor and retains every other filter', async () => {
    const search = `scope-${randomUUID()}`;
    const matching = expense({ title: search, category: 'Scope', amount: '10.10' });
    const owned = await own(async () => {
      const active = must(await saveExpense(matching, meta()));
      const archived = must(await saveExpense({ ...matching, amount: '20.20' }, meta()));
      must(await archiveExpense(archived.id, true, meta(1)));
      for (const extra of [{ category: 'Other' }, { occurredOn: '2026-10-15' }, { occurredOn: '2026-10-17' }, { jobId: null }, { title: 'Unrelated title' }]) {
        must(await saveExpense({ ...matching, ...extra }, meta()));
      }
      return { active, archived };
    });
    const coworker = await admin(async () => {
      const active = must(await saveExpense({ ...matching, amount: '100.00' }, meta()));
      const archived = must(await saveExpense({ ...matching, amount: '200.00' }, meta()));
      must(await archiveExpense(archived.id, true, meta(1)));
      return active;
    });
    const filters = { search, category: 'Scope', from: '2026-10-16', to: '2026-10-16', jobId: fixtures.pbcJobId };
    await own(async () => {
      for (const [archive, total, id] of [['active', '10.10', owned.active.id], ['archived', '20.20', owned.archived.id]] as const) {
        const result = await listExpenses({ ...filters, archive });
        expect(result).toMatchObject({ count: 1, total, counts: { active: 1, archived: 1, all: 2 } });
        expect(result.items.map(item => item.id)).toEqual([id]);
      }
      expect(await listExpenses({ ...filters, archive: 'all' })).toMatchObject({ count: 2, total: '30.30', counts: { active: 1, archived: 1, all: 2 } });
      expect(await listExpenses({ ...filters, search: randomUUID() })).toMatchObject({ items: [], count: 0, total: '0.00', counts: { active: 0, archived: 0, all: 0 } });
      expect(await readExpense(coworker.id)).toBeNull();
    });
    await admin(async () => {
      expect(await listExpenses({ ...filters, archive: 'all' })).toMatchObject({ count: 4, total: '330.30', counts: { active: 2, archived: 2, all: 4 } });
      expect(await readExpense(owned.archived.id)).toMatchObject({ id: owned.archived.id, userId: fixtures.pbcSupervisor });
    });
    await asLocalUser(fixtures.otherCompanyAdmin, async () => { expect(await readExpense(owned.active.id)).toBeNull(); });
  });

  it('reads an archived personal expense even when its job is no longer accessible', async () => {
    const id = randomUUID();
    await adminQuery(`insert into ems.expenses(id,organization_id,user_id,job_id,title,category,amount,occurred_on,notes,archived_at)
      values($1,$2,$3,$4,'Historical expense','Materials',12.34,'2026-10-16','',now())`,
    [id, fixtures.pbcOrganizationId, fixtures.pbcSupervisor, fixtures.unassignedJobId]);
    await own(async () => {
      expect(await readExpense(id)).toMatchObject({ id, userId: fixtures.pbcSupervisor, jobId: fixtures.unassignedJobId, jobTitle: null, amount: '12.34', archivedAt: expect.any(String) });
    });
    await admin(async () => { expect((await readExpense(id))?.jobTitle).toEqual(expect.any(String)); });
  });

  it('records only changed expense field names and normalizes equivalent amounts', async () => {
    const saved = must(await own(() => saveExpense(expense(), meta())));
    const updated = expense({ id: saved.id, title: 'Updated expense', category: 'Travel', amount: '11.1', occurredOn: '2026-10-17', notes: 'Private note', jobId: null });
    await own(async () => {
      must(await saveExpense(updated, meta(1)));
      must(await saveExpense({ ...updated, amount: '11.10' }, meta(2)));
    });
    const history = await adminQuery<{ data: { changed: string[] } }>("select data from ems.activity_events where entity_type='expense' and entity_id=$1 and action='updated' order by created_at", [saved.id]);
    expect(history).toHaveLength(2);
    expect(history[0].data).toEqual({ changed: ['title', 'category', 'amount', 'occurredOn', 'notes', 'jobId'] });
    expect(history[1].data).toEqual({ changed: [] });
  });
});
