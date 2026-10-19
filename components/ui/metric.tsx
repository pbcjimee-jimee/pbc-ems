import Link from "next/link";
import type { ReactNode } from "react";

/** A single headline number. Linked metrics open the matching filtered list. */
export function Metric({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = <><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</>;
  return href ? <Link href={href} className="metric">{body}</Link> : <div className="metric">{body}</div>;
}
