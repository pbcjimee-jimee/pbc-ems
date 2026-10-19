import Link from "next/link";
import { Icon } from "./icon";

export function Pagination({ page, pageSize, total, href, label }: { page: number; pageSize: number; total: number; href: (page: number) => string; label: string }) {
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  const hasPrevious = page > 1;
  const hasNext = page * pageSize < total;
  return (
    <nav className="pagination" aria-label={label}>
      <span>Showing {first}–{last} of {total}</span>
      {hasPrevious || hasNext ? (
        <div>
          {hasPrevious ? <Link className="button button-secondary button-sm" href={href(page - 1)}><Icon name="chevron-left" size={16} />Previous</Link> : null}
          {hasNext ? <Link className="button button-secondary button-sm" href={href(page + 1)}>Next<Icon name="chevron-right" size={16} /></Link> : null}
        </div>
      ) : null}
    </nav>
  );
}
