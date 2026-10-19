import {redirect} from 'next/navigation';
import {z} from 'zod';
import {requireMembership} from '@/lib/auth/permissions';
import {querySchedule,scheduleOptions,unscheduledJobs} from '@/lib/schedule/service';
import {addDays,calendarRange,sydneyToday,validDate} from '@/lib/schedule/dates';
import {Calendar} from '@/components/schedule/calendar';
import {ScheduleFilters} from '@/components/schedule/filters';
import {Unscheduled} from '@/components/schedule/unscheduled';
import {PageHeader} from '@/components/ui/page-header';
import {ButtonLink} from '@/components/ui/button';
import {Segmented} from '@/components/ui/tabs';
import {Icon} from '@/components/ui/icon';
import styles from '@/components/schedule/schedule.module.css';

const rangeLabel=(from:string,to:string,view:string)=>{
  const f=(d:string,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-AU',{...o,timeZone:'UTC'}).format(new Date(`${d}T12:00Z`));
  if(view==='day')return f(from,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  if(view==='month')return f(addDays(from,10),{month:'long',year:'numeric'});
  return `${f(from,{day:'numeric',month:'short'})} – ${f(to,{day:'numeric',month:'short',year:'numeric'})}`;
};

export default async function SchedulePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams;const actor=await requireMembership();
  if(typeof p.visitId==='string'&&z.uuid().safeParse(p.visitId).success)redirect(`/schedule/${p.visitId}`);
  if(actor.role==='admin'&&(typeof p.requestId==='string'||typeof p.jobId==='string')){const q=new URLSearchParams();if(typeof p.requestId==='string')q.set('requestId',p.requestId);if(typeof p.jobId==='string')q.set('jobId',p.jobId);redirect(`/schedule/new?${q}`);}
  const today=sydneyToday();const date=typeof p.date==='string'&&validDate(p.date)?p.date:today;const v=z.enum(['month','week','day','list']).safeParse(p.view);const view=v.success?v.data:'list';
  const workerId=typeof p.workerId==='string'&&z.uuid().safeParse(p.workerId).success?p.workerId:'';const unassigned=p.unassigned==='true';const showCancelled=p.showCancelled==='true';const range=calendarRange(date,view);
  const [visits,options,jobs]=await Promise.all([querySchedule(range,{workerId,unassigned,showCancelled}),scheduleOptions(),actor.role==='admin'?unscheduledJobs():Promise.resolve([])]);
  const link=(d:string,nextView=view)=>`/schedule?${new URLSearchParams({date:d,view:nextView,workerId,unassigned:String(unassigned),showCancelled:String(showCancelled)})}`;
  const move=(direction:number)=>{if(view==='month'){const d=new Date(`${date.slice(0,7)}-01T12:00Z`);d.setUTCMonth(d.getUTCMonth()+direction);return d.toISOString().slice(0,10);}return addDays(date,direction*(view==='week'?7:view==='list'?30:1));};
  return <>
    <PageHeader title="Schedule" description="Plan visits and assessments. All dates and times use Australia/Sydney." actions={actor.role==='admin'?<ButtonLink href={`/schedule/new?date=${date}`} icon="plus">New visit</ButtonLink>:null}/>
    <div className={styles.toolbar}>
      <div className={styles.dateNav}>
        <ButtonLink href={link(today)} variant="secondary" size="sm">Today</ButtonLink>
        <ButtonLink href={link(move(-1))} variant="ghost" size="sm" className="button-icon" aria-label={`Previous ${view}`}><Icon name="chevron-left" size={18}/></ButtonLink>
        <ButtonLink href={link(move(1))} variant="ghost" size="sm" className="button-icon" aria-label={`Next ${view}`}><Icon name="chevron-right" size={18}/></ButtonLink>
        <h2 className={styles.rangeLabel}>{rangeLabel(range.from,range.to,view)}<span className="count-badge">{visits.length}</span></h2>
      </div>
      <Segmented label="Schedule views" items={(['day','week','month','list'] as const).map(name=>({label:name[0].toUpperCase()+name.slice(1),href:link(date,name),current:name===view}))}/>
    </div>
    <ScheduleFilters date={date} view={view} workers={options.workers} workerId={workerId} unassigned={unassigned} showCancelled={showCancelled}/>
    <div className={actor.role==='admin'?styles.layout:undefined}>
      <Calendar visits={visits} from={range.from} to={range.to} view={view} today={today}/>
      {actor.role==='admin'?<Unscheduled jobs={jobs}/>:null}
    </div>
  </>;
}
