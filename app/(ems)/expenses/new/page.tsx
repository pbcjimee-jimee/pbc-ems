import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { personalJobOptions } from '@/lib/expenses/service';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { sydneyToday } from '@/lib/domain/format';
import { PageHeader } from '@/components/ui/page-header';

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const jobId = z.uuid().safeParse(params.jobId);
  return <div className="form-page">
    <PageHeader back={{ href: jobId.success ? `/jobs/${jobId.data}` : '/expenses', label: jobId.success ? 'Job' : 'Expenses' }} title="New expense" description="Record your expense and attach a private receipt." />
    <ExpenseForm jobs={await personalJobOptions()} commandKey={randomUUID()} today={sydneyToday()} jobId={jobId.success ? jobId.data : undefined} />
  </div>;
}
