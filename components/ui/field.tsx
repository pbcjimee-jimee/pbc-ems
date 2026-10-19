"use client";

import { useId, type InputHTMLAttributes } from "react";

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Field({ label, hint, error, id: suppliedId, className = "", "aria-describedby": describedBy, ...props }: FieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const description = [describedBy, hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}{props.required ? <span aria-hidden="true"> *</span> : null}</label>
      {hint ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
      <input {...props} id={id} aria-describedby={description} aria-invalid={error ? true : props["aria-invalid"]} />
      {error ? <p id={`${id}-error`} className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}
