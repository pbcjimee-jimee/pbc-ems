import Link from "next/link";
import { Icon, type IconName } from "./icon";
import { statusLabel } from "./status";

export type WorkflowKind = "request" | "quote" | "job" | "invoice";
export type WorkflowStep = {
  kind: WorkflowKind;
  /** Linked record title or number; omit when the stage has no record yet. */
  title?: string;
  href?: string;
  status?: string;
  current?: boolean;
  /** Text for an empty stage, e.g. "Not quoted". */
  emptyLabel?: string;
};

const meta: Record<WorkflowKind, { label: string; icon: IconName }> = {
  request: { label: "Request", icon: "requests" },
  quote: { label: "Quote", icon: "quotes" },
  job: { label: "Job", icon: "jobs" },
  invoice: { label: "Invoice", icon: "invoices" },
};

/** Request → Quote → Job → Invoice trail so staff can move between linked records without re-searching. */
export function WorkflowTrail({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="workflow-trail" aria-label="Work progress">
      {steps.map(step => {
        const state = step.current ? "current" : step.title ? "linked" : "empty";
        const body = <>
          <span className="workflow-kind"><Icon name={meta[step.kind].icon} size={14} />{meta[step.kind].label}</span>
          <strong>{step.title ?? step.emptyLabel ?? "Not started"}</strong>
          {step.status ? <small>{statusLabel(step.status)}</small> : null}
        </>;
        return (
          <li key={step.kind} data-state={state} aria-current={step.current ? "step" : undefined}>
            {step.href && !step.current ? <Link href={step.href}>{body}</Link> : <div className="workflow-step">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}
