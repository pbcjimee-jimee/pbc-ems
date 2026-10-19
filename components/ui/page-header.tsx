import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export type PageHeaderProps = {
  title: ReactNode;
  /** Small label above the title, e.g. a record number. */
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  description?: ReactNode;
  /** Inline metadata row under the title: status badges, dates, owners. */
  meta?: ReactNode;
  /** Secondary actions and MoreMenu first, primary action last. */
  actions?: ReactNode;
};

export function PageHeader({ title, eyebrow, back, description, meta, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {back ? <Link href={back.href} className="page-back"><Icon name="back" size={16} />{back.label}</Link> : null}
        {eyebrow ? <span className="page-eyebrow">{eyebrow}</span> : null}
        <h1 className="page-title">{title}</h1>
        {meta ? <div className="page-meta">{meta}</div> : null}
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
