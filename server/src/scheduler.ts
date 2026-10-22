import { and, isNotNull, lte } from 'drizzle-orm';
import { smsLogs } from './db/schema';
import type { Deps } from './types';
import { reconcilePendingPayments } from './services/billing';
import { runNudges } from './services/nudges';
import { runReminderTick, type TickReport } from './services/reminders';

/**
 * Reminder engine driver.
 * - Long-running server: an in-process interval (SCHEDULER_INTERVAL_SECONDS).
 * - Serverless (Vercel): no interval; the engine runs (a) throttled on reminder requests via
 *   `maybeTick`, (b) from the cron endpoint, and (c) on demand from the demo simulator.
 * All paths call the same idempotent tick, so overlapping runs are safe.
 */
let lastTick = 0;
let running: Promise<unknown> | null = null;

export async function fullTick(deps: Deps): Promise<TickReport & { paymentsChecked: number; smsBodiesPurged: number; nudges: number }> {
  const report = await runReminderTick(deps);
  const nudges = await runNudges(deps).catch((e) => {
    deps.logger.error('nudges_failed', { error: e instanceof Error ? e.message : String(e) });
    return 0;
  });
  const paymentsChecked = await reconcilePendingPayments(deps);
  const purged = await deps.db
    .update(smsLogs)
    .set({ body: null })
    .where(and(isNotNull(smsLogs.body), lte(smsLogs.bodyExpiresAt, deps.clock.now())))
    .returning({ id: smsLogs.id });
  lastTick = Date.now();
  return { ...report, paymentsChecked, smsBodiesPurged: purged.length, nudges };
}

export async function maybeTick(deps: Deps, minIntervalMs = 30_000) {
  if (Date.now() - lastTick < minIntervalMs) return;
  if (running) return running;
  lastTick = Date.now();
  running = fullTick(deps)
    .catch((e) => deps.logger.error('scheduler.tick_failed', { error: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      running = null;
    });
  return running;
}

export function startScheduler(deps: Deps): () => void {
  const seconds = deps.config.SCHEDULER_INTERVAL_SECONDS;
  if (!seconds) return () => {};
  const handle = setInterval(() => void maybeTick(deps, 0), seconds * 1000);
  return () => clearInterval(handle);
}
