import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { readExpense, personalJobOptions } from '@/lib/expenses/service';
import { ExpenseForm, ArchiveExpenseForm, ReceiptLink } from '@/components/expenses/expense-form';
import { sydneyToday } from '@/lib/domain/format';
import styles from '@/components/expenses/expenses.module.css';
export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const expense = await readExpense((await params).id); if (!expense) notFound();
  return <div className={styles.stack}><div className="page-header"><div><h1>{expense.title}</h1><p className="page-description">Expense · {expense.worker}{expense.archivedAt ? ' · Archived' : ''}</p></div><ArchiveExpenseForm expense={expense} commandKey={randomUUID()} /></div>{expense.receiptPath ? <ReceiptLink expenseId={expense.id} /> : null}<ExpenseForm expense={expense} jobs={await personalJobOptions()} commandKey={randomUUID()} today={sydneyToday()} /></div>;
}
