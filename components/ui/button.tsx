import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
};

export function Button({ variant = "primary", loading = false, disabled, className = "", children, type = "button", ...props }: ButtonProps) {
  return (
    <button {...props} type={type} className={`button ${variant === "primary" ? "" : `button-${variant}`} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <><span className="button-progress" aria-hidden="true" />Working…</> : children}
    </button>
  );
}
