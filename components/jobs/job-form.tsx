'use client';
import { useActionState,useState } from 'react';
import Link from 'next/link';
import { saveJobAction,convertQuoteAction,changeJobStatusAction,archiveJobAction } from '@/app/(ems)/jobs/actions';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { CommandFields,FormFeedback,TextArea } from '@/components/clients/client-form';
import { PublicLines } from '@/components/quotes/public-lines';
import { calculateCommercialTotals } from '@/lib/quotes/commercial-totals';
import type { PublicLineDraft } from '@/lib/quotes/types';
import type { FormState } from '@/lib/clients/schemas';
import type { Property } from '@/lib/clients/service';
import type { JobDetail } from '@/lib/jobs/service';
import type { RequestDetail } from '@/lib/requests/service';
import { jobStatusLabels } from '@/lib/jobs/schemas';
import { money } from '@/lib/domain/format';
export function JobForm({job,request,commandKey,clients=[],properties=[]}:{job?:JobDetail;request?:Pick<RequestDetail,'id'|'clientId'|'propertyId'|'clientName'|'address'|'title'|'description'>;commandKey:string;clients?:{id:string;displayName:string}[];properties?:Property[]}){
  const [state,action,pending]=useActionState(saveJobAction,{} as FormState);
  const [clientId,setClientId]=useState(job?.clientId??request?.clientId??'');const [propertyId,setPropertyId]=useState(job?.propertyId??request?.propertyId??'');
  const [lines,setLines]=useState<PublicLineDraft[]>([{id:'initial',kind:'line_item',name:'',description:'',quantity:'1',unitPrice:'0',taxable:true,clientVisible:true,selected:true}]);
  const errors=state.result&&!state.result.ok?state.result.error.fields:undefined;const value=(key:string,fallback?:string|null)=>state.values?.[key]??fallback??'';
  let total='Check contract line amounts';try{total=money(calculateCommercialTotals(lines).total)+' AUD Inc GST';}catch{/* Invalid partial input is validated on save. */}
  return <form onReset={event => event.preventDefault()} action={action} className="panel"><CommandFields id={job?.id} version={job?.version??0} commandKey={commandKey}/><input type="hidden" name="requestId" value={job?.requestId??request?.id??''}/><FormFeedback state={state}/><p className="field-hint">Fields marked * are required. The confirmed customer, addresses, terms and prices are fixed when the job is created.</p>{request?<p>From request: <Link href={`/requests/${request.id}`}>{request.title}</Link></p>:null}<div className="form-grid">
    {job||request?<><input type="hidden" name="clientId" value={job?.clientId??request!.clientId}/><input type="hidden" name="propertyId" value={job?.propertyId??request?.propertyId??''}/><p>Customer: {job?.clientName??request!.clientName}<br/>Site: {job?.address??request?.address??'No site selected'}</p></>:<><div className="field"><label htmlFor="job-client">Customer *</label><select id="job-client" name="clientId" required value={clientId} onChange={e=>{setClientId(e.target.value);setPropertyId('');}} aria-invalid={!!errors?.clientId} aria-describedby={errors?.clientId?'job-client-error':undefined}><option value="">Choose customer</option>{clients.map(c=><option value={c.id} key={c.id}>{c.displayName}</option>)}</select>{errors?.clientId?<p id="job-client-error" className="field-error">{errors.clientId}</p>:null}</div><div className="field"><label htmlFor="job-property">Work site</label><select id="job-property" name="propertyId" value={propertyId} onChange={e=>setPropertyId(e.target.value)} aria-invalid={!!errors?.propertyId}><option value="">No site selected</option>{properties.filter(p=>p.clientId===clientId).map(p=><option key={p.id} value={p.id}>{p.label} — {p.address}</option>)}</select>{errors?.propertyId?<p className="field-error">{errors.propertyId}</p>:null}</div></>}
    <Field name="title" label="Job title" required maxLength={500} defaultValue={value('title',job?.title??request?.title)} error={errors?.title}/><div className="field"><label htmlFor="job-status">Status</label><select name="status" id="job-status" defaultValue={value('status',job?.status??'unscheduled')}>{Object.entries(jobStatusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    <TextArea name="description" label="Work scope *" value={value('description',job?.description??request?.description)} error={errors?.description} hint="Work instructions visible to assigned supervisors."/><TextArea name="notes" label="Site notes" value={value('notes',job?.notes)} error={errors?.notes} hint="Visible to assigned supervisors. Keep financial and confidential notes out of this field."/>
  </div>{!job?<><h2 style={{marginTop:24}}>Confirm customer contract</h2><input type="hidden" name="publicLines" value={JSON.stringify(lines)}/><PublicLines value={lines} onChange={setLines}/>{errors?Object.entries(errors).filter(([key])=>key.startsWith('publicLines')).map(([key,error])=><p className="field-error" key={key}>{error}</p>):null}<p aria-live="polite">Contract total: <strong>{total}</strong></p><TextArea name="terms" label="Customer terms" value={value('terms')} error={errors?.terms}/></>:null}<div className="form-actions"><Link className="button button-secondary" href={job?`/jobs/${job.id}`:'/jobs'}>Cancel</Link><Button type="submit" loading={pending}>{job?'Save work details':'Confirm contract and create job'}</Button></div></form>;
}
export function ConvertQuoteForm({quoteId,version,commandKey}:{quoteId:string;version:number;commandKey:string}){
  const [state,action,pending]=useActionState(convertQuoteAction,{} as FormState);return <form action={action}><CommandFields version={version} commandKey={commandKey}/><input type="hidden" name="quoteId" value={quoteId}/><FormFeedback state={state}/><Button type="submit" loading={pending}>Create job from approved revision</Button></form>;
}
export function JobStatusForm({id,version,status,commandKey}:{id:string;version:number;status:string;commandKey:string}){
  const [state,action,pending]=useActionState(changeJobStatusAction,{} as FormState);return <form onReset={event => event.preventDefault()} action={action} className="toolbar"><CommandFields id={id} version={version} commandKey={commandKey}/><FormFeedback state={state}/><div className="field"><label htmlFor="work-status">Work status</label><select id="work-status" name="status" defaultValue={state.values?.status??status}>{Object.entries(jobStatusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div><Button type="submit" loading={pending}>Update status</Button></form>;
}
export function ArchiveJobForm({id,version,archived,commandKey}:{id:string;version:number;archived:boolean;commandKey:string}){
  const [state,action,pending]=useActionState(archiveJobAction,{} as FormState);return <form action={action}><CommandFields id={id} version={version} commandKey={commandKey}/><input type="hidden" name="archived" value={String(!archived)}/><FormFeedback state={state}/><Button type="submit" variant="secondary" loading={pending}>{archived?'Restore job':'Archive job'}</Button></form>;
}
