import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/verify-user", () => ({ verifyRequestUser: vi.fn() }));
import { saveClient, saveProperty, archiveClient, readClient, listClients } from "@/lib/clients/service";
import { saveRequest, archiveRequest, readRequest, listRequests } from "@/lib/requests/service";
import { sydneyAssessmentSchema } from "@/lib/requests/schemas";
import { resolveSydneyDateTime, formatSydneyInput } from "@/lib/domain/sydney-date-time";
import { asLocalUser, resetFixtures, fixtures, adminQuery } from "../helpers/database";
const meta = (expectedVersion = 0) => ({ expectedVersion, idempotencyKey: randomUUID() });
const admin = <T>(work: () => Promise<T>) => asLocalUser(fixtures.pbcAdmin, work);

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
});
