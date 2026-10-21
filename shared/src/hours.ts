import { zonedParts } from './time';

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  opens: string;
  closes: string;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Whether a pharmacy is open at `now` in its own time zone.
 * Returns null when no hours were supplied (unknown — never guessed).
 * Hours whose closing time is earlier than the opening time run past midnight.
 */
export function isOpenAt(hours: OpeningHours[], tz: string, now: Date): boolean | null {
  if (hours.length === 0) return null;
  const p = zonedParts(now, tz);
  const minute = p.hour * 60 + p.minute;
  const yesterday = (p.weekday + 6) % 7;
  for (const h of hours) {
    const o = toMin(h.opens);
    const c = toMin(h.closes);
    if (c > o) {
      if (h.weekday === p.weekday && minute >= o && minute < c) return true;
    } else {
      if (h.weekday === p.weekday && minute >= o) return true;
      if (h.weekday === yesterday && minute < c) return true;
    }
  }
  return false;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
