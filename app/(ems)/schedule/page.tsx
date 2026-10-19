import Link from 'next/link';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {requireMembership} from '@/lib/auth/permissions';
import {querySchedule,scheduleOptions,unscheduledJobs} from '@/lib/schedule/service';
import {addDays,calendarRange,sydneyToday,validDate} from '@/lib/schedule/dates';
import {Calendar} from '@/components/schedule/calendar';
import {ScheduleFilters} from '@/components/schedule/filters';
import {Unscheduled} from '@/components/schedule/unscheduled';
export default async function SchedulePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams;const actor=await requireMembership();
  if(typeof p.visitId==='string'&&z.uuid().safeParse(p.visitId).success)redirect(`/schedule/${p.visitId}`);
  if(actor.role==='admin'&&(typeof p.requestId==='string'||typeof p.jobId==='string')){const q=new URLSearchParams();if(typeof p.requestId==='string')q.set('requestId',p.requestId);if(typeof p.jobId==='string')q.set('jobId',p.jobId);redirect(`/schedule/new?${q}`);}
  const date=typeof p.date==='string'&&validDate(p.date)?p.date:sydneyToday();const v=z.enum(['month','week','day','list']).safeParse(p.view);const view=v.success?v.data:'list';
  const workerId=typeof p.workerId==='string'&&z.uuid().safeParse(p.workerId).success?p.workerId:'';const unassigned=p.unassigned==='true';const showCancelled=p.showCancelled==='true';const range=calendarRange(date,view);
  const visits=await querySchedule(range,{workerId,unassigned,showCancelled});const options=await scheduleOptions();const jobs=actor.role==='admin'?await unscheduledJobs():[];
  const link=(d:string,nextView=view)=>`/schedule?${new URLSearchParams({date:d,view:nextView,workerId,unassigned:String(unassigned),showCancelled:String(showCancelled)})}`;
  const move=(direction:number)=>{if(view==='month'){const d=new Date(`${date.slice(0,7)}-01T12:00Z`);d.setUTCMonth(d.getUTCMonth()+direction);return d.toISOString().slice(0,10);}return addDays(date,direction*(view==='week'?7:view==='list'?30:1));};
  return <><div className="page-header"><div><h1>Schedule</h1><p className="page-description">Plan visits and assessments. All dates and times use Australia/Sydney.</p></div>{actor.role==='admin'?<Link href={`/schedule/new?date=${date}`} className="button">New visit</Link>:null}</div>
    <nav className="toolbar" aria-label="Schedule views">{(['month','week','day','list'] as const).map(name=><Link href={link(date,name)} key={name} className={`button ${name===view?'':'button-secondary'}`} aria-current={name===view?'page':undefined}>{name[0].toUpperCase()+name.slice(1)}</Link>)}</nav>
    <ScheduleFilters date={date} view={view} workers={options.workers} workerId={workerId} unassigned={unassigned} showCancelled={showCancelled}/>
    <nav className="toolbar" aria-label="Schedule date navigation"><Link className="button button-secondary" href={link(move(-1))}>Previous</Link><Link className="button button-secondary" href={link(sydneyToday())}>Today</Link><Link className="button button-secondary" href={link(move(1))}>Next</Link><p className="field-hint">{range.from} – {range.to} · {visits.length} visits</p></nav>
    <Calendar visits={visits} from={range.from} to={range.to} view={view}/>{actor.role==='admin'?<Unscheduled jobs={jobs}/>:null}</>;
}
