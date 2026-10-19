export function durationMinutes(start: string, end: string, breakMinutes: number): number {
  const elapsed = (Date.parse(end) - Date.parse(start)) / 60000;
  if (!Number.isFinite(elapsed) || elapsed <= 0 || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > elapsed) throw new Error('End must follow start and the break must fit inside the entry.');
  return Math.floor(elapsed - breakMinutes);
}
