import Link from 'next/link';
import type {ScheduleView,Visit} from '@/lib/schedule/types';
import {addDays,visitOnDate,visitTimeLabel} from '@/lib/schedule/dates';
import {StatusBadge} from '@/components/ui/status';
import {EmptyState} from '@/components/ui/empty-state';
import {Icon} from '@/components/ui/icon';
import {timeOfDay} from '@/lib/domain/format';
import styles from './schedule.module.css';

const shortTime=(visit:Visit)=>visit.allDay?'All day':visit.startsAt&&visit.endsAt?timeOfDay(visit.startsAt)+' – '+timeOfDay(visit.endsAt):visitTimeLabel(visit);

const typeLabel=(visit:Visit)=>visit.type==='assessment'?'Assessment':visit.type==='general'?'General event':'Visit';

function VisitCard({visit,compact=false}:{visit:Visit;compact?:boolean}){
  return <article className={styles.event} data-status={visit.status} data-type={visit.type}>
    <Link className={styles.eventTitle} href={`/schedule/${visit.id}`}>{visit.title}</Link>
    <span className={styles.eventTime}><Icon name="clock" size={13}/>{compact?shortTime(visit):visitTimeLabel(visit)}</span>
    {!compact?<>
      {visit.clientName?<span><Icon name="user" size={13}/>{visit.clientName}</span>:null}
      {visit.address?<span><Icon name="pin" size={13}/>{visit.address}</span>:null}
      <span className={styles.eventFoot}><span>{typeLabel(visit)} · {visit.assignees.length?visit.assignees.map(a=>a.name).join(', '):'Unassigned'}</span><StatusBadge status={visit.status}/></span>
    </>:<span>{visit.assignees.length?visit.assignees.map(a=>a.name).join(', '):'Unassigned'}</span>}
  </article>;
}

export function Calendar({visits,from,to,view,today}:{visits:Visit[];from:string;to:string;view:ScheduleView;today?:string}){
  if(!visits.length)return <EmptyState icon="schedule" title="No visits in this period" description="Choose another date or clear the worker filters. Administrators can add a visit or schedule work from the unscheduled list."/>;
  const days:string[]=[];for(let d=from;d<=to;d=addDays(d,1))days.push(d);
  const heading=(date:string,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-AU',{...o,timeZone:'UTC'}).format(new Date(`${date}T12:00Z`));
  if(view==='list'){
    const grouped=days.map(date=>({date,items:visits.filter(v=>visitOnDate(v,date))})).filter(g=>g.items.length);
    return <div className={styles.agenda} aria-label="Schedule list">{grouped.map(group=><section key={group.date} aria-label={group.date}>
      <h2 className={styles.agendaDate} data-today={group.date===today||undefined}><Link href={`/schedule?view=day&date=${group.date}`}>{heading(group.date,{weekday:'long',day:'numeric',month:'long'})}</Link>{group.date===today?<span className="status status-info status-plain">Today</span>:null}</h2>
      <div className={styles.agendaItems}>{group.items.map(v=><VisitCard key={v.id} visit={v}/>)}</div>
    </section>)}</div>;
  }
  return <div className={`${styles.calendar} ${view==='month'?styles.month:view==='week'?styles.week:styles.day}`} aria-label={`${view} schedule`}>
    {days.map(date=><section className={styles.dateCell} key={date} aria-label={date} data-today={date===today||undefined} data-empty={!visits.some(v=>visitOnDate(v,date))||undefined}>
      <h2><Link href={`/schedule?view=day&date=${date}`}>{heading(date,view==='month'?{weekday:'short',day:'numeric'}:{weekday:'short',day:'numeric',month:'short'})}</Link></h2>
      {visits.filter(v=>visitOnDate(v,date)).map(v=><VisitCard key={v.id} visit={v} compact={view!=='day'}/>)}
    </section>)}
  </div>;
}
