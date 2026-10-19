'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Result } from '@/lib/domain/types';
import { saveExpense, archiveExpense } from '@/lib/expenses/service';
import { uploadReceipt, deleteUnattachedReceipt, receiptSignedUrl } from '@/lib/expenses/receipts';
import { expenseSchema, commandMetaSchema, invalidResult } from '@/lib/expenses/schemas';
export type ExpenseFormState = { result?: Result<unknown>; values?: Record<string, string> };
export async function saveExpenseAction(_previous: unknown, input: unknown): Promise<ExpenseFormState> {
  if (!(input instanceof FormData)) return { result: { ok: false, error: { code: 'VALIDATION', message: 'Invalid form. Reload and try again.' } } };
  const values = Object.fromEntries([...input.entries()].filter((item): item is [string, string] => typeof item[1] === 'string'));
  const p = expenseSchema.safeParse({ id: values.id || undefined, jobId: values.jobId || null, title: values.title, category: values.category, amount: values.amount, occurredOn: values.occurredOn, notes: values.notes, receiptPath: values.receiptPath || null });
  const m = commandMetaSchema.safeParse({ expectedVersion: Number(values.expectedVersion), idempotencyKey: values.idempotencyKey });
  if (!p.success) return { values, result: invalidResult(p.error) }; if (!m.success) return { values, result: invalidResult(m.error) };
  let uploaded: string | undefined; const file = input.get('receipt');
  if (file instanceof File && file.size) { const result = await uploadReceipt(file, m.data.idempotencyKey, p.data.id); if (!result.ok) return { values, result }; uploaded = result.data.path; p.data.receiptPath = uploaded; }
  const result = await saveExpense(p.data, m.data);
  if (!result.ok) {
    if (uploaded) { const cleanup = await deleteUnattachedReceipt(uploaded); if (!cleanup.ok && cleanup.error.code !== 'RECEIPT_IN_USE') return { values, result: { ok: false, error: { code: 'CLEANUP_FAILED', message: `${result.error.message} The unused receipt could not be removed. Retry saving to recover.`, fields: result.error.fields } } }; }
    return { values, result };
  }
  if (uploaded && values.receiptPath && values.receiptPath !== uploaded) await deleteUnattachedReceipt(values.receiptPath);
  revalidatePath('/expenses'); revalidatePath('/jobs'); redirect(`/expenses/${result.data.id}`);
}
export async function archiveExpenseAction(_previous: unknown, input: unknown): Promise<ExpenseFormState> {
  if (!(input instanceof FormData)) return {};
  const p = z.object({ id: z.uuid(), archived: z.enum(['true', 'false']), meta: commandMetaSchema }).safeParse({ id: input.get('id'), archived: input.get('archived'), meta: { expectedVersion: Number(input.get('expectedVersion')), idempotencyKey: input.get('idempotencyKey') } });
  if (!p.success) return { result: invalidResult(p.error) };
  const result = await archiveExpense(p.data.id, p.data.archived === 'true', p.data.meta); revalidatePath('/expenses'); return { result };
}
export async function receiptLinkAction(expenseId: unknown) { return receiptSignedUrl(expenseId); }
