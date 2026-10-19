import Link from 'next/link';
import { requireMembership } from '@/lib/auth/permissions';
import { listExpenses, personalJobOptions } from '@/lib/expenses/service';
import { expenseFilterSchema } from '@/lib/expenses/schemas';
import { ExpenseList } from '@/components/expenses/expense-list';
import { money } from '@/lib/domain/format';
import { Button } from '@/components/ui/button';
import styles from '@/components/expenses/expenses.module.css';
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const actor = await requireMembership(); const parsed = expenseFilterSchema.safeParse(params); const data = await listExpenses(parsed.success ? parsed.data : {}); const jobs = await personalJobOptions();
  return <><div className="page-header"><div><h1>Expenses</h1><p className="page-description">{actor.role === 'admin' ? 'Company expense records and private receipts.' : 'Your expense records and private receipts.'}</p></div><Link className="button" href="/expenses/new">New expense</Link></div>{!parsed.success ? <p role="alert">Some filters were invalid. Showing active expenses.</p> : null}
    <form className={styles.filters} method="get"><div className="field"><label htmlFor="expense-search">Search</label><input id="expense-search" name="search" defaultValue={data.filter.search} /></div><div className="field"><label htmlFor="expense-category">Category</label><input id="expense-category" name="category" defaultValue={data.filter.category} /></div><div className="field"><label htmlFor="expense-from">From</label><input id="expense-from" name="from" type="date" defaultValue={data.filter.from} /></div><div className="field"><label htmlFor="expense-to">To</label><input id="expense-to" name="to" type="date" defaultValue={data.filter.to} /></div><div className="field"><label htmlFor="expense-job">Job</label><select id="expense-job" name="jobId" defaultValue={data.filter.jobId ?? ''}><option value="">All jobs</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.number} · {j.title}</option>)}</select></div><div className="field"><label htmlFor="expense-archive">Status</label><select id="expense-archive" name="archive" defaultValue={data.filter.archive}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></div><Button variant="secondary" type="submit">Apply filters</Button><Link href="/expenses">Reset</Link></form>
    <p>{data.items.length} expenses · Filtered total <strong>{money(data.total)} AUD</strong> (receipt totals)</p><ExpenseList items={data.items} admin={actor.role === 'admin'} />
  </>;
}
