import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verify-user', () => ({ verifyRequestUser: vi.fn() }));

import { saveClient, saveProperty } from '@/lib/clients/service';
import { withEmsTransaction } from '@/lib/db/transaction';
import type { Result } from '@/lib/domain/types';
import { createInvoiceFromJob, issueInvoice, recordPayment } from '@/lib/invoices/service';
import { changeJobStatus, convertQuoteToJob, saveJob } from '@/lib/jobs/service';
import { saveQuote, transitionQuote } from '@/lib/quotes/service';
import { saveRequest } from '@/lib/requests/service';
import { saveVisit } from '@/lib/schedule/service';
import { recordActivity } from '@/lib/workflows/commands';
import { listActivity } from '@/lib/workflows/queries';
import { adminQuery, asLocalUser, fixtures, resetFixtures } from '../helpers/database';
import { fixtureQuoteInput, quoteCommand as meta } from '../helpers/quotes';

const admin = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcAdmin, work);
const must = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
};
const jobInput = (clientId: string = fixtures.pbcClientId) => ({
  clientId, title: 'Activity job', description: 'Private scope 98765.43',
  notes: 'Private job memo', publicLines: fixtureQuoteInput().publicLines,
});
const visitInput = () => ({
  title: 'Activity visit', allDay: true, startDate: '2026-10-21', endDate: '2026-10-21',
});

describe.sequential('administrator activity timeline', () => {
  beforeAll(async () => { await resetFixtures(); }, 60_000);

  it('returns job changes newest first with membership names and safe summaries', async () => admin(async () => {
    const job = must(await saveJob(jobInput(), meta()));
    const completed = must(await changeJobStatus(job.id, 'completed', meta(job.version)));
    must(await changeJobStatus(job.id, 'in_progress', meta(completed.version)));

    const events = await listActivity({ entityType: 'job', entityId: job.id });
    expect(events.map(event => event.action)).toEqual(['status_changed', 'status_changed', 'created']);
    expect(events[0]).toMatchObject({
      entityType: 'job', entityId: job.id, actorName: 'Sample administrator',
      summary: 'Status changed to In progress',
    });
    expect(events[1].summary).toBe('Status changed to Completed');
    expect(events.every(event => typeof event.createdAt === 'string')).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/98765\.43|Private job memo|snapshot/);
  }));

  it('includes only the requested client and its direct related entities', async () => {
    const own = await admin(async () => {
      const client = must(await saveClient({ displayName: 'Timeline customer' }, meta()));
      const property = must(await saveProperty({ clientId: client.id, label: 'Site', address: 'Site address' }, meta()));
      const request = must(await saveRequest({ clientId: client.id, title: 'Enquiry' }, meta()));
      const quote = must(await saveQuote({ ...fixtureQuoteInput(), clientId: client.id, propertyId: property.id }, meta()));
      const job = must(await saveJob(jobInput(client.id), meta()));
      const invoice = must(await createInvoiceFromJob(job.id, meta(job.version)));
      const visit = must(await saveVisit({ ...visitInput(), jobId: job.id }, meta()));
      const otherClient = must(await saveClient({ displayName: 'Unrelated customer' }, meta()));
      const otherJob = must(await saveJob(jobInput(otherClient.id), meta()));
      return { client, property, request, quote, job, invoice, visit, otherJob };
    });
    const foreignJob = await asLocalUser(fixtures.otherCompanyAdmin, async () =>
      must(await saveJob(jobInput(fixtures.otherClientId), meta())));

    await admin(async () => {
      const events = await listActivity({ entityType: 'client', entityId: own.client.id, includeRelated: true, limit: 50 });
      expect(new Set(events.map(event => event.entityId))).toEqual(new Set([
        own.client.id, own.property.id, own.request.id, own.quote.id, own.job.id, own.invoice.id,
      ]));
      expect(events.some(event => event.entityId === own.otherJob.id || event.entityId === foreignJob.id || event.entityId === own.visit.id)).toBe(false);
      expect(new Set(events.map(event => event.id)).size).toBe(events.length);
      expect((await listActivity({ entityType: 'client', entityId: own.client.id })).map(event => event.entityType)).toEqual(['client']);
      expect(await listActivity({ entityType: 'client', entityId: fixtures.otherClientId, includeRelated: true })).toEqual([]);
    });
  });

  it('includes request quotes, direct and converted jobs, and their visits without invoices or sibling requests', async () => admin(async () => {
    const request = must(await saveRequest({ clientId: fixtures.pbcClientId, propertyId: fixtures.pbcPropertyId, title: 'Timeline request' }, meta()));
    const quote = must(await saveQuote({ ...fixtureQuoteInput(), requestId: request.id }, meta()));
    const issued = must(await transitionQuote(quote.id, 'issued', meta(quote.version)));
    const approved = must(await transitionQuote(quote.id, 'approved', meta(issued.version)));
    const converted = must(await convertQuoteToJob(quote.id, meta(approved.version)));
    const direct = must(await saveJob({ ...jobInput(), propertyId: fixtures.pbcPropertyId, requestId: request.id }, meta()));
    const invoice = must(await createInvoiceFromJob(converted.id, meta(converted.version)));
    const assessment = must(await saveVisit({ ...visitInput(), requestId: request.id }, meta()));
    const visit = must(await saveVisit({ ...visitInput(), jobId: converted.id, requestId: request.id }, meta()));
    const directVisit = must(await saveVisit({ ...visitInput(), jobId: direct.id }, meta()));
    const sibling = must(await saveRequest({ clientId: fixtures.pbcClientId, title: 'Sibling request' }, meta()));
    must(await saveVisit({ ...visitInput(), requestId: sibling.id }, meta()));

    const events = await listActivity({ entityType: 'request', entityId: request.id, includeRelated: true, limit: 50 });
    expect(new Set(events.map(event => event.entityId))).toEqual(new Set([
      request.id, quote.id, converted.id, direct.id, assessment.id, visit.id, directVisit.id,
    ]));
    expect(events.some(event => event.entityId === invoice.id || event.entityId === sibling.id)).toBe(false);
    expect(new Set(events.map(event => event.id)).size).toBe(events.length);
    expect(events.find(event => event.action === 'converted')?.summary).toBe('Job created from quote');
    const quoteEvents = await listActivity({ entityType: 'quote', entityId: quote.id, includeRelated: true });
    expect(quoteEvents).toHaveLength(3);
    expect(quoteEvents.every(event => event.entityType === 'quote' && event.entityId === quote.id)).toBe(true);
  }));

  it('includes job visits and invoices and summarizes invoice payments without their payloads', async () => admin(async () => {
    const job = must(await saveJob(jobInput(), meta()));
    const invoice = must(await createInvoiceFromJob(job.id, meta(job.version)));
    const issued = must(await issueInvoice(invoice.id, meta(invoice.version)));
    const payment = must(await recordPayment({
      invoiceId: invoice.id, amount: '123.45', receivedOn: '2026-10-20', method: 'cash',
      notes: 'Private payment memo', reference: 'Private reference',
    }, meta(issued.version)));
    const visit = must(await saveVisit({ ...visitInput(), jobId: job.id }, meta()));

    // Exercise payment-entity events too; today's payment service writes against the invoice.
    await withEmsTransaction(async tx => {
      await recordActivity(tx, 'payment', payment.id, 'payment_recorded', { amount: '123.45', notes: 'Private payment memo' });
      await recordActivity(tx, 'visit', invoice.id, 'created');
    });
    const events = await listActivity({ entityType: 'job', entityId: job.id, includeRelated: true });
    expect(new Set(events.map(event => event.entityId))).toEqual(new Set([job.id, visit.id, invoice.id]));
    expect(events.some(event => event.entityType === 'payment' || (event.entityType === 'visit' && event.entityId === invoice.id))).toBe(false);
    expect(events.find(event => event.action === 'payment_recorded')?.summary).toBe('Payment recorded');
    const invoiceEvents = await listActivity({ entityType: 'invoice', entityId: invoice.id, includeRelated: true });
    expect(invoiceEvents.some(event => event.entityType === 'payment' && event.entityId === payment.id)).toBe(true);
    expect(invoiceEvents.every(event => event.entityType === 'invoice' || event.entityType === 'payment')).toBe(true);
    expect((await listActivity({ entityType: 'invoice', entityId: invoice.id })).some(event => event.entityType === 'payment')).toBe(false);
    expect(JSON.stringify(invoiceEvents)).not.toMatch(/123\.45|Private payment memo|Private reference|"data"|snapshot/);
  }));

  it('uses a stable ID tie-breaker, defaults to 20 events, and caps requests at 50', async () => admin(async () => {
    const job = must(await saveJob(jobInput(), meta()));
    await withEmsTransaction(async tx => {
      for (let index = 0; index < 55; index++) await recordActivity(tx, 'job', job.id, 'updated');
    });
    const expected = await adminQuery<{ id: string }>(
      'select id from ems.activity_events where organization_id=$1 and entity_type=$2 and entity_id=$3 order by created_at desc,id desc limit 50',
      [fixtures.pbcOrganizationId, 'job', job.id],
    );
    const defaultEvents = await listActivity({ entityType: 'job', entityId: job.id });
    const cappedEvents = await listActivity({ entityType: 'job', entityId: job.id, limit: 100 });
    expect(defaultEvents.map(event => event.id)).toEqual(expected.slice(0, 20).map(event => event.id));
    expect(cappedEvents.map(event => event.id)).toEqual(expected.map(event => event.id));
    expect(await listActivity({ entityType: 'job', entityId: job.id, limit: 0 })).toEqual([]);
  }));

  it('returns an empty array for supervisors, inactive members and signed-out visitors', async () => {
    for (const user of [fixtures.pbcSupervisor, fixtures.inactiveUser, null]) {
      await asLocalUser(user, async () => {
        expect(await listActivity({ entityType: 'job', entityId: fixtures.pbcJobId, includeRelated: true })).toEqual([]);
      });
    }
  });
});
