import type { CSSProperties } from "react";

export type IconName = "home" | "schedule" | "clients" | "requests" | "quotes" | "jobs" | "invoices" | "expenses" | "timesheets" | "plus" | "search" | "menu" | "close" | "arrow" | "logout";
const paths: Record<IconName, string[]> = {
  home: ["m3 10 9-7 9 7", "M5 9v11h5v-6h4v6h5V9"],
  schedule: ["M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z", "M7 2v4M17 2v4M3 10h18M7 14h2M15 14h2M7 17h2"],
  clients: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M18 8a3 3 0 0 1 0 6M22 21v-2a4 4 0 0 0-3-3.87"],
  requests: ["M5 3h14v18H5z", "M9 8h6M9 12h6M9 16h3"],
  quotes: ["M5 3h10l4 4v14H5z", "M15 3v5h4M9 12h6M9 16h4"],
  jobs: ["M3 7h18v14H3z", "M8 7V3h8v4M3 12h18M10 11v3h4v-3"],
  invoices: ["M5 3h14v18l-3-2-4 2-4-2-3 2Z", "M9 8h6M9 12h6M9 16h3"],
  expenses: ["M3 6h18v14H3z", "M3 10h18M7 15h4M17 14v3"],
  timesheets: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M12 7v5l3 2"],
  plus: ["M12 5v14M5 12h14"], search: ["M21 21l-5-5", "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14"],
  menu: ["M4 6h16M4 12h16M4 18h16"], close: ["m6 6 12 12M6 18 18 6"],
  arrow: ["M5 12h14m-5-5 5 5-5 5"], logout: ["M9 3H4v18h5M12 12h9m-4-4 4 4-4 4"],
};
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name].map((d, index) => <path key={index} d={d} />)}</svg>;
}

