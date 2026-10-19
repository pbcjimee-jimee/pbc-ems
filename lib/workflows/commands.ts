import "server-only";
import { randomUUID } from "node:crypto";
import type { EmsTx } from "@/lib/db/transaction";
import type { CommandMeta } from "@/lib/domain/types";
import { commandDigest } from "@/lib/domain/command-digest";

export class WorkflowError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "WorkflowError"; }
}
export async function runCommand<T>(tx: EmsTx, operation: string, meta: CommandMeta, payload: unknown, work: () => Promise<T>): Promise<T> {
  if (!meta.idempotencyKey || meta.idempotencyKey.length > 200) throw new WorkflowError("INVALID_COMMAND", "Retry this action with a new request.");
  const digest = commandDigest({ payload, expectedVersion: meta.expectedVersion });
  const lockKey = [tx.actor.organizationId, tx.actor.userId, operation, meta.idempotencyKey].join(":");
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
  const previous = await tx.query<{ payload_digest: string; result: T }>(
    "select payload_digest,result from ems.command_receipts where organization_id=$1 and actor_id=$2 and operation=$3 and idempotency_key=$4",
    [tx.actor.organizationId, tx.actor.userId, operation, meta.idempotencyKey]);
  if (previous.length) {
    if (previous[0].payload_digest !== digest) throw new WorkflowError("COMMAND_CONFLICT", "This request was already used with different details. Reload and try again.");
    return previous[0].result;
  }
  const result = await work();
  await tx.query("insert into ems.command_receipts(id,organization_id,actor_id,operation,idempotency_key,payload_digest,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
    [randomUUID(), tx.actor.organizationId, tx.actor.userId, operation, meta.idempotencyKey, digest, JSON.stringify(result)]);
  return result;
}
export async function recordActivity(tx: EmsTx, entityType: string, entityId: string, action: string, data: Record<string, unknown> = {}): Promise<void> {
  await tx.query("insert into ems.activity_events(id,organization_id,actor_id,entity_type,entity_id,action,data) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
    [randomUUID(), tx.actor.organizationId, tx.actor.userId, entityType, entityId, action, JSON.stringify(data)]);
}
export function requireVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new WorkflowError("VERSION_CONFLICT", "Someone updated this record. Your input is kept; reload the record before saving.");
}

