import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readExpense, personalJobOptions } from '@/lib/expenses/service';
import { ExpenseForm, ArchiveExpenseForm, ReceiptLink } from '@/components/expenses/expense-form';
import { money, shortDate, sydneyToday } from '@/lib/domain/format';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { DetailList } from '@/components/ui/detail-list';
import { StatusBadge } from '@/components/ui/status';

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const expense = await readExpense((await params).id); if (!expense) notFound();
  return <>
    <PageHeader back={{ href: '/expenses', label: 'Expenses' }} eyebrow="Expense" title={expense.title}
      meta={<><StatusBadge status={expense.archivedAt ? 'archived' : 'active'} /><span>{expense.category}</span><strong className="numeric">{money(expense.amount)} AUD</strong></>} />
    <div className="detail-layout">
      <div className="detail-main"><ExpenseForm expense={expense} jobs={await personalJobOptions()} commandKey={randomUUID()} today={sydneyToday()} /></div>
      <aside className="detail-side" aria-label="Expense summary">
        <Card title="Summary">
          <DetailList items={[
            { label: 'Amount', value: <strong>{money(expense.amount)} AUD</strong> },
            { label: 'Date', value: shortDate(expense.occurredOn) },
            { label: 'Recorded by', value: expense.worker },
            { label: 'Job', value: expense.jobId ? <Link href={`/jobs/${expense.jobId}`}>{expense.jobTitle ?? 'Linked job'}</Link> : <span className="muted">No linked job</span> },
          ]} />
        </Card>
        <Card title="Receipt">{expense.receiptPath ? <ReceiptLink expenseId={expense.id} /> : <p className="muted" style={{ margin: 0 }}>No receipt attached. Upload one in the form.</p>}</Card>
        <Card title={expense.archivedAt ? 'Restore expense' : 'Archive expense'}><p className="muted" style={{ fontSize: 13 }}>Archived expenses are excluded from job totals but stay on record.</p><ArchiveExpenseForm expense={expense} commandKey={randomUUID()} /></Card>
      </aside>
    </div>
  </>;
}
