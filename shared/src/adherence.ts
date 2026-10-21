import type { OccurrenceStatus } from './constants';

export interface AdherenceSummary {
  taken: number;
  skipped: number;
  missed: number;
  /** Scheduled or sent and not answered yet — status unknown, not counted against anyone. */
  pending: number;
  total: number;
  /** taken ÷ (taken + skipped + missed), or null when nothing has resolved yet. */
  rate: number | null;
}

/**
 * Transparent adherence calculation. Skipped, missed and unknown are kept separate;
 * pending reminders are excluded from the rate.
 */
export function adherenceSummary(statuses: OccurrenceStatus[]): AdherenceSummary {
  const s: AdherenceSummary = { taken: 0, skipped: 0, missed: 0, pending: 0, total: statuses.length, rate: null };
  for (const st of statuses) {
    if (st === 'taken') s.taken++;
    else if (st === 'skipped') s.skipped++;
    else if (st === 'missed') s.missed++;
    else s.pending++;
  }
  const resolved = s.taken + s.skipped + s.missed;
  s.rate = resolved ? Math.round((s.taken / resolved) * 1000) / 1000 : null;
  return s;
}

/**
 * Consecutive-day streak counted back from the most recent day.
 * `met === null` means "not applicable / still in progress" and neither breaks nor extends the streak.
 * Days must be sorted ascending by date.
 */
export function streakLength(days: { date: string; met: boolean | null }[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]!;
    if (d.met === null) continue;
    if (!d.met) break;
    streak++;
  }
  return streak;
}
