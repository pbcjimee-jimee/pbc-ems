import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { personalJobOptions } from '@/lib/expenses/service';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { sydneyToday } from '@/lib/domain/format';
export default async function NewExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const jobId = z.uuid().safeParse(params.jobId);
  return <><div className="page-header"><div><h1>New expense</h1><p className="page-description">Record your expense and attach a private receipt.</p></div></div><ExpenseForm jobs={await personalJobOptions()} commandKey={randomUUID()} today={sydneyToday()} jobId={jobId.success ? jobId.data : undefined} /></>;
}
