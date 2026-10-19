import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireMembership} from '@/lib/auth/permissions';
import {readVisit} from '@/lib/schedule/service';
import {visitTimeLabel} from '@/lib/schedule/dates';
import {VisitStatusForm,VisitQuickActions} from '@/components/schedule/event-form';
import {PageHeader} from '@/components/ui/page-header';
import {ButtonLink} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {DetailList} from '@/components/ui/detail-list';
import {StatusBadge} from '@/components/ui/status';
import {Notice} from '@/components/ui/notice';
import {Avatar} from '@/components/ui/avatar';
import {Icon} from '@/components/ui/icon';

export default async function VisitPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params;const actor=await requireMembership();const visit=await readVisit(id);if(!visit)notFound();const p=await searchParams;const admin=actor.role==='admin';
  const type=visit.type==='assessment'?'Assessment':visit.type==='general'?'General event':'Visit';
  return <>
    <PageHeader back={{href:'/schedule',label:'Schedule'}} eyebrow={type} title={visit.title}
      meta={<><StatusBadge status={visit.status}/><span className="inline"><Icon name="clock" size={15}/>{visitTimeLabel(visit)}</span></>}
      actions={admin?<ButtonLink href={`/schedule/${id}/edit`} variant="secondary" icon="edit">Edit visit</ButtonLink>:null}/>
    {p.saved?<Notice tone="success">Visit status saved.</Notice>:null}
    <div style={{marginBottom:24}}><VisitQuickActions visit={visit} commandKey={randomUUID()}/></div>
    <div className="detail-layout">
      <div className="detail-main">
        <Card title="Location">
          {visit.address?<><p className="pre-wrap" style={{fontSize:16,fontWeight:600}}>{visit.address}</p><ButtonLink href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(visit.address)}`} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon="pin">Get directions</ButtonLink></>:<p className="muted" style={{margin:0}}>No work site linked to this visit.</p>}
        </Card>
        <Card title="Visit instructions"><p className="pre-wrap" style={{margin:0}}>{visit.description||<span className="muted">No visit notes.</span>}</p></Card>
        <Card title="Status"><VisitStatusForm visit={visit} admin={admin} commandKey={randomUUID()}/></Card>
      </div>
      <aside className="detail-side" aria-label="Visit summary">
        <Card title="Details">
          <DetailList stacked items={[
            {label:'When · Australia/Sydney',value:visitTimeLabel(visit)},
            {label:'Client',value:visit.clientName??<span className="muted">No client linked</span>},
            {label:'Job',value:<Link href={`/jobs/${visit.jobId}`}>{visit.jobTitle??'Job'}</Link>,hidden:!visit.jobId},
            {label:'Request',value:<Link href={`/requests/${visit.requestId}`}>{visit.requestTitle??'Request'}</Link>,hidden:!visit.requestId},
          ]}/>
        </Card>
        <Card title="Team" count={visit.assignees.length}>
          {visit.assignees.length?<ul className="record-list" style={{margin:'0 -20px'}}>{visit.assignees.map(a=><li key={a.id}><Avatar name={a.name}/><div className="record-main"><strong>{a.name}</strong></div></li>)}</ul>:<p className="muted" style={{margin:0}}>Unassigned{admin?<> · <Link href={`/schedule/${id}/edit`}>Assign workers</Link></>:null}</p>}
        </Card>
      </aside>
    </div>
  </>;
}
