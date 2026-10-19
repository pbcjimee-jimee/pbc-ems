import type { Result } from "./types";

export function formatSydneyInput(timestamp: string): string {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function resolveSydneyDateTime(date: string, time: string, disambiguation?: "earlier" | "later"): Result<{ iso: string }> {
  const wallTime = `${date}T${time}`;
  const base = Date.parse(`${wallTime}:00Z`);
  const invalid = (code: string, message: string): Result<never> => ({ ok: false, error: { code, message } });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== wallTime) {
    return invalid("INVALID_DATE_TIME", "Enter a valid date and time.");
  }
  // Sydney uses UTC+10 or UTC+11; round-trip both candidates instead of guessing across DST changes.
  const matches = [11, 10].map(offset => new Date(base - offset * 3600000).toISOString()).filter(instant => formatSydneyInput(instant) === wallTime);
  if (!matches.length) return invalid("NONEXISTENT_TIME", "This Sydney time is skipped by daylight saving. Choose another time.");
  if (matches.length > 1 && !disambiguation) return invalid("AMBIGUOUS_TIME", "This Sydney time repeats when daylight saving ends. Choose the earlier or later occurrence.");
  return { ok: true, data: { iso: matches[disambiguation === "later" ? matches.length - 1 : 0] } };
}
