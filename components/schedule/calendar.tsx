import Link from 'next/link';
import type {ScheduleView,Visit} from '@/lib/schedule/types';
import {addDays,visitOnDate,visitTimeLabel} from '@/lib/schedule/dates';
import {visitStatuses} from '@/lib/schedule/schemas';
import styles from './schedule.module.css';
function VisitCard({visit}:{visit:Visit}){return <article className={styles.event}><Link className={styles.eventTitle} href={`/schedule/${visit.id}`}>{visit.title}</Link><span>{visitTimeLabel(visit)}</span><span>{visitStatuses[visit.status]} · {visit.type==='assessment'?'Assessment':visit.type==='general'?'General event':'Visit'}</span>{visit.clientName?<span>{visit.clientName}</span>:null}{visit.address?<span>{visit.address}</span>:null}<span>{visit.assignees.length?visit.assignees.map(a=>a.name).join(', '):'Unassigned'}</span></article>;}
export function Calendar({visits,from,to,view}:{visits:Visit[];from:string;to:string;view:ScheduleView}){
  if(!visits.length)return <div className="empty-state"><h2>No visits in this period</h2><p>Choose another date or clear the worker filters. Administrators can add a visit or schedule work below.</p></div>;
  if(view==='list')return <div className={styles.list} aria-label="Schedule list">{visits.map(v=><VisitCard key={v.id} visit={v}/>)}</div>;
  const days:string[]=[];for(let d=from;d<=to;d=addDays(d,1))days.push(d);
  return <div className={`${styles.calendar} ${view==='month'?styles.month:view==='week'?styles.week:styles.day}`} aria-label={`${view} schedule`}>
    {days.map(date=><section className={styles.dateCell} key={date} aria-label={date}><h2><Link href={`/schedule?view=day&date=${date}`}>{new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00Z`))}</Link></h2>{visits.filter(v=>visitOnDate(v,date)).map(v=><VisitCard key={v.id} visit={v}/>)}</section>)}
  </div>;
}
