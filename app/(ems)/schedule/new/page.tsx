import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {requireMembership} from '@/lib/auth/permissions';
import {scheduleOptions} from '@/lib/schedule/service';
import {readRequest} from '@/lib/requests/service';
import {EventForm} from '@/components/schedule/event-form';
import {sydneyToday,validDate} from '@/lib/schedule/dates';
import {formatSydneyInput} from '@/lib/domain/sydney-date-time';
export default async function NewVisitPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireMembership();if(actor.role!=='admin')redirect('/schedule');const p=await searchParams;const options=await scheduleOptions();
  const jobId=typeof p.jobId==='string'&&z.uuid().safeParse(p.jobId).success?p.jobId:undefined;const requestId=typeof p.requestId==='string'&&z.uuid().safeParse(p.requestId).success?p.requestId:undefined;
  const request=requestId?await readRequest(requestId):null;const initialStart=request?.assessmentAt?formatSydneyInput(request.assessmentAt):undefined;const initialEnd=request?.assessmentAt?formatSydneyInput(new Date(Date.parse(request.assessmentAt)+3600000).toISOString()):undefined;
  const date=typeof p.date==='string'&&validDate(p.date)?p.date:initialStart?.slice(0,10)??request?.preferredDate??sydneyToday();const title=request?.title??options.jobs.find(j=>j.id===jobId)?.title??'';
  return <><Link href="/schedule">← Schedule</Link><h1>New {requestId?'assessment':'visit'}</h1><EventForm commandKey={randomUUID()} options={options} jobId={jobId} requestId={requestId} date={date} initialTitle={title} initialStart={initialStart} initialEnd={initialEnd}/></>;
}
