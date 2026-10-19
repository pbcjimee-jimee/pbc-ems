import Link from 'next/link';
import type {ScheduleView} from '@/lib/schedule/types';

export function ScheduleFilters({date,view,workers,workerId,unassigned,showCancelled}:{date:string;view:ScheduleView;workers:{id:string;name:string}[];workerId:string;unassigned:boolean;showCancelled:boolean}){
  return <form className="filter-bar" method="get" aria-label="Schedule filters">
    <input type="hidden" name="view" value={view}/>
    <div className="field"><label htmlFor="schedule-date">Go to date</label><input id="schedule-date" type="date" name="date" defaultValue={date} required/></div>
    <div className="field"><label htmlFor="schedule-worker">Team member</label><select id="schedule-worker" name="workerId" defaultValue={workerId}><option value="">All visible workers</option>{workers.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></div>
    <label className="check"><input type="checkbox" name="unassigned" value="true" defaultChecked={unassigned}/>Unassigned only</label>
    <label className="check"><input type="checkbox" name="showCancelled" value="true" defaultChecked={showCancelled}/>Include cancelled</label>
    <div className="filter-actions"><button type="submit" className="button button-secondary">Apply</button><Link href="/schedule" className="button button-ghost">Reset</Link></div>
  </form>;
}
