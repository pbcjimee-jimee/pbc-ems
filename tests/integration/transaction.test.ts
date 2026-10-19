import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/verify-user", () => ({ verifyRequestUser: vi.fn() }));
import { withEmsTransaction } from "@/lib/db/transaction";
import { resetFixtures, asLocalUser, fixtures, adminQuery } from "../helpers/database";
import { createClient } from "@supabase/supabase-js";

describe.sequential("restricted server transactions and RLS", () => {
  beforeAll(async () => { await resetFixtures(); });
  it("uses a nonowner, nonprivileged runtime connection", async () => {
    const rows = await asLocalUser(fixtures.pbcAdmin, () => withEmsTransaction(tx => tx.query<{ current_user: string; session_user: string }>("select current_user, session_user")));
    expect(rows[0]).toEqual({ current_user: "authenticated", session_user: "ems_runtime" });
  });
  it("allows own company and hides another company", async () => {
    const read = () => withEmsTransaction(tx => tx.query("select id from ems.clients where id=$1", [fixtures.pbcClientId]));
    expect(await asLocalUser(fixtures.pbcAdmin, read)).toHaveLength(1);
    expect(await asLocalUser(fixtures.otherCompanyAdmin, read)).toEqual([]);
  });
  it("rejects inactive membership and missing identity", async () => {
    await expect(asLocalUser(fixtures.inactiveUser, () => withEmsTransaction(async () => null))).rejects.toThrow("active membership");
    await expect(asLocalUser(null, () => withEmsTransaction(async () => null))).rejects.toThrow("Authentication");
  });
  it("rolls back every write after intermediate failure", async () => {
    await expect(asLocalUser(fixtures.pbcAdmin, () => withEmsTransaction(async tx => {
      await tx.query("insert into ems.clients(organization_id,display_name) values($1,'rollback witness')", [fixtures.pbcOrganizationId]);
      throw new Error("intentional failure");
    }))).rejects.toThrow("intentional failure");
    expect(await adminQuery("select id from ems.clients where display_name='rollback witness'")).toEqual([]);
  });
  it("does not retain previous actor claims", async () => {
    for (const id of [fixtures.pbcAdmin, fixtures.otherCompanyAdmin, fixtures.pbcSupervisor]) {
      const rows = await asLocalUser(id, () => withEmsTransaction(tx => tx.query<{ id: string }>("select auth.uid() as id")));
      expect(rows[0].id).toBe(id);
    }
  });
  it("allows assigned jobs but hides unassigned jobs and financial contracts", async () => {
    const data = await asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(async tx => ({
      assigned: await tx.query("select id from ems.jobs where id=$1", [fixtures.pbcJobId]),
      hidden: await tx.query("select id from ems.jobs where id=$1", [fixtures.unassignedJobId]),
      money: await tx.query("select * from ems.job_contracts"),
      othersExpenses: await tx.query("select * from ems.expenses where user_id<>auth.uid()"),
    })));
    expect(data.assigned).toHaveLength(1); expect(data.hidden).toEqual([]);
    expect(data.money).toEqual([]); expect(data.othersExpenses).toEqual([]);
  });
  it("blocks membership escalation and cross-company forged foreign keys", async () => {
    await expect(asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("update ems.memberships set role='admin' where user_id=auth.uid()")))).rejects.toThrow();
    await expect(asLocalUser(fixtures.pbcAdmin, () => withEmsTransaction(tx => tx.query("insert into ems.properties(organization_id,client_id,label,address) values($1,$2,'forged','address')", [fixtures.pbcOrganizationId, fixtures.otherClientId])))).rejects.toThrow();
  });
  it("rejects direct Data API schema and RPC bypass", async () => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const rest = await fetch(`${base}/rest/v1/clients?select=id`, { headers: { apikey: key, "Accept-Profile": "ems" } });
    expect(rest.ok).toBe(false);
    const rpc = await fetch(`${base}/rest/v1/rpc/current_organization_id`, { method: "POST", headers: { apikey: key, "Content-Profile": "ems", "Content-Type": "application/json" }, body: "{}" });
    expect(rpc.ok).toBe(false);
  });
  it("authenticates actual local accounts and ignores editable user metadata", async () => {
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await auth.auth.signInWithPassword({ email: "supervisor@ems.local", password: process.env.EMS_LOCAL_TEST_PASSWORD! });
    expect(login.error).toBeNull(); expect(login.data.user?.id).toBe(fixtures.pbcSupervisor);
    const changed = await auth.auth.updateUser({ data: { role: "admin", organization_id: fixtures.otherOrganizationId } });
    expect(changed.error).toBeNull();
    const verified = await auth.auth.getUser(); expect(verified.data.user?.id).toBe(fixtures.pbcSupervisor);
    const contracts = await asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("select * from ems.job_contracts")));
    expect(contracts).toEqual([]);
    await auth.auth.updateUser({ data: { role: null, organization_id: null } }); await auth.auth.signOut({ scope: 'local' });
  });
  it("allows supervisor assigned status but rejects metadata edits and unassigned writes", async () => {
    const changed = await asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("update ems.jobs set status='in_progress',version=version+1 where id=$1 returning id", [fixtures.pbcJobId])));
    expect(changed).toHaveLength(1);
    await expect(asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("update ems.jobs set title='forged title' where id=$1", [fixtures.pbcJobId])))).rejects.toThrow("status only");
    const hidden = await asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("update ems.jobs set status='completed' where id=$1 returning id", [fixtures.unassignedJobId])));
    expect(hidden).toEqual([]);
  });
  it("rejects supervisor approval of own timesheet", async () => {
    await expect(asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(async tx => {
      const rows = await tx.query<{ id: string }>("insert into ems.time_entries(organization_id,user_id,started_at,ended_at) values($1,$2,'2026-10-12T00:00:00Z','2026-10-12T01:00:00Z') returning id", [fixtures.pbcOrganizationId, fixtures.pbcSupervisor]);
      await tx.query("update ems.time_entries set status='approved' where id=$1", [rows[0].id]);
    }))).rejects.toThrow();
  });
  it("rejects forged audit entities and receipt paths", async () => {
    await expect(asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("insert into ems.activity_events(organization_id,actor_id,entity_type,entity_id,action) values($1,$2,'job',$3,'forged')", [fixtures.pbcOrganizationId, fixtures.pbcSupervisor, fixtures.unassignedJobId])))).rejects.toThrow();
    await expect(asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("insert into ems.attachments(organization_id,user_id,path,name,content_type,size_bytes) values($1,$2,$3,'forged','image/png',1)", [fixtures.pbcOrganizationId, fixtures.pbcSupervisor, `${fixtures.pbcOrganizationId}/${fixtures.pbcAdmin}/forged.png`])))).rejects.toThrow();
  });
  it("rejects visits with a missing timed or all-day end", async () => {
    await expect(asLocalUser(fixtures.pbcAdmin, () => withEmsTransaction(tx => tx.query("insert into ems.visits(organization_id,title,starts_at) values($1,'missing end',now())", [fixtures.pbcOrganizationId])))).rejects.toThrow();
    await expect(asLocalUser(fixtures.pbcAdmin, () => withEmsTransaction(tx => tx.query("insert into ems.visits(organization_id,title,all_day,start_date) values($1,'missing date end',true,current_date)", [fixtures.pbcOrganizationId])))).rejects.toThrow();
  });
  it("keeps uploaded receipts private and blocks another company", async () => {
    const makeAuth = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = makeAuth(), other = makeAuth(), anonymous = makeAuth();
    const ownerLogin = await owner.auth.signInWithPassword({ email: "supervisor@ems.local", password: process.env.EMS_LOCAL_TEST_PASSWORD! });
    const otherLogin = await other.auth.signInWithPassword({ email: "other@ems.local", password: process.env.EMS_LOCAL_TEST_PASSWORD! });
    expect(ownerLogin.error).toBeNull(); expect(otherLogin.error).toBeNull();
    const path = `${fixtures.pbcOrganizationId}/${fixtures.pbcSupervisor}/${crypto.randomUUID()}.png`;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=", "base64");
    const upload = await owner.storage.from("ems-receipts").upload(path, png, { contentType: "image/png" });
    expect(upload.error).toBeNull();
    try {
      await asLocalUser(fixtures.pbcSupervisor, () => withEmsTransaction(tx => tx.query("insert into ems.attachments(organization_id,user_id,path,name,content_type,size_bytes) values($1,$2,$3,'sample receipt','image/png',$4)", [fixtures.pbcOrganizationId, fixtures.pbcSupervisor, path, png.length])));
      expect((await owner.storage.from("ems-receipts").download(path)).error).toBeNull();
      expect((await other.storage.from("ems-receipts").download(path)).error).not.toBeNull();
      expect((await anonymous.storage.from("ems-receipts").download(path)).error).not.toBeNull();
      const forged = await owner.storage.from("ems-receipts").upload(`${fixtures.otherOrganizationId}/${fixtures.pbcSupervisor}/forged.png`, png, { contentType: "image/png" });
      expect(forged.error).not.toBeNull();
    } finally {
      const removed = await owner.storage.from("ems-receipts").remove([path]);
      if (removed.error) {
        const localAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.EMS_LOCAL_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
        await localAdmin.storage.from("ems-receipts").remove([path]);
      }
      await adminQuery("delete from ems.attachments where path=$1", [path]);
      await owner.auth.signOut({ scope: 'local' }); await other.auth.signOut({ scope: 'local' });
    }
  });
});
