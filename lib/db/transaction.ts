import "server-only";
import { Pool } from "pg";
import { verifyRequestUser } from "@/lib/auth/verify-user";
import type { Role } from "@/lib/domain/types";

export type EmsActor = Readonly<{ userId: string; organizationId: string; role: Role; displayName: string; organizationName: string }>;
export type EmsTx = { readonly actor: EmsActor; query<T = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<T[]> };
let pool: Pool | undefined;
function getPool() {
  if (pool) return pool;
  const connectionString = process.env.EMS_DATABASE_URL;
  if (!connectionString) throw new Error("EMS_DATABASE_URL is not configured");
  const url = new URL(connectionString);
  if (url.username !== "ems_runtime") throw new Error("EMS_DATABASE_URL must use the restricted ems_runtime role");
  const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  // Disallow connection-string SSL overrides; remote connections always verify certificates.
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(parameter);
  pool = new Pool({ connectionString: url.toString(), max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, ssl: local ? false : { rejectUnauthorized: true, ...(process.env.EMS_DATABASE_CA ? { ca: process.env.EMS_DATABASE_CA } : {}) } });
  return pool;
}
export async function withEmsTransaction<T>(work: (tx: EmsTx) => Promise<T>): Promise<T> {
  const user = await verifyRequestUser();
  const client = await getPool().connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user.id, role: "authenticated" })]);
    const membership = await client.query<{ organization_id: string; role: Role; display_name: string; name: string }>("select m.organization_id,m.role,m.display_name,o.name from ems.memberships m join ems.organizations o on o.id=m.organization_id where m.user_id=$1 and m.active order by m.created_at limit 2", [user.id]);
    if (membership.rows.length !== 1) throw new Error("Exactly one active membership required");
    const m = membership.rows[0];
    const actor: EmsActor = Object.freeze({ userId: user.id, organizationId: m.organization_id, role: m.role, displayName: m.display_name, organizationName: m.name });
    const tx: EmsTx = { actor, async query<R>(sql: string, values?: readonly unknown[]) { return (await client.query(sql, values ? [...values] : undefined)).rows as R[]; } };
    const result = await work(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}
