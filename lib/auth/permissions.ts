import "server-only";
import { withEmsTransaction, type EmsActor, type EmsTx } from "@/lib/db/transaction";
export async function requireAdmin(tx: EmsTx): Promise<void> {
  if (tx.actor.role !== "admin") throw new Error("Administrator permission required");
}
export async function requireMembership(): Promise<EmsActor> { return withEmsTransaction(async tx => tx.actor); }
export async function getCurrentMembership(): Promise<EmsActor | null> {
  try { return await requireMembership(); } catch { return null; }
}
