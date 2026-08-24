/**
 * Date helpers operating on YYYY-MM-DD strings (frontend contract format).
 */

/** Format a Date as YYYY-MM-DD in local time. */
export function toISODate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00`) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date as YYYY-MM-DD. */
export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonthsISO(iso: string, months: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Clamp for short months (e.g. Jan 31 + 1 month -> Feb 28/29).
  if (d.getDate() !== day) {
    d.setDate(0); // last day of the previous month (src/JS Date semantics)
  }
  return toISODate(d);
}

/** Number of calendar days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function isBefore(a: string, b: string): boolean {
  return parseISO(a).getTime() < parseISO(b).getTime();
}

export function isOnOrAfter(a: string, b: string): boolean {
  return parseISO(a).getTime() >= parseISO(b).getTime();
}

/** ISO datetime for audit timestamps (e.g. 2026-08-24T10:00:00.000Z). */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Format a Date/datetime as a plain date string (YYYY-MM-DD). */
export function toDateOnly(value: Date | string): string {
  if (value instanceof Date) return toISODate(value);
  return toISODate(value.slice(0, 10));
}