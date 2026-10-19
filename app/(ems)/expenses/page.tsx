import { requireMembership } from '@/lib/auth/permissions';
import { listExpenses, personalJobOptions } from '@/lib/expenses/service';
import { expenseFilterSchema } from '@/lib/expenses/schemas';
import { ExpenseList } from '@/components/expenses/expense-list';
import { money } from '@/lib/domain/format';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar } from '@/components/ui/filter-bar';
import { Notice } from '@/components/ui/notice';
import { Pagination } from '@/components/ui/pagination';

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const actor = await requireMembership(); const parsed = expenseFilterSchema.safeParse(params); const data = await listExpenses(parsed.success ? parsed.data : {}); const jobs = await personalJobOptions();
  const base = Object.fromEntries(Object.entries(data.filter).filter(([, value]) => typeof value === 'string' && value !== '')) as Record<string, string>;
  const link = (archive: string) => `/expenses?${new URLSearchParams({ ...base, archive, page: '1' })}`;
  const counts = data.counts as Record<string, number>;
  return <>
    <PageHeader title="Expenses" description={actor.role === 'admin' ? 'Company expense records and private receipts.' : 'Your expense records and private receipts.'} actions={<ButtonLink href="/expenses/new" icon="plus">New expense</ButtonLink>} />
    {!parsed.success ? <Notice tone="warning">Some filters were invalid. Showing active expenses.</Notice> : null}
    <Tabs label="Expense status" items={([['active', 'Active'], ['archived', 'Archived'], ['all', 'All']] as const).map(([value, label]) => ({ label, href: link(value), current: data.filter.archive === value, count: counts?.[value] }))} />
    <FilterBar resetHref="/expenses" search={{ id: 'expense-search', label: 'Search expenses', defaultValue: data.filter.search, placeholder: 'Title, notes or worker' }}>
      <input type="hidden" name="archive" value={data.filter.archive} />
      <div className="field"><label htmlFor="expense-category">Category</label><input id="expense-category" name="category" defaultValue={data.filter.category} placeholder="Any category" /></div>
      <div className="field"><label htmlFor="expense-from">From</label><input id="expense-from" name="from" type="date" defaultValue={data.filter.from} /></div>
      <div className="field"><label htmlFor="expense-to">To</label><input id="expense-to" name="to" type="date" defaultValue={data.filter.to} /></div>
      <div className="field"><label htmlFor="expense-job">Job</label><select id="expense-job" name="jobId" defaultValue={data.filter.jobId ?? ''}><option value="">All jobs</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.number} · {j.title}</option>)}</select></div>
    </FilterBar>
    <div className="filter-summary"><span>{data.count} expense{data.count === 1 ? '' : 's'}</span><span>Filtered total <strong className="numeric">{money(data.total)} AUD</strong> · receipt totals</span></div>
    <ExpenseList items={data.items} admin={actor.role === 'admin'} />
    <Pagination label="Expense pages" page={data.page} pageSize={data.pageSize} total={data.count} href={page => `/expenses?${new URLSearchParams({ ...base, page: String(page) })}`} />
  </>;
}
