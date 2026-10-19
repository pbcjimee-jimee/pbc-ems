import type { ReactNode } from "react";

export type CardProps = {
  title?: ReactNode;
  description?: ReactNode;
  count?: number | string;
  action?: ReactNode;
  footer?: ReactNode;
  /** Remove body padding for tables and record lists. */
  flush?: boolean;
  id?: string;
  className?: string;
  as?: "section" | "div" | "article";
  children?: ReactNode;
};

export function Card({ title, description, count, action, footer, flush = false, id, className = "", as: Tag = "section", children }: CardProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Tag className={`card${flush ? " card-flush" : ""} ${className}`} aria-labelledby={title && headingId ? headingId : undefined} id={id}>
      {title || action ? (
        <div className="card-header">
          <div>
            {title ? <h2 id={headingId}>{title}{count !== undefined ? <span className="count-badge">{count}</span> : null}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
      {footer ? <div className="card-footer">{footer}</div> : null}
    </Tag>
  );
}
