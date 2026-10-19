import type { CSSProperties } from "react";

export type IconName =
  | "home" | "schedule" | "clients" | "requests" | "quotes" | "jobs" | "invoices" | "expenses" | "timesheets"
  | "plus" | "search" | "menu" | "close" | "arrow" | "logout" | "back" | "chevron-down" | "chevron-left" | "chevron-right"
  | "more" | "check" | "filter" | "phone" | "mail" | "pin" | "clock" | "edit" | "print" | "archive" | "dollar"
  | "alert" | "info" | "user" | "settings" | "copy" | "play" | "stop" | "list" | "grid";
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
  back: ["M19 12H5m5-5-5 5 5 5"], "chevron-down": ["m6 9 6 6 6-6"], "chevron-left": ["m15 6-6 6 6 6"], "chevron-right": ["m9 6 6 6-6 6"],
  more: ["M5 12h.01M12 12h.01M19 12h.01"], check: ["m5 12 5 5 9-10"], filter: ["M3 5h18l-7 8v6l-4 2v-8Z"],
  phone: ["M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"],
  mail: ["M3 5h18v14H3z", "m3 6 9 7 9-7"], pin: ["M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z", "M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M12 7v5l3 2"], edit: ["M4 20h4L19 9l-4-4L4 16Z", "m13 7 4 4"],
  print: ["M7 9V3h10v6", "M7 17H4v-7h16v7h-3", "M7 14h10v7H7z"], archive: ["M3 4h18v5H3z", "M5 9v11h14V9M10 13h4"],
  dollar: ["M12 2v20", "M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"], alert: ["M12 3 2 21h20Z", "M12 10v4M12 17h.01"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M12 11v5M12 8h.01"], user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"], play: ["M7 4v16l13-8Z"], stop: ["M6 6h12v12H6z"],
  list: ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"], grid: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
};
export function Icon({ name, size = 20, style, className }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={className}>{paths[name].map((d, index) => <path key={index} d={d} />)}</svg>;
}
