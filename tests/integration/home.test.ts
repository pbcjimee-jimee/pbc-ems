import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verify-user', () => ({ verifyRequestUser: vi.fn() }));
import Decimal from 'decimal.js';
import { getHomeSummary } from '@/lib/home/service';
import { archiveJob, saveJob } from '@/lib/jobs/service';
import { createInvoiceFromJob, issueInvoice, listInvoices, recordPayment, saveDirectInvoice, voidInvoice, voidPayment } from '@/lib/invoices/service';
import { saveQuote } from '@/lib/quotes/service';
import { sydneyToday } from '@/lib/domain/format';
import { asLocalUser, fixtures, resetFixtures } from '../helpers/database';
import { fixtureQuoteInput, quoteCommand as meta } from '../helpers/quotes';

const admin = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcAdmin, work);
const must = <T>(result: {ok:true;data:T}|{ok:false;error:{message:string}}):T => {
  if (!result.ok) throw Error(result.error.message);
  return result.data;
};
const invoiceInput = (title:string, amount = '100.10') => ({
  clientId: fixtures.pbcClientId, propertyId: fixtures.pbcPropertyId, title,
  issuedOn: sydneyToday(), dueOn: sydneyToday(),
  publicLines: [{ ...fixtureQuoteInput().publicLines[0], unitPrice: amount, taxable: false }],
});

describe.sequential('Home pipeline aggregation', () => {
  beforeEach(async () => { await resetFixtures(); }, 60_000);

  it('adds admin pipelines and matches outstanding invoice balances without dropping existing fields', async () => admin(async () => {
    must(await saveQuote(fixtureQuoteInput(), meta()));
    const partial = must(await saveDirectInvoice(invoiceInput('Home partial'), meta()));
    const unpaid = must(await saveDirectInvoice(invoiceInput('Home unpaid', '80.20'), meta()));
    const paid = must(await saveDirectInvoice(invoiceInput('Home paid'), meta()));
    const voided = must(await saveDirectInvoice(invoiceInput('Home void'), meta()));
    must(await saveDirectInvoice(invoiceInput('Home draft', '900.99'), meta()));
    for (const invoice of [partial, unpaid, paid, voided]) {
      must(await issueInvoice(invoice.id, meta(invoice.version)));
    }
    const payment = { receivedOn: sydneyToday(), method: 'cash' };
    must(await recordPayment({ ...payment, invoiceId: partial.id, amount: '30.05' }, meta(2)));
    const cancelled = must(await recordPayment({ ...payment, invoiceId: partial.id, amount: '10.00' }, meta(3)));
    must(await voidPayment(cancelled.id, meta(4)));
    must(await recordPayment({ ...payment, invoiceId: paid.id, amount: '100.10' }, meta(2)));
    must(await voidInvoice(voided.id, meta(2)));

    const home = await getHomeSummary();
    const list = await listInvoices({ status: 'outstanding' });
    const balance = list.items.reduce((sum, invoice) => sum.plus(invoice.balance), new Decimal(0)).toFixed(2);
    expect(list.total).toBe(2);
    expect(list.items).toHaveLength(list.total);
    expect(balance).toBe('150.25');
    expect(home.pipeline.quotes).toMatchObject({ draft: { count: 1 } });
    expect(home.pipeline.invoices).toMatchObject({ outstanding: { count: list.total, amount: balance } });
    expect(home.pipeline.jobs).toMatchObject({ active: { count: 2 }, requiresInvoicing: { count: 0 } });
    expect(Object.keys(home).sort()).toEqual(['actor', 'today', 'visits', 'upcoming', 'counts', 'recent', 'finance', 'pipeline'].sort());
    expect(home.counts.active_jobs).toBe('2');
    expect(new Decimal(home.finance!.outstanding).toFixed(2)).toBe(balance);
    expect(Number(home.finance!.overdue)).toBe(home.pipeline.invoices!.overdue.count);
  }));

  it('keeps legacy to_invoice aligned with completed, unarchived jobs lacking a non-void invoice', async () => admin(async () => {
    const input = fixtureQuoteInput();
    const jobInput = { clientId: input.clientId, propertyId: input.propertyId, title: input.title, description: 'Walls and trim', publicLines: input.publicLines, status: 'completed' };
    must(await saveJob(jobInput, meta()));
    const archived = must(await saveJob(jobInput, meta()));
    must(await archiveJob(archived.id, true, meta(archived.version)));
    const invoiced = must(await saveJob(jobInput, meta()));
    const invoice = must(await createInvoiceFromJob(invoiced.id, meta(invoiced.version)));

    const before = await getHomeSummary();
    expect(before.finance!.to_invoice).toBe('1');
    expect(before.pipeline.jobs.requiresInvoicing?.count).toBe(1);
    must(await voidInvoice(invoice.id, meta(invoice.version)));
    const after = await getHomeSummary();
    expect(after.finance!.to_invoice).toBe('2');
    expect(after.pipeline.jobs.requiresInvoicing?.count).toBe(2);
  }));

  it('returns only assigned operational job metrics for supervisors without financial keys', async () => {
    await admin(async () => {
      must(await saveQuote(fixtureQuoteInput(), meta()));
      must(await saveDirectInvoice(invoiceInput('Home private invoice'), meta()));
    });
    await asLocalUser(fixtures.pbcSupervisor, async () => {
      const home = await getHomeSummary();
      expect(Object.keys(home.pipeline)).toEqual(['requests', 'jobs']);
      expect(home.pipeline).not.toHaveProperty('quotes');
      expect(home.pipeline).not.toHaveProperty('invoices');
      expect(home.pipeline.jobs).toEqual({ active: { count: 1 }, inProgress: { count: 0 } });
      expect(home.pipeline.jobs).not.toHaveProperty('requiresInvoicing');
      expect(home.finance).toBeNull();
    });
  });
});
