import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { notifications, pushSubscriptions } from '../db/schema';
import { badRequest } from '../lib/errors';
import type { Deps } from '../types';

export type NotificationKind = 'reminder' | 'followup' | 'refill' | 'checkup' | 'caretaker' | 'nudge' | 'welcome' | 'assistant' | 'system';

/**
 * Store a notification in the person's inbox and push it to every device they enabled.
 * With a `dedupeKey` it is created at most once (welcomes, daily nudges), so repeated engine
 * ticks never spam. Lock-screen text stays generic: no medicine or condition names.
 */
export async function notifyUser(
  deps: Pick<Deps, 'db' | 'clock' | 'push' | 'logger'>,
  userId: string,
  n: { kind: NotificationKind; title: string; body: string; url?: string; dedupeKey?: string; occurrenceId?: string },
): Promise<{ created: boolean; pushed: number }> {
  const [row] = await deps.db
    .insert(notifications)
    .values({ userId, kind: n.kind, title: n.title, body: n.body, url: n.url ?? null, dedupeKey: n.dedupeKey ?? null, occurrenceId: n.occurrenceId ?? null, createdAt: deps.clock.now() })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  if (!row) return { created: false, pushed: 0 };
  if (!deps.push.enabled) return { created: true, pushed: 0 };

  const subs = await deps.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let pushed = 0;
  const gone: string[] = [];
  for (const s of subs) {
    const r = await deps.push.send(s, { title: n.title, body: n.body, url: n.url ?? '/app', tag: n.dedupeKey ?? row.id, occurrenceId: n.occurrenceId });
    if (r === 'sent') pushed++;
    if (r === 'gone') gone.push(s.id);
  }
  if (gone.length) await deps.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (pushed) {
    await deps.db.update(notifications).set({ pushed }).where(eq(notifications.id, row.id));
    await deps.db.update(pushSubscriptions).set({ lastSentAt: deps.clock.now() }).where(eq(pushSubscriptions.userId, userId));
  }
  return { created: true, pushed };
}

export async function savePushSubscription(deps: Pick<Deps, 'db' | 'clock' | 'push' | 'logger'>, userId: string, body: unknown, userAgent?: string) {
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof b?.endpoint === 'string' ? b.endpoint : '';
  const p256dh = typeof b?.keys?.p256dh === 'string' ? b.keys.p256dh : '';
  const auth = typeof b?.keys?.auth === 'string' ? b.keys.auth : '';
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) throw badRequest('Invalid push subscription.');
  const existing = await deps.db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await deps.db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, userAgent: userAgent?.slice(0, 200) ?? null, createdAt: deps.clock.now() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh, auth } });
  if (!existing.length) {
    await notifyUser(deps, userId, { kind: 'welcome', title: 'Notifications are on', body: 'MEDIMATE will remind you at each time on your prescription.', url: '/app', dedupeKey: `push-on:${userId}` });
  }
  return { ok: true };
}

export async function removePushSubscription(deps: Pick<Deps, 'db'>, userId: string, endpoint: string) {
  await deps.db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  return { ok: true };
}

export async function listNotifications(deps: Pick<Deps, 'db'>, userId: string) {
  const rows = await deps.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
  return {
    unread: rows.filter((r) => !r.readAt).length,
    items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url, read: Boolean(r.readAt), createdAt: r.createdAt.toISOString() })),
  };
}

export async function markNotificationsRead(deps: Pick<Deps, 'db' | 'clock'>, userId: string) {
  await deps.db.update(notifications).set({ readAt: deps.clock.now() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true };
}
