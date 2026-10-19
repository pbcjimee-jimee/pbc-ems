import Link from "next/link";

export type TabItem = { label: string; href: string; count?: number | string; current?: boolean };

/** Link-based tabs for list status filters. Each tab is a real URL so filters survive reloads and sharing. */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map(item => (
        <Link key={item.label} href={item.href} aria-current={item.current ? "page" : undefined}>
          {item.label}{item.count !== undefined ? <span className="count-badge">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Compact segmented control for switching views (Month / Week / Day, Day / Week). */
export function Segmented({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="segmented" aria-label={label}>
      {items.map(item => <Link key={item.label} href={item.href} aria-current={item.current ? "page" : undefined}>{item.label}</Link>)}
    </nav>
  );
}
