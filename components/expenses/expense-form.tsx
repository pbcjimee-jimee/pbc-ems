'use client';
import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { saveExpenseAction, archiveExpenseAction, receiptLinkAction, type ExpenseFormState } from '@/app/(ems)/expenses/actions';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { CommandFields, TextArea } from '@/components/clients/client-form';
import { ReceiptUpload } from './receipt-upload';
import type { Expense } from '@/lib/expenses/service';
export function ExpenseFeedback({ state }: { state: ExpenseFormState }) { return state.result ? state.result.ok ? <p role="status">Saved.</p> : <div className="alert" role="alert"><p>{state.result.error.message}</p>{state.result.error.code === 'VERSION_CONFLICT' ? <a href="">Reload the latest record</a> : null}</div> : null; }
export function ReceiptLink({ expenseId }: { expenseId: string }) {
  const [pending, start] = useTransition(); const [error, setError] = useState(''); const [url, setUrl] = useState('');
  return <div><Button type="button" variant="secondary" loading={pending} onClick={() => start(async () => { const result = await receiptLinkAction(expenseId); if (result.ok) { setUrl(result.data.url); setError(''); } else { setUrl(''); setError(result.error.message); } })}>Get private receipt link</Button>{url ? <p role="status"><a href={url} target="_blank" rel="noreferrer">Download receipt (link valid for 60 seconds)</a></p> : null}{error ? <p role="alert">{error}</p> : null}</div>;
}
export function ExpenseForm({ expense, jobs, commandKey, today, jobId }: { expense?: Expense; jobs: { id: string; title: string; number: string }[]; commandKey: string; today: string; jobId?: string }) {
  const [state, action, pending] = useActionState(saveExpenseAction, {} as ExpenseFormState);
  const errors = state.result && !state.result.ok ? state.result.error.fields : undefined;
  const value = (key: string, fallback?: string | null) => state.values?.[key] ?? fallback ?? '';
  return <form onReset={event => event.preventDefault()} action={action} className="panel"><CommandFields id={expense?.id} version={expense?.version ?? 0} commandKey={commandKey} /><input type="hidden" name="receiptPath" value={expense?.receiptPath ?? ''} /><ExpenseFeedback state={state} />
    <p className="field-hint">Fields marked * are required. Amount is the receipt total in AUD (including any GST charged); no GST is calculated here.</p><div className="form-grid">
      <Field name="title" label="Expense title" required maxLength={200} defaultValue={value('title', expense?.title)} error={errors?.title} />
      <Field name="category" label="Category" required maxLength={100} defaultValue={value('category', expense?.category)} error={errors?.category} placeholder="Materials, fuel, equipment…" />
      <Field name="amount" label="Amount (AUD, receipt total)" required inputMode="decimal" defaultValue={value('amount', expense?.amount)} error={errors?.amount} />
      <Field name="occurredOn" label="Expense date" required type="date" defaultValue={value('occurredOn', expense?.occurredOn ?? today)} error={errors?.occurredOn} />
      <div className="field"><label htmlFor="jobId">Job (optional)</label><select id="jobId" name="jobId" defaultValue={value('jobId', expense?.jobId ?? jobId)}><option value="">No linked job</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.number} · {job.title}</option>)}</select></div>
      <ReceiptUpload /><TextArea name="notes" label="Notes" value={value('notes', expense?.notes)} error={errors?.notes} />
    </div><div className="form-actions"><Link href="/expenses" className="button button-secondary">Back to expenses</Link><Button loading={pending} type="submit">Save expense</Button></div>
  </form>;
}
export function ArchiveExpenseForm({ expense, commandKey }: { expense: Expense; commandKey: string }) {
  const [state, action, pending] = useActionState(archiveExpenseAction, {} as ExpenseFormState);
  return <form action={action}><CommandFields id={expense.id} version={expense.version} commandKey={commandKey} /><input type="hidden" name="archived" value={expense.archivedAt ? 'false' : 'true'} /><ExpenseFeedback state={state} /><Button type="submit" variant="secondary" loading={pending}>{expense.archivedAt ? 'Restore expense' : 'Archive expense'}</Button></form>;
}
