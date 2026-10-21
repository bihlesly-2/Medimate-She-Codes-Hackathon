/**
 * Time-zone helpers built on Intl (no external library).
 *
 * Rules (documented in docs/REMINDERS.md):
 * - All instants are stored in UTC; local wall-clock times are interpreted in the user's IANA zone.
 * - A local time that does not exist (DST spring-forward gap) moves forward by the gap length.
 * - A local time that occurs twice (DST fall-back) resolves to the later (standard-time) instant.
 */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(instant: Date | number, tz: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(instant))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? 'Sun'),
  };
}

/** Offset of `tz` from UTC at the given instant, in milliseconds (east positive). */
export function tzOffsetMs(instantMs: number, tz: string): number {
  const p = zonedParts(instantMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = instantMs - (((instantMs % 1000) + 1000) % 1000);
  return asUtc - truncated;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isLocalDate(s: string): boolean {
  return DATE_RE.test(s);
}
export function isLocalTime(s: string): boolean {
  return TIME_RE.test(s);
}

/** Convert a local wall-clock date + time in `tz` to a UTC Date. */
export function zonedDateTimeToUtc(date: string, time: string, tz: string): Date {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) throw new Error(`Invalid local date/time: ${date} ${time}`);
  const naive = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  const offset1 = tzOffsetMs(naive, tz);
  let result = naive - offset1;
  const offset2 = tzOffsetMs(result, tz);
  if (offset2 !== offset1) result = naive - offset2;
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function localDate(instant: Date | number, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local wall-clock time (HH:MM) of an instant in `tz`. */
export function localTime(instant: Date | number, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Inclusive list of local dates between two YYYY-MM-DD strings. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > 3660) break;
  }
  return out;
}

/** UTC bounds [start, end) of a local calendar day. */
export function localDayBounds(date: string, tz: string): { start: Date; end: Date } {
  return { start: zonedDateTimeToUtc(date, '00:00', tz), end: zonedDateTimeToUtc(addDays(date, 1), '00:00', tz) };
}
