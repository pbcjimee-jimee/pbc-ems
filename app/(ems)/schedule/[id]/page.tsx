import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireMembership} from '@/lib/auth/permissions';
import {readVisit} from '@/lib/schedule/service';
import {visitTimeLabel} from '@/lib/schedule/dates';
import {visitStatuses} from '@/lib/schedule/schemas';
import {VisitStatusForm} from '@/components/schedule/event-form';
import styles from '@/components/schedule/schedule.module.css';
export default async function VisitPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params;const actor=await requireMembership();const visit=await readVisit(id);if(!visit)notFound();const p=await searchParams;const admin=actor.role==='admin';
  return <><Link href="/schedule">← Schedule</Link><div className="page-header"><div><h1>{visit.title}</h1><p>{visitStatuses[visit.status]} · {visit.type==='assessment'?'Assessment':visit.type==='general'?'General event':'Visit'}</p></div>{admin?<Link className="button" href={`/schedule/${id}/edit`}>Edit visit</Link>:null}</div>{p.saved?<p className={styles.success} role="status">Visit status saved.</p>:null}
    <section className="panel"><h2>Visit details</h2><dl className={styles.details}><div><dt>When · Australia/Sydney</dt><dd>{visitTimeLabel(visit)}</dd></div><div><dt>Assigned workers</dt><dd>{visit.assignees.length?visit.assignees.map(a=>a.name).join(', '):'Unassigned'}</dd></div><div><dt>Customer and site</dt><dd>{visit.clientName??'No customer linked'}{visit.address?`\n${visit.address}`:''}</dd></div><div><dt>Related work</dt><dd>{visit.jobId?<><Link href={`/jobs/${visit.jobId}`}>{visit.jobTitle??'Job'}</Link><br/></>:null}{visit.requestId?<Link href={`/requests/${visit.requestId}`}>{visit.requestTitle??'Request'}</Link>:null}{!visit.jobId&&!visit.requestId?'General event':null}</dd></div><div><dt>Notes</dt><dd>{visit.description||'No visit notes.'}</dd></div></dl></section><div style={{marginTop:16}}><VisitStatusForm visit={visit} admin={admin} commandKey={randomUUID()}/></div></>;
}
