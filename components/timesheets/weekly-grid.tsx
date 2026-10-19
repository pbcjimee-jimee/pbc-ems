import { formatSydneyInput } from '@/lib/domain/sydney-date-time';
import { shortDate } from '@/lib/domain/format';
import type { TimeEntry } from '@/lib/timesheets/service';
import styles from './timesheets.module.css';
export function minutesLabel(minutes: number): string { return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
export function WeeklyGrid({ items, dates, today }: { items: TimeEntry[]; dates: string[]; today?: string }) {
  return <section aria-label="Daily recorded totals" className={styles.week}>{dates.map(date => { const daily = items.filter(row => formatSydneyInput(row.startedAt).slice(0, 10) === date); const minutes = daily.reduce((sum, row) => sum + (row.minutes ?? 0), 0); return <div className={styles.day} key={date} data-today={date === today || undefined} data-empty={!daily.length || undefined}><span>{new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))} · {shortDate(date)}</span><strong>{minutesLabel(minutes)}</strong><small>{daily.length} {daily.length === 1 ? 'entry' : 'entries'}{daily.some(row => !row.endedAt) ? ' · running' : ''}</small></div>; })}</section>;
}
