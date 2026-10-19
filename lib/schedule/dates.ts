import { formatSydneyInput, resolveSydneyDateTime } from '@/lib/domain/sydney-date-time';
import type { ScheduleView, VisitTiming } from './types';
export { resolveSydneyDateTime } from '@/lib/domain/sydney-date-time';
export const sydneyToday=()=>formatSydneyInput(new Date().toISOString()).slice(0,10);
export function validDate(date:string):boolean {const instant=new Date(`${date}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(instant.valueOf())&&instant.toISOString().slice(0,10)===date;}
export function addDays(date:string,days:number):string {const instant=new Date(`${date}T12:00:00Z`);instant.setUTCDate(instant.getUTCDate()+days);return instant.toISOString().slice(0,10);}
export function calendarRange(date:string,view:ScheduleView):{from:string;to:string} {
  if(view==='day')return {from:date,to:date};
  if(view==='list')return {from:date,to:addDays(date,29)};
  const monday=(day:string)=>addDays(day,-((new Date(`${day}T12:00Z`).getUTCDay()+6)%7));
  if(view==='week')return {from:monday(date),to:addDays(monday(date),6)};
  const first=`${date.slice(0,7)}-01`;const next=new Date(`${first}T12:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
  const last=addDays(next.toISOString().slice(0,10),-1);return {from:monday(first),to:addDays(monday(last),6)};
}
export function sydneyMidnight(date:string):number {const resolved=resolveSydneyDateTime(date,'00:00');if(!resolved.ok)throw new Error(resolved.error.message);return Date.parse(resolved.data.iso);}
export function visitInterval(visit:VisitTiming):{start:number;end:number} {return visit.allDay?{start:sydneyMidnight(visit.startDate!),end:sydneyMidnight(addDays(visit.endDate!,1))}:{start:Date.parse(visit.startsAt!),end:Date.parse(visit.endsAt!)};}
export const overlaps=(a:{start:number;end:number},b:{start:number;end:number})=>a.start<b.end&&a.end>b.start;
export const visitOnDate=(visit:VisitTiming,date:string)=>overlaps(visitInterval(visit),{start:sydneyMidnight(date),end:sydneyMidnight(addDays(date,1))});
export function visitTimeLabel(visit:VisitTiming):string {return visit.allDay?`All day · ${visit.startDate}${visit.startDate!==visit.endDate?` – ${visit.endDate}`:''}`:`${formatSydneyInput(visit.startsAt!).replace('T',' ')} – ${formatSydneyInput(visit.endsAt!).replace('T',' ')}`;}
