import Link from 'next/link';
import {Card} from '@/components/ui/card';
import {ButtonLink} from '@/components/ui/button';
import styles from './schedule.module.css';

export function Unscheduled({jobs}:{jobs:{id:string;title:string}[]}){
  return <Card id="unscheduled" title="Unscheduled work" count={jobs.length} description="Active jobs without a visit" flush className={styles.unscheduled}>
    {jobs.length?<ul className="record-list">{jobs.map(j=><li key={j.id}><div className="record-main"><Link href={`/jobs/${j.id}`}>{j.title}</Link></div><ButtonLink size="sm" variant="secondary" href={`/schedule/new?jobId=${j.id}`}>Schedule</ButtonLink></li>)}</ul>:<p className="record-list-empty">All active jobs have a visit planned.</p>}
  </Card>;
}
