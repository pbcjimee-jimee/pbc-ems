import 'server-only';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { withEmsTransaction, type EmsTx } from '@/lib/db/transaction';
import type { Result, Versioned } from '@/lib/domain/types';
import { isConstraintConflict } from '@/lib/db/sql-errors';
import { WorkflowError, runCommand, requireVersion, recordActivity } from '@/lib/workflows/commands';
import { expenseSchema, expenseFilterSchema, commandMetaSchema, invalidResult } from './schemas';
export type Expense = Versioned & { userId: string; worker: string; jobId: string | null; jobTitle: string | null; title: string; category: string; amount: string; occurredOn: string; notes: string; receiptPath: string | null; archivedAt: string | null };
export async function personalMutation<T>(work: (tx: EmsTx) => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await withEmsTransaction(work) }; }
  catch (error) { return { ok: false, error: error instanceof WorkflowError ? { code: error.code, message: error.message } : isConstraintConflict(error) ? { code: 'CONFLICT', message: 'This overlaps existing time or another timer is running. Reload and review your entries.' } : { code: 'SAVE_FAILED', message: 'The change could not be saved. Your inputs are kept; check your connection and try again.' } }; }
}
export async function validatePersonalJob(tx: EmsTx, jobId?: string | null): Promise<void> {
  if (jobId && !(await tx.query('select id from ems.jobs where id=$1 and organization_id=$2 and archived_at is null for share', [jobId, tx.actor.organizationId])).length) throw new WorkflowError('INVALID_JOB', 'Choose an active job you can access.');
}
export async function personalJobOptions(): Promise<{ id: string; title: string; number: string }[]> { return withEmsTransaction(tx => tx.query('select id,title,number from ems.jobs where organization_id=$1 and archived_at is null order by title', [tx.actor.organizationId])); }
export async function saveExpense(input: unknown, meta: unknown): Promise<Result<Versioned>> {
  const p = expenseSchema.safeParse(input); if (!p.success) return invalidResult(p.error);
  const m = commandMetaSchema.safeParse(meta); if (!m.success) return invalidResult(m.error); const d = p.data;
  return personalMutation(tx => runCommand(tx, 'expense.save', m.data, d, async () => {
    await validatePersonalJob(tx, d.jobId);
    let owner = tx.actor.userId;
    if (d.id) { const [row] = await tx.query<Versioned & { user_id: string }>('select id,version,user_id from ems.expenses where id=$1 and organization_id=$2 for update', [d.id, tx.actor.organizationId]); if (!row) throw new WorkflowError('NOT_FOUND', 'Expense not found.'); requireVersion(row.version, m.data.expectedVersion); owner = row.user_id; }
    else requireVersion(0, m.data.expectedVersion);
    if (d.receiptPath) {
      const [attachment] = await tx.query<{ expense_id: string | null }>('select expense_id from ems.attachments where path=$1 and user_id=$2 and organization_id=$3 for update', [d.receiptPath, owner, tx.actor.organizationId]);
      if (!attachment || (attachment.expense_id && attachment.expense_id !== d.id)) throw new WorkflowError('INVALID_RECEIPT', 'Upload a receipt owned by this expense owner.');
    }
    const args = [d.title, d.category, new Decimal(d.amount).toFixed(2), d.occurredOn, d.notes, d.jobId ?? null, d.receiptPath ?? null];
    const [saved] = d.id ? await tx.query<Versioned>('update ems.expenses set title=$1,category=$2,amount=$3,occurred_on=$4,notes=$5,job_id=$6,receipt_path=$7,version=version+1 where id=$8 and organization_id=$9 returning id,version', [...args, d.id, tx.actor.organizationId]) : await tx.query<Versioned>('insert into ems.expenses(title,category,amount,occurred_on,notes,job_id,receipt_path,organization_id,user_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,version', [...args, tx.actor.organizationId, owner]);
    if (d.receiptPath) await tx.query('update ems.attachments set expense_id=$1,job_id=$2 where path=$3 and organization_id=$4', [saved.id, d.jobId ?? null, d.receiptPath, tx.actor.organizationId]);
    await recordActivity(tx, 'expense', saved.id, d.id ? 'updated' : 'created'); return saved;
  }));
}
export async function archiveExpense(id: unknown, archived: unknown, meta: unknown): Promise<Result<Versioned>> {
  const p = z.object({ id: z.uuid(), archived: z.boolean(), meta: commandMetaSchema }).safeParse({ id, archived, meta }); if (!p.success) return invalidResult(p.error); const d = p.data;
  return personalMutation(tx => runCommand(tx, 'expense.archive', d.meta, { id: d.id, archived: d.archived }, async () => {
    const [current] = await tx.query<Versioned>('select id,version from ems.expenses where id=$1 and organization_id=$2 for update', [d.id, tx.actor.organizationId]); if (!current) throw new WorkflowError('NOT_FOUND', 'Expense not found.'); requireVersion(current.version, d.meta.expectedVersion);
    const [saved] = await tx.query<Versioned>('update ems.expenses set archived_at=case when $1 then now() else null end,version=version+1 where id=$2 and organization_id=$3 returning id,version', [d.archived, d.id, tx.actor.organizationId]); await recordActivity(tx, 'expense', d.id, d.archived ? 'archived' : 'restored'); return saved;
  }));
}
export async function listExpenses(filters: unknown = {}) {
  const filter = expenseFilterSchema.parse(filters);
  return withEmsTransaction(async tx => {
    const items = await tx.query<Expense>(`select e.id,e.version,e.user_id as "userId",m.display_name as worker,e.job_id as "jobId",j.title as "jobTitle",e.title,e.category,e.amount,e.occurred_on::text as "occurredOn",e.notes,e.receipt_path as "receiptPath",e.archived_at::text as "archivedAt" from ems.expenses e join ems.memberships m on m.organization_id=e.organization_id and m.user_id=e.user_id left join ems.jobs j on j.id=e.job_id and j.organization_id=e.organization_id where e.organization_id=$1 and ($2='' or e.title ilike '%'||$2||'%' or e.notes ilike '%'||$2||'%') and ($3='' or e.category=$3) and ($4='' or e.occurred_on>=nullif($4,'')::date) and ($5='' or e.occurred_on<=nullif($5,'')::date) and ($6::uuid is null or e.job_id=$6) and ($7='all' or ($7='active' and e.archived_at is null) or ($7='archived' and e.archived_at is not null)) order by e.occurred_on desc,e.created_at desc`, [tx.actor.organizationId, filter.search, filter.category, filter.from, filter.to, filter.jobId ?? null, filter.archive]);
    return { items, total: items.reduce((sum, item) => sum.plus(item.amount), new Decimal(0)).toFixed(2), filter };
  });
}
export async function readExpense(id: string): Promise<Expense | null> { if (!z.uuid().safeParse(id).success) return null; return (await listExpenses({ archive: 'all' })).items.find(row => row.id === id) ?? null; }
