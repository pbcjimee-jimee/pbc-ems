import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

export function buttonClass(variant: Variant = "primary", size: Size = "md", className = "") {
  return ["button", variant === "primary" ? "" : `button-${variant}`, size === "sm" ? "button-sm" : "", className].filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({ variant = "primary", size = "md", icon, loading = false, loadingLabel = "Working…", disabled, className = "", children, type = "button", ...props }: ButtonProps) {
  return (
    <button {...props} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <><span className="button-progress" aria-hidden="true" />{loadingLabel}</> : <>{icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}{children}</>}
    </button>
  );
}

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  children: ReactNode;
};

/** A navigation action styled as a button. Keeps native link semantics. */
export function ButtonLink({ href, variant = "primary", size = "md", icon, className = "", children, ...props }: ButtonLinkProps) {
  return <Link {...props} href={href} className={buttonClass(variant, size, className)}>{icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}{children}</Link>;
}
