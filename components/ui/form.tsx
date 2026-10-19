import type { ReactNode, SelectHTMLAttributes } from "react";
import type { FormState } from "@/lib/clients/schemas";
import { Icon } from "./icon";

/** Server-action error summary. Keeps the person's input and names the recovery step. */
export function FormFeedback({ state }: { state: FormState }) {
  if (!state.result || state.result.ok) return null;
  return (
    <div className="notice notice-danger" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <p>{state.result.error.message}</p>
        {state.result.error.code === "VERSION_CONFLICT" ? <a href="">Reload the latest record before saving again</a> : null}
      </div>
    </div>
  );
}

/** Optimistic-concurrency and idempotency fields every command form sends. */
export function CommandFields({ id, version, commandKey }: { id?: string; version: number; commandKey: string }) {
  return <><input type="hidden" name="id" value={id ?? ""} /><input type="hidden" name="expectedVersion" value={version} /><input type="hidden" name="idempotencyKey" value={commandKey} /></>;
}

export function TextArea({ name, label, value, error, hint, rows = 4, required = false, id }: { name: string; label: string; value?: string | null; error?: string; hint?: string; rows?: number; required?: boolean; id?: string }) {
  const fieldId = id ?? name;
  const describedBy = [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      {hint ? <p className="field-hint" id={`${fieldId}-hint`}>{hint}</p> : null}
      <textarea id={fieldId} name={name} rows={rows} required={required} defaultValue={value ?? ""} aria-invalid={!!error} aria-describedby={describedBy} />
      {error ? <p id={`${fieldId}-error`} className="field-error">{error}</p> : null}
    </div>
  );
}

/** Labelled select with hint and error wiring. Use `children` for <option> elements. */
export function SelectField({ id, name, label, hint, error, required = false, children, ...props }: { id: string; name: string; label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "name" | "children">) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      <select {...props} id={id} name={name} required={required} aria-invalid={!!error} aria-describedby={describedBy}>{children}</select>
      {hint ? <p className="field-hint" id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="field-error">{error}</p> : null}
    </div>
  );
}

/** Form footer: save status on the left, actions on the right. */
export function FormActions({ children, status }: { children: ReactNode; status?: ReactNode }) {
  return <div className="form-actions">{status ? <span className="field-hint" role="status" style={{ marginRight: "auto", alignSelf: "center" }}>{status}</span> : null}{children}</div>;
}
