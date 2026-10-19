import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Result } from '@/lib/domain/types';
import { WorkflowError, runCommand } from '@/lib/workflows/commands';
import { personalMutation } from './service';
export const RECEIPT_BUCKET = 'ems-receipts';
const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
function validSignature(type: string, b: Uint8Array): boolean {
  if (type === 'image/jpeg') return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n);
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (type === 'application/pdf') return ascii(0, 5) === '%PDF-';
  return type === 'image/webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
}
export async function uploadReceipt(input: unknown, commandKey: unknown = randomUUID(), expenseId?: unknown): Promise<Result<{ path: string; name: string }>> {
  if (!(input instanceof File) || !input.size || input.size > 10485760 || !mimeExtensions[input.type]) return { ok: false, error: { code: 'INVALID_FILE', message: 'Choose a JPEG, PNG, WebP or PDF receipt up to 10 MiB.' } };
  const bytes = new Uint8Array(await input.arrayBuffer());
  if (!validSignature(input.type, bytes)) return { ok: false, error: { code: 'INVALID_FILE', message: 'The file content does not match its format. Choose the original receipt file.' } };
  const key = z.string().min(1).max(200).safeParse(commandKey); const existingId = z.uuid().optional().safeParse(expenseId);
  if (!key.success || !existingId.success) return { ok: false, error: { code: 'INVALID_COMMAND', message: 'Reload the expense before uploading a receipt.' } };
  const name = input.name.replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'Receipt';
  let uploadedPath: string | undefined;
  const payload = { digest: createHash('sha256').update(bytes).digest('hex'), name, type: input.type, size: input.size, expenseId: existingId.data ?? null };
  const saved = await personalMutation(tx => runCommand(tx, 'receipt.upload', { expectedVersion: 0, idempotencyKey: key.data }, payload, async () => {
    let ownerId = tx.actor.userId;
    if (existingId.data) {
      const [expense] = await tx.query<{ user_id: string }>('select user_id from ems.expenses where id=$1 and organization_id=$2', [existingId.data, tx.actor.organizationId]);
      if (!expense) throw new WorkflowError('NOT_FOUND', 'Expense not found.');
      if (expense.user_id !== tx.actor.userId && tx.actor.role !== 'admin') throw new WorkflowError('FORBIDDEN', 'You cannot upload receipts for this expense.');
      ownerId = expense.user_id;
    }
    const path = `${tx.actor.organizationId}/${ownerId}/${randomUUID()}.${mimeExtensions[input.type]}`;
    const storage = await createClient();
    // Storage and Postgres do not share a transaction; remember the object for compensation on failure.
    uploadedPath = path;
    const uploaded = await storage.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType: input.type, upsert: false, cacheControl: '60' });
    if (uploaded.error) throw new WorkflowError('UPLOAD_FAILED', 'The receipt could not upload. Check your connection and choose the file again.');
    await tx.query('insert into ems.attachments(organization_id,user_id,path,name,content_type,size_bytes) values($1,$2,$3,$4,$5,$6)', [tx.actor.organizationId, ownerId, path, name, input.type, input.size]); return { path, name };
  }));
  if (!saved.ok && uploadedPath) {
    const storage = await createClient(); const removed = await storage.storage.from(RECEIPT_BUCKET).remove([uploadedPath]);
    if (removed.error) return { ok: false, error: { code: 'RECEIPT_CLEANUP_FAILED', message: 'Receipt saving failed and the unused file could not be removed. Ask an administrator to review the upload before retrying.' } };
  }
  return saved;
}
export async function receiptSignedUrl(expenseId: unknown): Promise<Result<{ url: string }>> {
  const p = z.uuid().safeParse(expenseId); if (!p.success) return { ok: false, error: { code: 'NOT_FOUND', message: 'Receipt not found.' } };
  return personalMutation(async tx => {
    const [row] = await tx.query<{ path: string }>('select a.path from ems.expenses e join ems.attachments a on a.path=e.receipt_path and a.expense_id=e.id and a.organization_id=e.organization_id where e.id=$1 and e.organization_id=$2', [p.data, tx.actor.organizationId]);
    if (!row) throw new WorkflowError('NOT_FOUND', 'Receipt not found or not accessible.');
    const storage = await createClient(); const signed = await storage.storage.from(RECEIPT_BUCKET).createSignedUrl(row.path, 60, { download: true });
    if (signed.error) throw new WorkflowError('RECEIPT_UNAVAILABLE', 'The receipt link could not be created. Try again.'); return { url: signed.data.signedUrl };
  });
}
export async function deleteUnattachedReceipt(path: unknown): Promise<Result<{ path: string }>> {
  if (!z.string().max(300).safeParse(path).success) return { ok: false, error: { code: 'INVALID_PATH', message: 'Receipt not found.' } };
  return personalMutation(async tx => {
    const [row] = await tx.query<{ id: string }>('select a.id from ems.attachments a where a.path=$1 and a.organization_id=$2 and (a.user_id=$3 or $4) and not exists(select 1 from ems.expenses e where e.receipt_path=a.path and e.organization_id=a.organization_id) for update', [path, tx.actor.organizationId, tx.actor.userId, tx.actor.role === 'admin']);
    if (!row) throw new WorkflowError('RECEIPT_IN_USE', 'Only your unused uploaded receipts can be removed.');
    const storage = await createClient(); const deleted = await storage.storage.from(RECEIPT_BUCKET).remove([String(path)]);
    if (deleted.error) throw new WorkflowError('CLEANUP_FAILED', 'The unused receipt could not be removed. Try again.');
    await tx.query("delete from ems.command_receipts where organization_id=$1 and operation='receipt.upload' and result->>'path'=$2", [tx.actor.organizationId, path]);
    await tx.query('delete from ems.attachments where id=$1 and organization_id=$2', [row.id, tx.actor.organizationId]); return { path: String(path) };
  });
}
