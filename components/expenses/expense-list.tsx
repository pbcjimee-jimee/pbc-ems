import Link from 'next/link';
import type { Expense } from '@/lib/expenses/service';
import { money, shortDate } from '@/lib/domain/format';
import { EmptyState } from '@/components/ui/empty-state';
import { ButtonLink } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status';
import { Icon } from '@/components/ui/icon';

export function ExpenseList({ items, admin }: { items: Expense[]; admin: boolean }) {
  if (!items.length) return <EmptyState icon="expenses" title="No expenses found" description="Add an expense or change the filters to find an existing record." action={<ButtonLink href="/expenses/new" icon="plus">New expense</ButtonLink>} />;
  return <DataTable caption="Expenses" rows={items} rowKey={expense => expense.id} columns={[
    { key: 'title', header: 'Expense', primary: true, cell: expense => <><Link href={`/expenses/${expense.id}`}>{expense.title}</Link><span className="cell-sub">{expense.category}{expense.archivedAt ? ' · Archived' : ''}</span></> },
    { key: 'date', header: 'Date', cell: expense => shortDate(expense.occurredOn) },
    ...(admin ? [{ key: 'worker', header: 'Recorded by', cell: (expense: Expense) => expense.worker }] : []),
    { key: 'job', header: 'Job', hideOnMobile: true, cell: expense => expense.jobId ? <Link href={`/jobs/${expense.jobId}`}>{expense.jobTitle ?? 'Linked job'}</Link> : <span className="muted">No linked job</span> },
    { key: 'receipt', header: 'Receipt', cell: expense => expense.receiptPath ? <StatusBadge status="attached" label="Attached" tone="success" /> : <span className="muted inline"><Icon name="alert" size={14} />None</span> },
    { key: 'amount', header: 'Amount', align: 'end', cell: expense => <strong>{money(expense.amount)}</strong> },
  ]} />;
}
