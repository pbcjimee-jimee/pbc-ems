'use client';
import Link from 'next/link';
import {useActionState,useState} from 'react';
import {saveVisitAction,changeVisitStatusAction} from '@/app/(ems)/schedule/actions';
import type {Visit,ScheduleOptions,VisitFormState} from '@/lib/schedule/types';
import {formatSydneyInput} from '@/lib/domain/sydney-date-time';
import {visitStatuses} from '@/lib/schedule/schemas';
import {Field} from '@/components/ui/field';
import {Button} from '@/components/ui/button';
import {CommandFields,TextArea} from '@/components/clients/client-form';
import styles from './schedule.module.css';
type Props={visit?:Visit;commandKey:string;options:ScheduleOptions;jobId?:string;requestId?:string;date:string;initialTitle?:string;initialStart?:string;initialEnd?:string};
function Feedback({state}:{state:VisitFormState}) {return state.result&&!state.result.ok?<div className="alert notice-danger" role="alert"><p>{state.result.error.message}</p>{state.result.error.code==='VERSION_CONFLICT'?<a href="">Reload the latest visit before saving again</a>:null}{state.result.error.fields?<ul>{Object.entries(state.result.error.fields).map(([key,error])=><li key={key}>{error}</li>)}</ul>:null}</div>:null;}
export function EventForm({visit,commandKey,options,jobId,requestId,date,initialTitle,initialStart,initialEnd}:Props){
  const [state,action,pending]=useActionState(saveVisitAction,{} as VisitFormState);const [allDay,setAllDay]=useState(visit?.allDay??false);const errors=state.result&&!state.result.ok?state.result.error.fields:undefined;
  const val=(name:string,fallback?:string|null)=>state.values?.[name]??fallback??'';
  const success=state.result?.ok?state.result.data:null;
  const assignees=state.assigneeIds??visit?.assignees.map(a=>a.id)??[];
  return <form onReset={event => event.preventDefault()} action={action} className={`panel ${styles.form}`}><CommandFields id={success?.id??visit?.id} version={success?.version??visit?.version??0} commandKey={commandKey}/><Feedback state={state}/>
    {success?<div className={styles.success} role="status"><strong>Visit saved.</strong> <Link href={`/schedule/${success.id}`}>Open saved visit</Link>{success.warnings.length?<div className={styles.warnings}><strong>Worker conflicts to review</strong><ul>{success.warnings.map(w=><li key={`${w.visitId}-${w.userId}`}>{w.workerName} is also assigned to <Link href={`/schedule/${w.visitId}`}>{w.title}</Link> during this time.</li>)}</ul><p className="field-hint">The visit is saved. Adjust the dates or assignments after reviewing these conflicts.</p></div>:null}</div>:null}
    <p className="field-hint">Fields marked * are required. All dates and times use Australia/Sydney, including daylight saving. End dates are inclusive for all-day visits.</p><div className="form-grid">
      <Field name="title" label="Visit title" required maxLength={240} defaultValue={val('title',visit?.title??initialTitle)} error={errors?.title}/>
      <div className="field"><label htmlFor="visit-type">Type</label><select id="visit-type" name="type" defaultValue={val('type',visit?.type??(requestId?'assessment':'visit'))}><option value="visit">Job visit</option><option value="assessment">Assessment</option><option value="general">General event</option></select></div>
      <div className="field"><label htmlFor="visit-job">Job</label><select id="visit-job" name="jobId" defaultValue={val('jobId',visit?.jobId??jobId)}><option value="">No job linked</option>{options.jobs.map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></div>
      <div className="field"><label htmlFor="visit-request">Request</label><select id="visit-request" name="requestId" defaultValue={val('requestId',visit?.requestId??requestId)}><option value="">No request linked</option>{options.requests.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></div>
      <div className="field"><label htmlFor="visit-status">Status</label><select id="visit-status" name="status" defaultValue={val('status',visit?.status??'scheduled')}>{Object.entries(visitStatuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><p className="field-hint">Cancel a visit to keep its history. Moving visits preserves the job’s progress.</p></div>
    </div>
    <fieldset><legend>Dates and time</legend><label><input type="checkbox" name="allDay" checked={allDay} onChange={e=>setAllDay(e.target.checked)}/> All-day visit</label><div className="form-grid">
      {allDay?<><Field type="date" name="startDate" label="Start date" required defaultValue={val('startDate',visit?.startDate??date)} error={errors?.startDate}/><Field type="date" name="endDate" label="End date · inclusive" required defaultValue={val('endDate',visit?.endDate??date)} error={errors?.endDate}/></>:<>
        <Field type="datetime-local" name="startLocal" label="Start · Sydney" required defaultValue={val('startLocal',visit?.startsAt?formatSydneyInput(visit.startsAt):initialStart??`${date}T08:00`)} error={errors?.startLocal??errors?.startsAt}/>
        <Field type="datetime-local" name="endLocal" label="End · Sydney" required defaultValue={val('endLocal',visit?.endsAt?formatSydneyInput(visit.endsAt):initialEnd??`${date}T09:00`)} error={errors?.endLocal??errors?.endsAt}/>
        {(['startLocal','endLocal'] as const).map((name,index)=><div className="field" key={name}><label htmlFor={`${name}-occurrence`}>{index?'End':'Start'} daylight saving occurrence</label><select id={`${name}-occurrence`} name={`${name}Occurrence`} defaultValue={val(`${name}Occurrence`)}><option value="">Automatic for unambiguous times</option><option value="earlier">Earlier occurrence</option><option value="later">Later occurrence</option></select><p className="field-hint">Only choose an occurrence when a time repeats as daylight saving ends.</p></div>)}
      </>}
    </div></fieldset>
    <fieldset aria-describedby="assignment-hint"><legend>Assigned workers</legend><p className="field-hint" id="assignment-hint">Leave all unchecked for an unassigned visit. Conflicts are shown after saving.</p><div className={styles.assignments}>{options.workers.map(w=><label key={w.id}><input name="assigneeIds" type="checkbox" value={w.id} defaultChecked={assignees.includes(w.id)}/>{w.name}</label>)}</div>{errors?.assigneeIds?<p className="field-error">{errors.assigneeIds}</p>:null}</fieldset>
    <TextArea name="description" label="Visit details" value={val('description',visit?.description)} error={errors?.description}/><div className="form-actions"><Link className="button button-secondary" href={visit?`/schedule/${visit.id}`:'/schedule'}>Back</Link><Button type="submit" loading={pending} disabled={!!success}>Save visit</Button>{success?<Link className="button" href={`/schedule/${success.id}/edit`}>Edit saved visit</Link>:null}</div>
  </form>;
}
export function VisitStatusForm({visit,commandKey,admin}:{visit:Visit;commandKey:string;admin:boolean}){
  const [state,action,pending]=useActionState(changeVisitStatusAction,{} as VisitFormState);
  return <form onReset={event => event.preventDefault()} action={action}><CommandFields id={visit.id} version={visit.version} commandKey={commandKey}/><Feedback state={state}/><div className="toolbar"><div className="field"><label htmlFor="status-change">Visit status</label><select id="status-change" name="status" defaultValue={visit.status}>{Object.entries(visitStatuses).filter(([key])=>admin||key!=='cancelled'||visit.status==='cancelled').map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></div><Button type="submit" loading={pending}>Update status</Button></div><p className="field-hint">This changes the visit’s status. Update the linked job separately when its overall work is complete.</p></form>;
}
/** Large field-friendly buttons for the next visit step (Start → Complete). */
export function VisitQuickActions({visit,commandKey}:{visit:Visit;commandKey:string}){
  const [state,action,pending]=useActionState(changeVisitStatusAction,{} as VisitFormState);
  const next:[string,string][]=visit.status==='scheduled'?[['in_progress','Start visit'],['completed','Mark complete']]:visit.status==='in_progress'?[['completed','Complete visit']]:[];
  if(!next.length)return null;
  return <form action={action}><CommandFields id={visit.id} version={visit.version} commandKey={commandKey}/><Feedback state={state}/><div className={styles.quick}>{next.map(([status,label],index)=><button key={status} type="submit" name="status" value={status} className={`button${index?' button-secondary':''}`} disabled={pending}>{pending?'Saving…':label}</button>)}</div></form>;
}
