import type { HTMLAttributes } from "react";

export type StatusProps = HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "info" | "success" | "warning" | "danger" };

export function Status({ tone = "neutral", className = "", ...props }: StatusProps) {
  return <span {...props} className={`status status-${tone} ${className}`} />;
}
