"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveRequestAction, archiveRequestAction } from "@/app/(ems)/requests/actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { CommandFields, FormFeedback, TextArea } from "@/components/clients/client-form";
import type { FormState } from "@/lib/clients/schemas";
import type { Property } from "@/lib/clients/service";
import type { RequestDetail } from "@/lib/requests/service";
import { requestStatusLabels } from "@/lib/requests/schemas";
import { formatSydneyInput } from "@/lib/domain/sydney-date-time";
type Props = { request?: RequestDetail; commandKey: string; clients: {id:string;displayName:string}[]; properties: Property[]; clientId?: string; propertyId?: string };
export function RequestForm({ request, commandKey, clients, properties, clientId, propertyId }: Props) {
  const [state, action, pending] = useActionState(saveRequestAction, {} as FormState);
  const [selectedClient, setSelectedClient] = useState(request?.clientId ?? clientId ?? "");
  const [selectedProperty, setSelectedProperty] = useState(request?.propertyId ?? propertyId ?? "");
  const errors = state.result && !state.result.ok ? state.result.error.fields : undefined;
  const value = (field: string, fallback?: string | null) => state.values?.[field] ?? fallback ?? "";
  const linked = !!request?.quotes.length;
  return <form onReset={event => event.preventDefault()} action={action} className="panel"><CommandFields id={request?.id} version={request?.version ?? 0} commandKey={commandKey} /><FormFeedback state={state} />
    <p className="field-hint">Fields marked * are required. Assessment times use Australia/Sydney.</p><div className="form-grid">
      <div className="field"><label htmlFor="request-client">Customer *</label><select id="request-client" name="clientId" value={selectedClient} required onChange={event => { setSelectedClient(event.target.value); setSelectedProperty(""); }} aria-invalid={!!errors?.clientId} aria-describedby={errors?.clientId ? "request-client-error" : undefined}><option value="">Choose customer</option>{clients.map(client => <option key={client.id} value={client.id}>{client.displayName}</option>)}</select>{errors?.clientId ? <p className="field-error" id="request-client-error">{errors.clientId}</p> : null}</div>
      <div className="field"><label htmlFor="request-property">Work site</label><select id="request-property" name="propertyId" value={selectedProperty} onChange={event => setSelectedProperty(event.target.value)} aria-invalid={!!errors?.propertyId} aria-describedby="request-property-hint"><option value="">No site selected</option>{properties.filter(property => property.clientId === selectedClient).map(property => <option key={property.id} value={property.id}>{property.label} — {property.address}</option>)}</select><p className="field-hint" id="request-property-hint">{linked ? "The linked quote fixes this request’s customer and site." : selectedClient ? <Link href={`/clients/${selectedClient}`}>Manage sites for this customer</Link> : "Choose the customer first."}</p>{errors?.propertyId ? <p className="field-error">{errors.propertyId}</p> : null}</div>
      <Field name="title" label="Request title" required maxLength={240} defaultValue={value("title", request?.title)} error={errors?.title} />
      <div className="field"><label htmlFor="request-status">Status</label><select id="request-status" name="status" defaultValue={value("status", request?.status ?? "new")} aria-describedby="request-status-hint">{Object.entries(requestStatusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><p id="request-status-hint" className="field-hint">Review the request before quoting. Quoted requires an issued linked quote.</p>{errors?.status ? <p className="field-error">{errors.status}</p> : null}</div>
      <Field type="date" name="preferredDate" label="Preferred work date" defaultValue={value("preferredDate", request?.preferredDate)} error={errors?.preferredDate} />
      <Field type="datetime-local" name="assessmentLocal" label="Planned assessment · Sydney" defaultValue={value("assessmentLocal", request?.assessmentAt ? formatSydneyInput(request.assessmentAt) : "")} error={errors?.assessmentLocal ?? errors?.assessmentAt} hint="Save the plan here, then use Schedule assessment to assign a visit." />
      <div className="field"><label htmlFor="assessment-occurrence">Daylight saving occurrence</label><select id="assessment-occurrence" name="assessmentOccurrence" defaultValue={value("assessmentOccurrence")} aria-describedby="assessment-occurrence-hint"><option value="">Automatic for unambiguous times</option><option value="earlier">Earlier occurrence</option><option value="later">Later occurrence</option></select><p className="field-hint" id="assessment-occurrence-hint">Only needed when the assessment time repeats as daylight saving ends.</p></div>
    </div><div style={{ marginTop: 16 }}><TextArea name="description" label="Request details" value={value("description", request?.description)} error={errors?.description} /></div>
    <div className="form-actions"><Link href={request ? `/requests/${request.id}` : "/requests"} className="button button-secondary">Cancel</Link><Button type="submit" loading={pending}>Save request</Button></div>
  </form>;
}
export function ArchiveRequestForm({ request, commandKey }: { request: RequestDetail; commandKey: string }) {
  const [state, action, pending] = useActionState(archiveRequestAction, {} as FormState);
  return <form action={action}><CommandFields id={request.id} version={request.version} commandKey={commandKey} /><input type="hidden" name="archived" value={request.archivedAt ? "false" : "true"} /><FormFeedback state={state} /><Button variant="secondary" type="submit" loading={pending}>{request.archivedAt ? "Restore request" : "Archive request"}</Button></form>;
}
