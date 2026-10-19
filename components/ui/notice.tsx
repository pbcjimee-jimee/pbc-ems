import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type NoticeTone = "info" | "success" | "warning" | "danger";
const icons: Record<NoticeTone, IconName> = { info: "info", success: "check", warning: "alert", danger: "alert" };

/** Inline page message. Success and info announce politely; danger interrupts. */
export function Notice({ tone = "info", title, children }: { tone?: NoticeTone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`notice${tone === "info" ? "" : ` notice-${tone}`}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icons[tone]} size={18} />
      <div>{title ? <strong>{title}</strong> : null}{title && children ? <br /> : null}{children}</div>
    </div>
  );
}
