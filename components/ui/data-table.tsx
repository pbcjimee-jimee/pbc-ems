import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
  /** The primary column holds the record link and becomes the card title on phones. */
  primary?: boolean;
  hideOnMobile?: boolean;
};

export type DataTableProps<T> = {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  footer?: ReactNode;
};

/** Record table that collapses into stacked cards on narrow screens. Primary cells must contain a real link. */
export function DataTable<T>({ caption, columns, rows, rowKey, footer }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="data-table table-responsive">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col" className={column.align === "end" ? "align-end" : undefined}>{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map(column => (
                <td key={column.key} data-label={column.header} data-mobile={column.hideOnMobile ? "hide" : undefined} className={[column.primary ? "cell-primary" : "", column.align === "end" ? "align-end" : ""].filter(Boolean).join(" ") || undefined}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}
