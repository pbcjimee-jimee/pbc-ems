import type { ReactNode } from "react";

export type DetailItem = { label: string; value: ReactNode; hidden?: boolean };

/** Label/value pairs for record summaries. */
export function DetailList({ items, stacked = false, className = "" }: { items: DetailItem[]; stacked?: boolean; className?: string }) {
  return (
    <dl className={`kv${stacked ? " kv-stacked" : ""} ${className}`}>
      {items.filter(item => !item.hidden).map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>
  );
}
