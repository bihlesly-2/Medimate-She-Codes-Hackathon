import { and, count, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { localDate, localTime } from '@medimate/shared';
import { reminderOccurrences, stepLogs, users, waterLogs } from '../db/schema';
import type { Deps } from '../types';
import { notifyUser } from './notify';
import { hasConsent, userHasFeature } from './users';

/**
 * Friendly daily nudges, sent through the same inbox + push path as reminders.
 * Each one has a per-day dedupe key, so running the engine every few minutes sends it once.
 * Copy is general and encouraging; it never gives clinical advice.
 */
export async function runNudges(deps: Deps): Promise<number> {
  const now = deps.clock.now();
  const people = await deps.db
    .select({ id: users.id, name: users.displayName, tz: users.timezone, water: users.waterTargetMl, steps: users.stepGoal })
    .from(users)
    .where(isNotNull(users.onboardedAt))
    .limit(2000);
  let sent = 0;
  for (const p of people) {
    const hour = Number(localTime(now, p.tz).slice(0, 2));
    const today = localDate(now, p.tz);
    const window = hour >= 7 && hour < 9 ? 'morning' : hour >= 11 && hour < 13 ? 'midday' : hour >= 17 && hour < 19 ? 'evening' : null;
    if (!window) continue;
    if (!(await hasConsent(deps.db, p.id, 'health_data'))) continue;
    const first = p.name?.split(' ')[0] ?? 'there';

    if (window === 'morning' && (await userHasFeature(deps, p.id, 'reminders'))) {
      const [due] = await deps.db
        .select({ n: count() })
        .from(reminderOccurrences)
        .where(and(eq(reminderOccurrences.userId, p.id), eq(reminderOccurrences.kind, 'medication'), gte(reminderOccurrences.scheduledFor, now)));
      const meds = Number(due?.n ?? 0);
      const r = await notifyUser(deps, p.id, {
        kind: 'nudge',
        title: `Good morning, ${first}!`,
        body: meds ? `${meds} medicine reminder${meds === 1 ? '' : 's'} today, plus your water and steps goals.` : 'Your water and steps goals are ready for today.',
        url: '/app',
        dedupeKey: `morning:${p.id}:${today}`,
      });
      if (r.created) sent++;
    }

    if (window !== 'morning' && (await userHasFeature(deps, p.id, 'water'))) {
      const [w] = await deps.db
        .select({ ml: sql<number>`coalesce(sum(${waterLogs.amountMl}), 0)::int` })
        .from(waterLogs)
        .where(and(eq(waterLogs.userId, p.id), eq(waterLogs.localDate, today)));
      const ml = Number(w?.ml ?? 0);
      const share = window === 'midday' ? 0.4 : 0.75;
      if (ml < p.water * share) {
        const r = await notifyUser(deps, p.id, {
          kind: 'nudge',
          title: 'Time for a glass of water',
          body: `${(ml / 1000).toFixed(1)} of ${(p.water / 1000).toFixed(1)} L so far today. One glass is 250 ml.`,
          url: '/app',
          dedupeKey: `water-${window}:${p.id}:${today}`,
        });
        if (r.created) sent++;
      }
    }

    if (window === 'evening' && (await userHasFeature(deps, p.id, 'steps'))) {
      const [s] = await deps.db
        .select({ n: sql<number>`coalesce(sum(${stepLogs.steps}), 0)::int` })
        .from(stepLogs)
        .where(and(eq(stepLogs.userId, p.id), eq(stepLogs.localDate, today)));
      const steps = Number(s?.n ?? 0);
      if (steps < p.steps) {
        const r = await notifyUser(deps, p.id, {
          kind: 'nudge',
          title: 'A short walk to finish your day?',
          body: `${(p.steps - steps).toLocaleString('en')} steps to your goal. Ten minutes of walking is about 1,000 steps.`,
          url: '/app',
          dedupeKey: `steps:${p.id}:${today}`,
        });
        if (r.created) sent++;
      }
    }
  }
  return sent;
}
