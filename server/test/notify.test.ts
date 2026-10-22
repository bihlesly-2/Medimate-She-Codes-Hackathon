import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications, pushSubscriptions, users } from '../src/db/schema';
import type { PushMessage, PushSender, PushTarget } from '../src/providers/push';
import { runNudges } from '../src/services/nudges';
import { login, PHONES, setup } from './helpers';

const sent: { target: PushTarget; msg: PushMessage }[] = [];
const fakePush: PushSender = {
  enabled: true,
  async send(target, msg) {
    sent.push({ target, msg });
    return target.endpoint.includes('gone') ? 'gone' : 'sent';
  },
};

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup({ push: fakePush });
}, 60_000);
afterAll(async () => {
  await ctx.database.close();
});

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'BPubKeyForTestsOnly', auth: 'authsecret' } });

describe('notifications', () => {
  it('saves a push subscription and confirms with one welcome push', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const r = await ama.post('/api/me/push').send(sub('https://push.example/ama-1'));
    expect(r.status).toBe(200);
    expect(sent.at(-1)?.msg.title).toBe('Notifications are on');
    const again = await ama.post('/api/me/push').send(sub('https://push.example/ama-1'));
    expect(again.status).toBe(200);
    expect(sent.filter((s) => s.msg.title === 'Notifications are on')).toHaveLength(1);
    expect((await ama.post('/api/me/push').send({ endpoint: 'http://insecure' })).status).toBe(400);
  });

  it('pops up a generic medicine reminder with a Taken action', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const plans = await ama.get('/api/plans');
    const t = await ama.post(`/api/plans/${plans.body.items[0].id}/test-reminder`);
    const push = sent.find((s) => s.msg.occurrenceId === t.body.id);
    expect(push).toBeDefined();
    expect(push!.msg.title).toMatch(/Time for your medicine/);
    // The lock-screen text never names the medicine.
    expect(JSON.stringify(push!.msg)).not.toMatch(new RegExp(plans.body.items[0].medicineName, 'i'));
    const inbox = await ama.get('/api/me/notifications');
    expect(inbox.body.items.some((n: { url: string }) => n.url === `/app?o=${t.body.id}`)).toBe(true);
  });

  it('removes subscriptions the push service reports as gone', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    await ama.post('/api/me/push').send(sub('https://push.example/gone-device'));
    await ama.post('/api/me/push/test');
    const rows = await ctx.deps.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, 'https://push.example/gone-device'));
    expect(rows).toHaveLength(0);
  });

  it('marks the inbox read, and only for the signed-in person', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const ben = await login(ctx.app, PHONES.ben);
    expect((await ama.get('/api/me/notifications')).body.unread).toBeGreaterThan(0);
    await ben.post('/api/me/notifications/read');
    expect((await ama.get('/api/me/notifications')).body.unread).toBeGreaterThan(0);
    await ama.post('/api/me/notifications/read');
    expect((await ama.get('/api/me/notifications')).body.unread).toBe(0);
  });

  it('sends daily nudges once per window, never twice', async () => {
    // 10:00Z = 11:00 in Douala: the midday water window.
    ctx.clock.set('2026-10-22T10:00:00Z');
    await runNudges(ctx.deps);
    const [ama] = await ctx.deps.db.select().from(users).where(eq(users.phone, '+237600000001'));
    const first = await ctx.deps.db.select().from(notifications).where(eq(notifications.dedupeKey, `water-midday:${ama!.id}:2026-10-22`));
    expect(first).toHaveLength(1);
    await runNudges(ctx.deps);
    const second = await ctx.deps.db.select().from(notifications).where(eq(notifications.dedupeKey, `water-midday:${ama!.id}:2026-10-22`));
    expect(second).toHaveLength(1);
  });
});
