import type { HTMLAttributes } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusProps = HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; plain?: boolean };

export function Status({ tone = "neutral", plain = false, className = "", ...props }: StatusProps) {
  return <span {...props} className={`status status-${tone}${plain ? " status-plain" : ""} ${className}`} />;
}

/** One lifecycle colour map shared by every record type (requests, quotes, jobs, visits, invoices, timesheets). */
const tones: Record<string, StatusTone> = {
  new: "info", in_review: "warning", quoted: "success", closed: "neutral",
  draft: "neutral", issued: "info", awaiting_response: "info", changes_requested: "warning", approved: "success", declined: "danger", converted: "success",
  unscheduled: "warning", scheduled: "info", in_progress: "info", completed: "success", cancelled: "neutral", requires_invoicing: "warning",
  paid: "success", partial: "warning", unpaid: "info", outstanding: "info", overdue: "danger", void: "neutral",
  submitted: "info", rejected: "danger", reopened: "warning", archived: "neutral", active: "success",
};
const labels: Record<string, string> = {
  in_review: "In review", changes_requested: "Changes requested", in_progress: "In progress", requires_invoicing: "Requires invoicing",
  issued: "Awaiting response", awaiting_response: "Awaiting response",
  unpaid: "Awaiting payment", outstanding: "Awaiting payment", partial: "Partially paid", overdue: "Past due",
};

export function statusTone(status: string): StatusTone { return tones[status] ?? "neutral"; }
export function statusLabel(status: string): string {
  return labels[status] ?? status.replaceAll("_", " ").replace(/^\w/, letter => letter.toUpperCase());
}

/** Status pill for a lifecycle value. Pass `label` to override the default wording. */
export function StatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: StatusTone; className?: string }) {
  return <Status tone={tone ?? statusTone(status)} className={className}>{label ?? statusLabel(status)}</Status>;
}
