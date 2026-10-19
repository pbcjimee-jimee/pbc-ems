"use client";
import { useActionState } from "react";
import { savePropertyAction } from "@/app/(ems)/clients/actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { CommandFields, FormFeedback } from "./client-form";
import type { Property } from "@/lib/clients/service";
import type { FormState } from "@/lib/clients/schemas";
export function PropertyForm({ clientId, property, commandKey }: { clientId: string; property?: Property; commandKey: string }) {
  const [state, action, pending] = useActionState(savePropertyAction, {} as FormState);
  const errors = state.result && !state.result.ok ? state.result.error.fields : undefined;
  const prefix = property?.id ?? "new-property";
  return <form onReset={event => event.preventDefault()} action={action} className={property ? undefined : "panel"}><CommandFields id={property?.id} version={property?.version ?? 0} commandKey={commandKey} /><input name="clientId" type="hidden" value={clientId} /><FormFeedback state={state} />
    <div className="form-grid">
      <Field id={`${prefix}-label`} name="label" label="Site name" required maxLength={200} defaultValue={state.values?.label ?? property?.label ?? ""} error={errors?.label} />
      <Field id={`${prefix}-address`} name="address" label="Site address" required maxLength={2000} defaultValue={state.values?.address ?? property?.address ?? ""} error={errors?.address} />
      <Field id={`${prefix}-notes`} name="notes" label="Internal site notes" maxLength={10000} defaultValue={state.values?.notes ?? property?.notes ?? ""} error={errors?.notes} />
      {property ? <div className="field"><label htmlFor={`${prefix}-archived`}><input id={`${prefix}-archived`} type="checkbox" name="archived" defaultChecked={state.values ? state.values.archived === "on" : !!property.archivedAt} /> Archive this site</label><p className="field-hint">Past work retains its saved address.</p></div> : null}
    </div><div className="form-actions"><Button type="submit" loading={pending}>{property ? "Save site" : "Add site"}</Button></div>
  </form>;
}
