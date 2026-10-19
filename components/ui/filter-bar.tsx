import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export type FilterBarProps = {
  search?: { id: string; label: string; name?: string; defaultValue?: string; placeholder?: string };
  /** Extra filter fields (`.field` blocks) and hidden inputs. */
  children?: ReactNode;
  resetHref: string;
  submitLabel?: string;
  action?: string;
};

/** GET filter form shared by list pages: search first, then filters, then Apply / Reset. */
export function FilterBar({ search, children, resetHref, submitLabel = "Apply", action }: FilterBarProps) {
  return (
    <form method="get" action={action} className="filter-bar" role="search">
      {search ? (
        <div className="field filter-search">
          <label htmlFor={search.id}>{search.label}</label>
          <div className="search-input">
            <Icon name="search" size={18} />
            <input id={search.id} type="search" name={search.name ?? "search"} defaultValue={search.defaultValue} placeholder={search.placeholder} maxLength={200} />
          </div>
        </div>
      ) : null}
      {children}
      <div className="filter-actions">
        <button type="submit" className="button button-secondary">{submitLabel}</button>
        <Link href={resetHref} className="button button-ghost">Reset</Link>
      </div>
    </form>
  );
}

export function SelectFilter({ id, name, label, defaultValue, options }: { id: string; name: string; label: string; defaultValue?: string; options: [value: string, label: string][] }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={defaultValue}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
    </div>
  );
}
