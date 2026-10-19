import { vi } from "vitest";
import { Pool } from "pg";
import { verifyRequestUser } from "@/lib/auth/verify-user";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
export const fixtures = {
  pbcOrganizationId: "10000000-0000-4000-8000-000000000001", otherOrganizationId: "10000000-0000-4000-8000-000000000002",
  pbcAdmin: "20000000-0000-4000-8000-000000000001", pbcSupervisor: "20000000-0000-4000-8000-000000000002", otherCompanyAdmin: "20000000-0000-4000-8000-000000000003", inactiveUser: "20000000-0000-4000-8000-000000000004",
  pbcClientId: "30000000-0000-4000-8000-000000000001", otherClientId: "30000000-0000-4000-8000-000000000002", pbcPropertyId: "40000000-0000-4000-8000-000000000001", pbcJobId: "50000000-0000-4000-8000-000000000001", unassignedJobId: "50000000-0000-4000-8000-000000000002", pbcVisitId: "60000000-0000-4000-8000-000000000001",
} as const;
let adminPool: Pool | undefined;
export async function adminQuery<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]> {
  if (!process.env.EMS_TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(new URL(process.env.EMS_TEST_DATABASE_URL).hostname)) throw new Error("Tests require a local EMS_TEST_DATABASE_URL");
  adminPool ??= new Pool({ connectionString: process.env.EMS_TEST_DATABASE_URL, max: 1 });
  return (await adminPool.query(sql, values)).rows as T[];
}
export async function resetFixtures() {
  // Setup script is JS so it can also provision actual local Auth users outside Vitest.
  const modulePath = new URL("../../scripts/local-db.mjs", import.meta.url).href;
  const fixtureModule = await import(/* @vite-ignore */ modulePath) as { resetLocalFixtures(): Promise<void> };
  await fixtureModule.resetLocalFixtures();
}
export async function asLocalUser<T>(userId: string | null, work: () => Promise<T>): Promise<T> {
  const mocked = vi.mocked(verifyRequestUser);
  if (userId) mocked.mockResolvedValue({ id: userId }); else mocked.mockRejectedValue(new Error("Authentication required"));
  try { return await work(); } finally { mocked.mockReset(); }
}
