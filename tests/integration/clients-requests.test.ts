import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/verify-user", () => ({ verifyRequestUser: vi.fn() }));
import { saveClient, saveProperty, archiveClient, readClient, listClients } from "@/lib/clients/service";
import { saveRequest, archiveRequest, readRequest, listRequests, readRequestPipeline } from "@/lib/requests/service";
import { withEmsTransaction } from "@/lib/db/transaction";
import { saveJob } from "@/lib/jobs/service";
import { saveVisit } from "@/lib/schedule/service";
import { sydneyAssessmentSchema } from "@/lib/requests/schemas";
import { resolveSydneyDateTime, formatSydneyInput } from "@/lib/domain/sydney-date-time";
import { asLocalUser, resetFixtures, fixtures, adminQuery } from "../helpers/database";
import { saveDirectInvoice, issueInvoice, voidInvoice, recordPayment, voidPayment } from "@/lib/invoices/service";
import { saveQuote, transitionQuote } from "@/lib/quotes/service";
import { fixtureQuoteInput } from "../helpers/quotes";
import { sydneyToday } from "@/lib/domain/format";
import type { Result } from "@/lib/domain/types";
const meta = (expectedVersion = 0) => ({ expectedVersion, idempotencyKey: randomUUID() });
const admin = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcAdmin, work);
const must = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.data; };

it("converts Sydney assessment wall times and rejects missing or ambiguous DST times", () => {
  expect(sydneyAssessmentSchema.parse("2026-11-02T10:00")).toBe("2026-11-01T23:00:00.000Z");
  expect(sydneyAssessmentSchema.parse("2026-07-02T10:00")).toBe("2026-07-02T00:00:00.000Z");
  expect(sydneyAssessmentSchema.safeParse("2026-10-04T02:30").success).toBe(false);
  expect(sydneyAssessmentSchema.safeParse("2026-04-05T02:30").success).toBe(false);
  expect(resolveSydneyDateTime("2026-04-05", "02:30", "earlier")).toEqual({ ok: true, data: { iso: "2026-04-04T15:30:00.000Z" } });
  expect(resolveSydneyDateTime("2026-04-05", "02:30", "later")).toEqual({ ok: true, data: { iso: "2026-04-04T16:30:00.000Z" } });
  expect(formatSydneyInput("2026-11-01T23:00:00Z")).toBe("2026-11-02T10:00");
  expect(resolveSydneyDateTime("2026-02-30", "10:00")).toMatchObject({ ok: false, error: { code: "INVALID_DATE_TIME" } });
});

describe.sequential("clients and requests business services", () => {
  beforeAll(async () => { await resetFixtures(); }, 60_000);
  it("stores contact, billing address and multiple independent site addresses", async () => {
    await admin(async () => {
      const saved = await saveClient({ displayName: "한글 고객 – multiple sites", email: "client@example.test", billingAddress: "Accounts, Sydney", tags: ["Commercial"], notes: "Call before arrival" }, meta());
      expect(saved.ok).toBe(true); if (!saved.ok) return;
      for (const [label, address] of [["Site one", "1 George Street"], ["Site two", "2 Pitt Street"]]) {
        expect((await saveProperty({ clientId: saved.data.id, label, address }, meta())).ok).toBe(true);
      }
      const detail = await readClient(saved.data.id);
      expect(detail?.billingAddress).toBe("Accounts, Sydney");
      expect(detail?.properties.map(p => p.address).sort()).toEqual(["1 George Street", "2 Pitt Street"]);
    });
  });
  it("rejects foreign company and wrong-client properties without creating a request", async () => {
    const foreign = await adminQuery<{id:string}>("insert into ems.properties(organization_id,client_id,label,address) values($1,$2,'Foreign','Other company') returning id", [fixtures.otherOrganizationId, fixtures.otherClientId]);
    await admin(async () => {
      const result = await saveRequest({ clientId: fixtures.pbcClientId, propertyId: foreign[0].id, title: "Site inspection" }, meta());
      expect(result).toMatchObject({ ok: false, error: { code: "INVALID_PROPERTY" } });
      const other = await saveClient({ displayName: "Different customer" }, meta()); if (!other.ok) throw new Error("create failed");
      expect(await saveRequest({ clientId: other.data.id, propertyId: fixtures.pbcPropertyId, title: "Wrong customer" }, meta())).toMatchObject({ ok: false, error: { code: "INVALID_PROPERTY" } });
    });
  });
  it("rejects a stale customer version and preserves the winning update", async () => {
    await admin(async () => {
      const first = await saveClient({ displayName: "Before" }, meta()); if (!first.ok) throw new Error("create failed");
      expect(await saveClient({ id: first.data.id, displayName: "Winner" }, meta(1))).toMatchObject({ ok: true, data: { version: 2 } });
      expect(await saveClient({ id: first.data.id, displayName: "Stale" }, meta(1))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect((await readClient(first.data.id))?.displayName).toBe("Winner");
    });
  });
  it("deduplicates retries and rejects reusing the same key with different input", async () => {
    await admin(async () => {
      const command = meta(); const input = { displayName: "Retry once" };
      const first = await saveClient(input, command);
      expect(await saveClient(input, command)).toEqual(first);
      expect(await saveClient({ displayName: "Changed payload" }, command)).toMatchObject({ ok: false, error: { code: "COMMAND_CONFLICT" } });
    });
  });
  it("validates unknown input and calendar dates before writes", async () => {
    expect(await admin(() => saveClient({ displayName: " ", email: "bad" }, meta()))).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await admin(() => saveRequest({ clientId: fixtures.pbcClientId, title: "Invalid date", preferredDate: "2026-02-30" }, meta()))).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await admin(() => saveClient({ displayName: "Injected", organizationId: fixtures.otherOrganizationId }, meta()))).toMatchObject({ ok: false });
  });
  it("enforces request workflow, date filters, optimistic version and archive", async () => {
    await admin(async () => {
      const created = await saveRequest({ clientId: fixtures.pbcClientId, propertyId: fixtures.pbcPropertyId, title: "Kitchen repaint", description: "Walls and trim", preferredDate: "2026-11-10", assessmentAt: "2026-11-01T23:00:00.000Z" }, meta()); if (!created.ok) throw new Error("create failed");
      expect((await readRequest(created.data.id))?.description).toBe("Walls and trim");
      expect((await listRequests({ search: "Kitchen", from: "2026-11-01", to: "2026-11-30" })).items.some(r => r.id === created.data.id)).toBe(true);
      expect(await saveRequest({ id: created.data.id, clientId: fixtures.pbcClientId, title: "Kitchen repaint", status: "quoted" }, meta(1))).toMatchObject({ ok: false, error: { code: "INVALID_STATUS" } });
      expect(await saveRequest({ id: created.data.id, clientId: fixtures.pbcClientId, title: "Kitchen repaint", status: "in_review" }, meta(1))).toMatchObject({ ok: true, data: { version: 2 } });
      expect(await archiveRequest(created.data.id, true, meta(1))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect((await archiveRequest(created.data.id, true, meta(2))).ok).toBe(true);
      expect((await listRequests({ archive: "archived", search: "Kitchen" })).items).toHaveLength(1);
    });
  });
  it("archives customers without deleting sites or changing existing work", async () => {
    await admin(async () => {
      const created = await saveClient({ displayName: "Archive witness" }, meta()); if (!created.ok) throw new Error("create failed");
      await saveProperty({ clientId: created.data.id, label: "Retained site", address: "Sydney" }, meta());
      expect((await archiveClient(created.data.id, true, meta(1))).ok).toBe(true);
      expect((await listClients({ search: "Archive witness" })).items).toHaveLength(0);
      expect((await readClient(created.data.id))?.properties).toHaveLength(1);
      expect(await saveRequest({ clientId: created.data.id, title: "Archived customer" }, meta())).toMatchObject({ ok: false, error: { code: "INVALID_CLIENT" } });
    });
  });
  it("denies supervisor writes and limits reads to assigned contacts without internal notes", async () => {
    const hidden=await admin(()=>saveProperty({clientId:fixtures.pbcClientId,label:'Unassigned private site',address:'Private site address'},meta()));if(!hidden.ok)throw Error(hidden.error.message);
    await asLocalUser(fixtures.pbcSupervisor, async () => {
      expect(await saveClient({ displayName: "Forbidden" }, meta())).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(await saveRequest({ clientId: fixtures.pbcClientId, title: "Forbidden" }, meta())).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      const visible = await readClient(fixtures.pbcClientId); expect(visible).not.toBeNull(); expect(visible?.notes).toBeNull(); expect(visible?.billingAddress).toBeNull();
      expect(visible?.properties.map(p=>p.id)).not.toContain(hidden.data.id);
      expect(await readClient(fixtures.otherClientId)).toBeNull();
    });
  });
  it("counts matching active and archived customers independently of the selected archive tab", async () => {
    await admin(async () => {
      const search = `Client counts ${randomUUID()}`;
      must(await saveClient({ displayName: `${search} active one` }, meta()));
      must(await saveClient({ displayName: `${search} active two` }, meta()));
      const archived = must(await saveClient({ displayName: `${search} archived` }, meta()));
      must(await archiveClient(archived.id, true, meta(archived.version)));
      for (const archive of ["active", "archived", "all"] as const) {
        const result = await listClients({ search, archive });
        expect(result.counts).toEqual({ active: 2, archived: 1, all: 3 });
        expect(result.total).toBe(result.counts[archive]);
        expect(result.items).toHaveLength(result.total);
      }
      expect((await listClients({ search: `${search} active one` })).counts).toEqual({ active: 1, archived: 0, all: 1 });
      expect((await listClients({ search: `${search} missing` })).counts).toEqual({ active: 0, archived: 0, all: 0 });
    });
  });
  it("summarizes issued receivables using live payments and excludes void and draft balances", async () => {
    await admin(async () => {
      const client = must(await saveClient({ displayName: "Receivables customer" }, meta()));
      const input = { clientId: client.id, title: "Customer invoice", issuedOn: "2020-01-01", dueOn: "2020-01-02", publicLines: fixtureQuoteInput().publicLines };
      const invoice = must(await saveDirectInvoice(input, meta()));
      const issued = must(await issueInvoice(invoice.id, meta(invoice.version)));
      must(await recordPayment({ invoiceId: invoice.id, amount: "100", receivedOn: "2020-01-02", method: "cash" }, meta(issued.version)));
      must(await recordPayment({ invoiceId: invoice.id, amount: "50", receivedOn: "2020-01-02", method: "cash" }, meta(issued.version + 1)));
      const cancelled = must(await recordPayment({ invoiceId: invoice.id, amount: "25", receivedOn: "2020-01-02", method: "cash" }, meta(issued.version + 2)));
      must(await voidPayment(cancelled.id, meta(issued.version + 3)));
      const voided = must(await saveDirectInvoice(input, meta()));
      const toVoid = must(await issueInvoice(voided.id, meta(voided.version)));
      must(await voidInvoice(voided.id, meta(toVoid.version)));
      const draft = must(await saveDirectInvoice(input, meta()));
      const detail = await readClient(client.id);
      expect(detail?.receivables).toEqual({ outstandingCount: 1, outstandingAmount: "950.00", overdueCount: 1, overdueAmount: "950.00" });
      expect(detail?.invoices).toHaveLength(3);
      expect(detail?.invoices?.find(row => row.id === invoice.id)).toMatchObject({ status: "issued", total: "1100.00", balance: "950.00", overdue: true, dueOn: "2020-01-02", number: expect.any(String) });
      for (const id of [voided.id, draft.id]) expect(detail?.invoices?.find(row => row.id === id)).toMatchObject({ balance: "0.00", overdue: false });
      const dueToday = must(await saveDirectInvoice({ ...input, dueOn: sydneyToday() }, meta()));
      must(await issueInvoice(dueToday.id, meta(dueToday.version)));
      expect((await readClient(client.id))?.invoices?.find(row => row.id === dueToday.id)?.overdue).toBe(false);
    });
  });
  it("reads current quote revision totals and job numbers while omitting supervisor financial keys", async () => {
    await admin(async () => {
      const input = fixtureQuoteInput();
      const quote = must(await saveQuote(input, meta()));
      must(await saveQuote({ ...input, id: quote.id, publicLines: input.publicLines.map(line => line.id === "public" ? { ...line, unitPrice: "2000" } : line) }, meta(quote.version)));
      const detail = await readClient(fixtures.pbcClientId);
      expect(detail?.quotes?.find(row => row.id === quote.id)).toMatchObject({ total: "2200.00", number: expect.any(String), title: input.title, status: "draft" });
      expect(detail?.jobs.find(row => row.id === fixtures.pbcJobId)?.number).toEqual(expect.any(String));
      expect(detail).toHaveProperty("invoices");
      expect(detail).toHaveProperty("receivables");
    });
    await asLocalUser(fixtures.pbcSupervisor, async () => {
      const detail = await readClient(fixtures.pbcClientId);
      expect(detail).not.toBeNull();
      for (const key of ["quotes", "invoices", "receivables"]) expect(detail).not.toHaveProperty(key);
      expect(detail?.jobs.find(row => row.id === fixtures.pbcJobId)?.number).toEqual(expect.any(String));
    });
  });
  it("records only the changed customer and site field names in update activity", async () => {
    await admin(async () => {
      const client = must(await saveClient({ displayName: "Activity customer", notes: "Private before" }, meta()));
      const site = must(await saveProperty({ clientId: client.id, label: "Site", address: "Sydney", notes: "Site private before" }, meta()));
      const updated = must(await saveClient({ id: client.id, displayName: "Activity customer", notes: "Private after", tags: ["VIP", "VIP"] }, meta(client.version)));
      must(await saveClient({ id: client.id, displayName: "Activity customer", notes: "Private after", tags: ["VIP"] }, meta(updated.version)));
      must(await saveProperty({ id: site.id, clientId: client.id, label: "Site", address: "Melbourne", notes: "Site private before", archived: true }, meta(site.version)));
      must(await archiveClient(client.id, true, meta(updated.version + 1)));
      const events = await adminQuery<{ entity_id: string; action: string; data: Record<string, unknown> }>("select entity_id,action,data from ems.activity_events where entity_id=any($1::uuid[]) order by created_at,id", [[client.id, site.id]]);
      expect(events.filter(row => row.entity_id === client.id && row.action === "updated").map(row => row.data)).toEqual([{ changed: ["notes", "tags"] }, { changed: [] }]);
      expect(events.find(row => row.entity_id === site.id && row.action === "archived")?.data).toEqual({ clientId: client.id, changed: ["address", "archived"] });
      expect(events.find(row => row.entity_id === client.id && row.action === "archived")?.data).toEqual({ changed: ["archived"] });
    });
  });
  it("counts request statuses independently of the selected tab while retaining the other filters", async () => {
    await admin(async () => {
      const search = `Request counts ${randomUUID()}`;
      const input = { clientId: fixtures.pbcClientId, propertyId: fixtures.pbcPropertyId, preferredDate: "2026-11-10" };
      for (const status of ["new", "in_review", "closed"] as const) {
        must(await saveRequest({ ...input, title: `${search} ${status}`, status }, meta()));
      }
      const quoted = must(await saveRequest({ ...input, title: `${search} quoted` }, meta()));
      const quote = must(await saveQuote({ ...fixtureQuoteInput(), requestId: quoted.id }, meta()));
      must(await transitionQuote(quote.id, "issued", meta(quote.version)));
      const archived = must(await saveRequest({ ...input, title: `${search} archived` }, meta()));
      must(await archiveRequest(archived.id, true, meta(archived.version)));
      must(await saveRequest({ ...input, title: `${search} outside dates`, preferredDate: "2026-12-01" }, meta()));
      const otherClient = must(await saveClient({ displayName: "Other request counts customer" }, meta()));
      must(await saveRequest({ clientId: otherClient.id, title: `${search} other customer`, preferredDate: input.preferredDate }, meta()));
      const filter = { search, clientId: input.clientId, from: "2026-11-01", to: "2026-11-30" };
      for (const status of ["all", "new", "in_review", "quoted", "closed"] as const) {
        const result = await listRequests({ ...filter, status });
        expect(result.counts).toEqual({ all: 4, new: 1, in_review: 1, quoted: 1, closed: 1 });
        expect(result.total).toBe(status === "all" ? 4 : 1);
        expect(result.items).toHaveLength(result.total);
      }
      expect((await listRequests({ ...filter, search: `${search} quoted`, status: "new" })).counts).toEqual({ all: 1, new: 0, in_review: 0, quoted: 1, closed: 0 });
      expect((await listRequests({ ...filter, search: `${search} missing` })).counts).toEqual({ all: 0, new: 0, in_review: 0, quoted: 0, closed: 0 });
      expect((await listRequests({ ...filter, archive: "archived" })).counts).toEqual({ all: 1, new: 1, in_review: 0, quoted: 0, closed: 0 });
      expect((await listRequests({ ...filter, archive: "all" })).counts).toEqual({ all: 5, new: 2, in_review: 1, quoted: 1, closed: 1 });
      expect((await listRequests({ ...filter, clientId: otherClient.id })).counts).toEqual({ all: 1, new: 1, in_review: 0, quoted: 0, closed: 0 });
    });
  });
  it("excludes a directly linked job from new requests and keeps draft-only quotes in new", async () => {
    await admin(async () => {
      const pipeline = () => withEmsTransaction(tx => readRequestPipeline(tx, sydneyToday()));
      const before = await pipeline();
      const input = { clientId: fixtures.pbcClientId, propertyId: fixtures.pbcPropertyId, title: "Direct job request" };
      const request = must(await saveRequest(input, meta()));
      const quote = must(await saveQuote({ ...fixtureQuoteInput(), requestId: request.id }, meta()));
      expect((await pipeline()).new.count).toBe(before.new.count + 1);
      must(await saveJob({ ...input, requestId: request.id, description: "Confirmed painting scope", publicLines: fixtureQuoteInput().publicLines }, meta()));
      expect((await readRequest(request.id))?.status).toBe("new");
      expect((await pipeline()).new.count).toBe(before.new.count);
      const quoted = must(await saveRequest({ ...input, title: "Issued quote request" }, meta()));
      const issued = must(await saveQuote({ ...fixtureQuoteInput(), requestId: quoted.id }, meta()));
      expect((await pipeline()).new.count).toBe(before.new.count + 1);
      must(await transitionQuote(issued.id, "issued", meta(issued.version)));
      expect((await pipeline()).new.count).toBe(before.new.count);
      expect((await readRequest(request.id))?.quotes.find(row => row.id === quote.id)?.status).toBe("draft");
    });
  });
  it("counts assessment requests once, includes overdue scheduled times and respects supervisor assignments", async () => {
    const pipeline = () => withEmsTransaction(tx => readRequestPipeline(tx, sydneyToday()));
    const before = await admin(pipeline);
    const supervisorBefore = await asLocalUser(fixtures.pbcSupervisor, pipeline);
    await admin(async () => {
      const input = { clientId: fixtures.pbcClientId, title: "Assessment pipeline", status: "in_review" };
      const assigned = must(await saveRequest(input, meta()));
      const hidden = must(await saveRequest(input, meta()));
      const visit = { title: "Past assessment", type: "assessment", allDay: false, startsAt: "2020-01-01T00:00:00Z", endsAt: "2020-01-01T01:00:00Z", assigneeIds: [fixtures.pbcSupervisor] };
      must(await saveVisit({ ...visit, requestId: assigned.id }, meta()));
      must(await saveVisit({ ...visit, requestId: assigned.id, status: "in_progress" }, meta()));
      must(await saveVisit({ ...visit, requestId: hidden.id, assigneeIds: [] }, meta()));
      for (const status of ["completed", "cancelled"] as const) {
        const inactive = must(await saveRequest(input, meta()));
        must(await saveVisit({ ...visit, requestId: inactive.id, status }, meta()));
      }
      for (const type of ["visit", "general"] as const) {
        const other = must(await saveRequest(input, meta()));
        must(await saveVisit({ ...visit, requestId: other.id, type }, meta()));
      }
      for (const excluded of ["closed", "archived"] as const) {
        const request = must(await saveRequest(input, meta()));
        must(await saveVisit({ ...visit, requestId: request.id }, meta()));
        if (excluded === "closed") must(await saveRequest({ ...input, id: request.id, status: "closed" }, meta(request.version)));
        else must(await archiveRequest(request.id, true, meta(request.version)));
      }
      expect(await pipeline()).toEqual({ new: before.new, assessmentScheduled: { count: before.assessmentScheduled.count + 2 }, assessmentOverdue: { count: before.assessmentOverdue.count + 2 } });
    });
    await asLocalUser(fixtures.pbcSupervisor, async () => {
      expect(await pipeline()).toEqual({ new: supervisorBefore.new, assessmentScheduled: { count: supervisorBefore.assessmentScheduled.count + 1 }, assessmentOverdue: { count: supervisorBefore.assessmentOverdue.count + 1 } });
    });
  });
  it("treats all-day assessments as overdue only after their inclusive Sydney end date", async () => {
    await admin(async () => {
      const today = sydneyToday();
      const pipeline = () => withEmsTransaction(tx => readRequestPipeline(tx, today));
      const before = await pipeline();
      const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      for (const endDate of [yesterday, today]) {
        const request = must(await saveRequest({ clientId: fixtures.pbcClientId, title: "All-day assessment", status: "in_review" }, meta()));
        must(await saveVisit({ requestId: request.id, title: "All-day assessment", type: "assessment", allDay: true, startDate: endDate, endDate }, meta()));
      }
      const future = must(await saveRequest({ clientId: fixtures.pbcClientId, title: "Future timed assessment", status: "in_review" }, meta()));
      must(await saveVisit({ requestId: future.id, title: "Future assessment", type: "assessment", allDay: false, startsAt: "2099-01-01T00:00:00Z", endsAt: "2099-01-01T01:00:00Z" }, meta()));
      expect(await pipeline()).toEqual({ new: before.new, assessmentScheduled: { count: before.assessmentScheduled.count + 3 }, assessmentOverdue: { count: before.assessmentOverdue.count + 1 } });
    });
  });
});
