import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verify-user', () => ({ verifyRequestUser: vi.fn() }));
import { saveQuote, transitionQuote, getQuoteEditor, duplicateQuote, saveProduct, savePricingSettings, getQuoteResources } from '@/lib/quotes/service';
import { fixtures, resetFixtures, asLocalUser, adminQuery } from '../helpers/database';
import { quoteCommand as meta, fixtureQuoteInput, approveFixtureQuote, getApprovedRevision, changeFixtureProductPrice } from '../helpers/quotes';
import { listQuotes, readQuotePipeline } from '@/lib/quotes/service';
import { withEmsTransaction } from '@/lib/db/transaction';
import { convertQuoteToJob, archiveJob } from '@/lib/jobs/service';
const admin = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcAdmin, work);
describe.sequential('quote transactions and immutable revisions', () => {
  beforeAll(async () => { await resetFixtures(); }, 60_000);
  it('separates public totals, optional selection, internal calculation and customer document', async () => admin(async () => {
    const result = await saveQuote(fixtureQuoteInput(), meta()); expect(result.ok).toBe(true); if (!result.ok) return;
    const quote = (await getQuoteEditor(result.data.id))!;
    expect(quote.revision.total).toBe('1100.00');
    expect(quote.revision.calculation.main.finalTotal).not.toBe(quote.revision.total);
    expect(quote.revision.snapshot).not.toHaveProperty('calculation');
    expect(JSON.stringify(quote.revision.snapshot)).not.toContain('Internal only');
    const input = { ...fixtureQuoteInput(), id: result.data.id }; input.publicLines[1].selected = true;
    expect((await saveQuote(input, meta(1))).ok).toBe(true);
    expect((await getQuoteEditor(result.data.id))!.revision.total).toBe('1320.00');
  }));
  it('serializes concurrent saves and rejects stale version, retry payload conflicts', async () => admin(async () => {
    const command = meta(); const input = fixtureQuoteInput(); const first = await saveQuote(input, command); if (!first.ok) throw Error(first.error.message);
    expect(await saveQuote(input, command)).toEqual(first);
    expect(await saveQuote({ ...input, title: 'Different' }, command)).toMatchObject({ ok: false, error: { code: 'COMMAND_CONFLICT' } });
    const results = await Promise.all([saveQuote({ ...input, id: first.data.id, title: 'A' }, meta(1)), saveQuote({ ...input, id: first.data.id, title: 'B' }, meta(1))]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.find(r => !r.ok)).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });
  }));
  it('freezes approved customer/price/settings snapshots and creates a new editing revision', async () => {
    const approved = await approveFixtureQuote();
    await changeFixtureProductPrice('999.99');
    expect((await getApprovedRevision(approved.id)).total).toBe(approved.total);
    await admin(async () => {
      const before = (await getQuoteEditor(approved.id))!;
      await adminQuery("update ems.clients set display_name='Changed now' where id=$1", [fixtures.pbcClientId]);
      const input = { ...fixtureQuoteInput(), id: approved.id, title: 'Revision after approval' };
      expect((await saveQuote(input, meta(before.version))).ok).toBe(true);
      const after = (await getQuoteEditor(approved.id))!;
      expect(after.status).toBe('draft'); expect(after.revision.id).not.toBe(before.revision.id);
      expect(after.approvedRevisionId).toBe(before.revision.id);
      const [old] = await adminQuery<{ customer_snapshot: { name: string } }>('select customer_snapshot from ems.quote_revisions where id=$1', [before.revision.id]);
      expect(old.customer_snapshot.name).toBe(before.revision.customer.name);
    });
  });
  it('uses authoritative DB product prices, retains old price/settings on edits, refreshes explicitly', async () => admin(async () => {
    const p = await saveProduct({ name: 'Authoritative', marketPrice: '100', actualPrice: '70', unit: '4L' }, meta()); if (!p.ok) throw Error(p.error.message);
    const input = fixtureQuoteInput(); Object.assign(input.calculation.materials[0], { productId: p.data.id, isCustom: false, marketPrice: '0.01', actualPrice: '0.01' });
    const saved = await saveQuote(input, meta()); if (!saved.ok) throw Error(saved.error.message);
    const q = (await getQuoteEditor(saved.data.id))!; expect(q.revision.calculation.input.materials[0].actualPrice).toBe('100.00');
    expect(q.revision.calculation.input.materials[0].marketPrice).toBe('0.01');
    await saveProduct({ id: p.data.id, name: 'Authoritative new', marketPrice: '300', actualPrice: '200', unit: '4L' }, meta(1));
    const resources = await getQuoteResources();
    await savePricingSettings({ ...resources.pricing, f1LabourRate: '999' }, meta(resources.pricingVersion));
    await saveQuote({ ...input, id: saved.data.id }, meta(1));
    const kept = (await getQuoteEditor(saved.data.id))!; expect(kept.revision.calculation.input.materials[0].actualPrice).toBe('100.00');
    expect(kept.revision.calculation.settings).toEqual(q.revision.calculation.settings);
    await saveQuote({ ...input, id: saved.data.id, refreshPricing: true }, meta(2));
    expect((await getQuoteEditor(saved.data.id))!.revision.calculation.input.materials[0].actualPrice).toBe('300.00');
    expect((await getQuoteEditor(saved.data.id))!.revision.calculation.settings.f1LabourRate).toBe('999');
  }));
  it('rolls back invalid property/product, audit and receipt writes atomically', async () => admin(async () => {
    const [count] = await adminQuery<{ n: string }>('select count(*)::text n from ems.quotes');
    const bad = fixtureQuoteInput(); Object.assign(bad.calculation.materials[0], { productId: fixtures.otherClientId, isCustom: false });
    const command = meta(); expect(await saveQuote(bad, command)).toMatchObject({ ok: false, error: { code: 'INVALID_PRODUCT' } });
    expect((await adminQuery<{ n: string }>('select count(*)::text n from ems.quotes'))[0].n).toBe(count.n);
    expect(await adminQuery('select id from ems.command_receipts where idempotency_key=$1', [command.idempotencyKey])).toHaveLength(0);
    expect(await saveQuote({ ...fixtureQuoteInput(), clientId: fixtures.otherClientId }, meta())).toMatchObject({ ok: false, error: { code: 'INVALID_CLIENT' } });
  }));
  it('enforces lifecycle and duplicates into a separate draft', async () => admin(async () => {
    const saved = await saveQuote(fixtureQuoteInput(), meta()); if (!saved.ok) throw Error(saved.error.message);
    expect(await transitionQuote(saved.data.id, 'approved', meta(1))).toMatchObject({ ok: false, error: { code: 'INVALID_STATUS' } });
    await transitionQuote(saved.data.id, 'issued', meta(1)); await transitionQuote(saved.data.id, 'changes_requested', meta(2));
    expect((await duplicateQuote(saved.data.id, meta(3))).ok).toBe(true);
    expect((await transitionQuote(saved.data.id, 'archived', meta(3))).ok).toBe(true);
  }));
  it('denies supervisor finance reads/writes without serializing quote internals', async () => asLocalUser(fixtures.pbcSupervisor, async () => {
    expect(await saveQuote(fixtureQuoteInput(), meta())).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await expect(getQuoteResources()).rejects.toThrow('Administrator');
  }));
});

describe.sequential('quote list status counts', () => {
  beforeAll(async () => { await resetFixtures(); }, 60_000);
  it('counts every status independently of the selected tab and applies search', async () => admin(async () => {
    const paths = [[], ['issued'], ['issued', 'changes_requested'], ['issued', 'approved'], ['issued', 'declined'], ['archived']] as const;
    for (const path of paths) {
      const status = path.at(-1) ?? 'draft';
      const saved = await saveQuote({ ...fixtureQuoteInput(), title: `T-002 counts ${status}` }, meta());
      if (!saved.ok) throw Error(saved.error.message);
      let version = saved.data.version;
      for (const next of path) {
        const changed = await transitionQuote(saved.data.id, next, meta(version));
        if (!changed.ok) throw Error(changed.error.message);
        version = changed.data.version;
      }
    }
    const all = await listQuotes({ status: 'all' });
    const expected = { all: 6, draft: 1, issued: 1, changes_requested: 1, approved: 1, declined: 1, archived: 1 };
    expect(all.counts).toEqual(expected);
    for (const status of ['draft', 'issued', 'changes_requested', 'approved', 'declined', 'archived']) {
      const selected = await listQuotes({ status });
      expect(selected.counts).toEqual(all.counts);
      expect(selected.total).toBe(1);
      expect(selected.items).toHaveLength(1);
      expect(selected.items[0].status).toBe(status);
    }
    const narrowed = await listQuotes({ search: 'T-002 counts issued', status: 'draft' });
    expect(narrowed.counts).toEqual({ ...expected, all: 1, draft: 0, changes_requested: 0, approved: 0, declined: 0, archived: 0 });
    expect(narrowed.total).toBe(0);
    expect(narrowed.items).toHaveLength(0);
    expect((await listQuotes({ search: 'T-002 counts issued', status: 'all' })).counts).toEqual(narrowed.counts);
    expect((await listQuotes({ search: 'T-002 no matching quote' })).counts).toEqual({ all: 0, draft: 0, issued: 0, changes_requested: 0, approved: 0, declined: 0, archived: 0 });
  }));
  it('counts all 26 matching quotes across pages and excludes other organizations', async () => admin(async () => {
    await adminQuery("insert into ems.quotes(organization_id,client_id,title) select $1,$2,'T-002 page counts '||n from generate_series(1,26) n", [fixtures.pbcOrganizationId, fixtures.pbcClientId]);
    await adminQuery("insert into ems.quotes(organization_id,client_id,title) values($1,$2,'T-002 page counts other company')", [fixtures.otherOrganizationId, fixtures.otherClientId]);
    const first = await listQuotes({ search: 'T-002 page counts', page: 1 });
    const second = await listQuotes({ search: 'T-002 page counts', page: 2 });
    const empty = await listQuotes({ search: 'T-002 page counts', page: 3 });
    expect(first.counts).toEqual({ all: 26, draft: 26, issued: 0, changes_requested: 0, approved: 0, declined: 0, archived: 0 });
    expect(second.counts).toEqual(first.counts);
    expect(empty.counts).toEqual(first.counts);
    expect([first.total, second.total, empty.total]).toEqual([26, 26, 26]);
    expect([first.items.length, second.items.length, empty.items.length]).toEqual([25, 1, 0]);
    expect(new Set([...first.items, ...second.items].map(q => q.id)).size).toBe(26);
  }));
});

describe.sequential('quote pipeline aggregation', () => {
  beforeAll(async () => { await resetFixtures(); }, 60_000);
  it('sums current issued totals and removes an approved revision after conversion', async () => admin(async () => {
    expect(await withEmsTransaction(readQuotePipeline)).toEqual({
      draft: { count: 0 }, awaitingResponse: { count: 0, amount: '0.00' },
      changesRequested: { count: 0 }, approvedUnconverted: { count: 0, amount: '0.00' },
    });
    for (const status of ['draft', 'issued', 'issued', 'changes_requested']) {
      const input = fixtureQuoteInput();
      if (status === 'issued') input.publicLines[0].unitPrice = '10.50';
      const saved = await saveQuote(input, meta());
      if (!saved.ok) throw Error(saved.error.message);
      if (status !== 'draft') {
        const issued = await transitionQuote(saved.data.id, 'issued', meta(1));
        if (!issued.ok) throw Error(issued.error.message);
        if (status === 'changes_requested') {
          const changed = await transitionQuote(saved.data.id, status, meta(2));
          if (!changed.ok) throw Error(changed.error.message);
        }
      }
    }
    const savedApproval = await saveQuote(fixtureQuoteInput(), meta());
    if (!savedApproval.ok) throw Error(savedApproval.error.message);
    const issuedApproval = await transitionQuote(savedApproval.data.id, 'issued', meta(1));
    if (!issuedApproval.ok) throw Error(issuedApproval.error.message);
    const approvedResult = await transitionQuote(savedApproval.data.id, 'approved', meta(2));
    if (!approvedResult.ok) throw Error(approvedResult.error.message);
    const approved = { id: savedApproval.data.id, total: (await getQuoteEditor(savedApproval.data.id))!.revision.total };
    const before = await withEmsTransaction(readQuotePipeline);
    expect(before).toEqual({
      draft: { count: 1 }, awaitingResponse: { count: 2, amount: '23.10' },
      changesRequested: { count: 1 }, approvedUnconverted: { count: 1, amount: approved.total },
    });
    const converted = await convertQuoteToJob(approved.id, meta(3));
    if (!converted.ok) throw Error(converted.error.message);
    expect(await withEmsTransaction(readQuotePipeline)).toEqual({ ...before, approvedUnconverted: { count: 0, amount: '0.00' } });
    const archived = await archiveJob(converted.data.id, true, meta(converted.data.version));
    if (!archived.ok) throw Error(archived.error.message);
    expect((await withEmsTransaction(readQuotePipeline)).approvedUnconverted).toEqual({ count: 0, amount: '0.00' });

    const revised = fixtureQuoteInput(); revised.publicLines[0].unitPrice = '20.50';
    const saved = await saveQuote({ ...revised, id: approved.id }, meta(3));
    if (!saved.ok) throw Error(saved.error.message);
    expect((await withEmsTransaction(readQuotePipeline)).approvedUnconverted).toEqual({ count: 0, amount: '0.00' });
    const issued = await transitionQuote(approved.id, 'issued', meta(saved.data.version));
    if (!issued.ok) throw Error(issued.error.message);
    const reapproved = await transitionQuote(approved.id, 'approved', meta(issued.data.version));
    if (!reapproved.ok) throw Error(reapproved.error.message);
    expect(await withEmsTransaction(readQuotePipeline)).toEqual({ ...before, approvedUnconverted: { count: 1, amount: '22.55' } });
  }));
  it('rejects supervisors with a FORBIDDEN WorkflowError', async () => asLocalUser(fixtures.pbcSupervisor, async () => {
    await expect(withEmsTransaction(readQuotePipeline)).rejects.toMatchObject({ name: 'WorkflowError', code: 'FORBIDDEN' });
  }));
});
