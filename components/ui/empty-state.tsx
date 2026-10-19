import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type EmptyStateProps = { title: string; description: string; action?: ReactNode; icon?: IconName };

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ? <span className="empty-state-icon"><Icon name={icon} size={24} /></span> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
