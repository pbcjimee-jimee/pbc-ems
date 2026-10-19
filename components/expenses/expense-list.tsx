import Link from 'next/link';
import type { Expense } from '@/lib/expenses/service';
import { money, shortDate } from '@/lib/domain/format';
import { EmptyState } from '@/components/ui/empty-state';
import styles from './expenses.module.css';
export function ExpenseList({ items, admin }: { items: Expense[]; admin: boolean }) {
  if (!items.length) return <EmptyState title="No expenses found" description="Add an expense or change the filters to find an existing record." />;
  return <div className={styles.records}>{items.map(expense => <article key={expense.id} className={styles.record}><div><Link href={`/expenses/${expense.id}`}><strong>{expense.title}</strong></Link><p>{expense.category}{expense.archivedAt ? ' · Archived' : ''}</p></div><div>{shortDate(expense.occurredOn)}{admin ? <p>{expense.worker}</p> : null}</div><div>{expense.jobTitle ?? 'No linked job'}<p>{expense.receiptPath ? 'Receipt attached' : 'No receipt'}</p></div><strong className={styles.amount}>{money(expense.amount)}</strong></article>)}</div>;
}
