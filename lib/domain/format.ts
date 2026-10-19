import Decimal from "decimal.js";
export function money(value: string | null | undefined): string {
  const amount = new Decimal(value ?? "0");
  const [whole, fraction] = amount.abs().toFixed(2).split(".");
  return (amount.isNegative() ? "-$" : "$") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction;
}
export function shortDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: dateOnly ? "UTC" : "Australia/Sydney" }).format(new Date(dateOnly ? value+"T12:00:00Z" : value));
}
export function timeOfDay(value: string): string {
  return new Intl.DateTimeFormat("en-AU", { hour:"numeric", minute:"2-digit", timeZone:"Australia/Sydney" }).format(new Date(value));
}
export function sydneyToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Australia/Sydney" }).formatToParts(now);
  return ["year","month","day"].map(type => parts.find(p => p.type===type)?.value).join("-");
}

