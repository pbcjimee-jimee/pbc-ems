import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verify-user', () => ({ verifyRequestUser: vi.fn() }));
import { saveQuote, transitionQuote, getQuoteEditor, duplicateQuote, saveProduct, savePricingSettings, getQuoteResources } from '@/lib/quotes/service';
import { fixtures, resetFixtures, asLocalUser, adminQuery } from '../helpers/database';
import { quoteCommand as meta, fixtureQuoteInput, approveFixtureQuote, getApprovedRevision, changeFixtureProductPrice } from '../helpers/quotes';
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
