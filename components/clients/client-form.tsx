"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveClientAction, archiveClientAction } from "@/app/(ems)/clients/actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { CommandFields, FormFeedback, TextArea } from "@/components/ui/form";
export { CommandFields, FormFeedback, TextArea } from "@/components/ui/form";
import type { ClientDetail } from "@/lib/clients/service";
import type { FormState } from "@/lib/clients/schemas";
export function ClientForm({ client, commandKey }: { client?: ClientDetail; commandKey: string }) {
  const [state, action, pending] = useActionState(saveClientAction, {} as FormState);
  const errors = state.result && !state.result.ok ? state.result.error.fields : undefined;
  const value = (field: string, fallback?: string | null) => state.values?.[field] ?? fallback ?? "";
  return <form onReset={event => event.preventDefault()} action={action} className="panel">
    <CommandFields id={client?.id} version={client?.version ?? 0} commandKey={commandKey} /><FormFeedback state={state} />
    <p className="field-hint">Fields marked * are required. Billing and site addresses are saved separately.</p>
    <div className="form-grid">
      <Field name="displayName" label="Client name" required maxLength={200} defaultValue={value("displayName", client?.displayName)} error={errors?.displayName} autoComplete="name" />
      <Field name="companyName" label="Company" maxLength={200} defaultValue={value("companyName", client?.companyName)} error={errors?.companyName} autoComplete="organization" />
      <Field name="email" label="Email" type="email" defaultValue={value("email", client?.email)} error={errors?.email} autoComplete="email" />
      <Field name="phone" label="Phone" type="tel" maxLength={80} defaultValue={value("phone", client?.phone)} error={errors?.phone} autoComplete="tel" />
      <TextArea name="billingAddress" label="Billing address" value={value("billingAddress", client?.billingAddress)} error={errors?.billingAddress} />
      <TextArea name="notes" label="Internal client notes" value={value("notes", client?.notes)} error={errors?.notes} />
      <Field name="tags" label="Tags" hint="Separate tags with commas." defaultValue={value("tags", client?.tags.join(", "))} error={errors?.tags} />
    </div>
    <div className="form-actions"><Link className="button button-secondary" href={client ? `/clients/${client.id}` : "/clients"}>Cancel</Link><Button type="submit" loading={pending}>Save client</Button></div>
  </form>;
}
export function ArchiveClientForm({ client, commandKey }: { client: ClientDetail; commandKey: string }) {
  const [state, action, pending] = useActionState(archiveClientAction, {} as FormState);
  return <form action={action}><CommandFields id={client.id} version={client.version} commandKey={commandKey} /><input type="hidden" name="archived" value={client.archivedAt ? "false" : "true"} /><FormFeedback state={state} /><Button type="submit" variant="secondary" loading={pending}>{client.archivedAt ? "Restore client" : "Archive client"}</Button></form>;
}
