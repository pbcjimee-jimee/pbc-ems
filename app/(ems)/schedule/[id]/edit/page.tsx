import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {requireMembership} from '@/lib/auth/permissions';
import {readVisit,scheduleOptions} from '@/lib/schedule/service';
import {EventForm} from '@/components/schedule/event-form';
import {formatSydneyInput} from '@/lib/domain/sydney-date-time';
import {sydneyToday} from '@/lib/schedule/dates';
export default async function EditVisitPage({params}:{params:Promise<{id:string}>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/schedule');const {id}=await params;const visit=await readVisit(id);if(!visit)notFound();const options=await scheduleOptions();
  if(visit.jobId&&!options.jobs.some(j=>j.id===visit.jobId))options.jobs.unshift({id:visit.jobId,title:visit.jobTitle??'Linked job'});
  if(visit.requestId&&!options.requests.some(r=>r.id===visit.requestId))options.requests.unshift({id:visit.requestId,title:visit.requestTitle??'Linked request'});
  return <><Link href={`/schedule/${id}`}>← Visit details</Link><h1>Edit visit</h1><EventForm visit={visit} commandKey={randomUUID()} options={options} date={visit.startDate??(visit.startsAt?formatSydneyInput(visit.startsAt).slice(0,10):sydneyToday())}/></>;
}
