import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { reminderOccurrences, users } from '../src/db/schema';
import { loadConfig } from '../src/config';
import { failingProvider } from '../src/providers/messaging';
import { fapshiProvider } from '../src/providers/payments';
import { backoffMs, runReminderTick } from '../src/services/reminders';
import { PHONES, login, setup } from './helpers';

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

describe('SMS delivery retries with bounded backoff', () => {
  it('retries a failed reminder SMS and succeeds without duplicating the reminder', async () => {
    const provider = failingProvider(2);
    const ctx = await setup({ messaging: provider });
    close = () => ctx.database.close();
    const ama = await login(ctx.app, PHONES.ama);
    // Demo numbers are always simulated; use a real-format number so the (failing) provider is called.
    await ctx.deps.db.update(users).set({ phone: '+237670000001' }).where(eq(users.phone, '+237600000001'));
    const plans = await ama.get('/api/plans');
    const t = await ama.post(`/api/plans/${plans.body.items.find((p: { smsReminders: boolean }) => p.smsReminders).id}/test-reminder`);
    expect(t.body.deliveryStatus).toBe('retrying');
    ctx.clock.advance(backoffMs(1) + 1000);
    await runReminderTick(ctx.deps);
    let [o] = await ctx.deps.db.select().from(reminderOccurrences).where(eq(reminderOccurrences.id, t.body.id));
    expect(o!.deliveryStatus).toBe('retrying');
    expect(o!.attempts).toBe(2);
    ctx.clock.advance(backoffMs(2) + 1000);
    await runReminderTick(ctx.deps);
    [o] = await ctx.deps.db.select().from(reminderOccurrences).where(eq(reminderOccurrences.id, t.body.id));
    expect(o!.deliveryStatus).toBe('simulated');
    expect(o!.attempts).toBe(3);
  }, 60_000);

  it('caps backoff at 15 minutes', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(10)).toBe(15 * 60_000);
  });
});

describe('Fapshi payments', () => {
  function fakeFapshi() {
    const state = { status: 'PENDING', calls: [] as string[] };
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      state.calls.push(`${init?.method ?? 'GET'} ${u.replace('https://sandbox.fapshi.com', '')}`);
      const headers = init?.headers as Record<string, string>;
      if (headers.apiuser !== 'test-user' || headers.apikey !== 'test-key') return new Response(JSON.stringify({ message: 'Invalid API credentials' }), { status: 403 });
      if (u.endsWith('/initiate-pay')) {
        const body = JSON.parse(String(init?.body));
        if (body.amount < 100) return new Response(JSON.stringify({ message: 'amount too small' }), { status: 400 });
        return new Response(JSON.stringify({ message: 'Request successful', link: 'https://checkout.fapshi.com/payment/abc', transId: 'TRX12345', dateInitiated: new Date().toISOString() }));
      }
      if (u.includes('/payment-status/TRX12345')) return new Response(JSON.stringify({ transId: 'TRX12345', status: state.status, amount: 1000 }));
      return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
    }) as typeof fetch;
    return { state, fetchImpl };
  }

  it('creates a hosted checkout, verifies the webhook secret, re-queries status and fulfils once', async () => {
    const env = { PAYMENTS_PROVIDER: 'fapshi', FAPSHI_API_USER: 'test-user', FAPSHI_API_KEY: 'test-key', FAPSHI_WEBHOOK_SECRET: 'wh-secret' };
    const { state, fetchImpl } = fakeFapshi();
    const config = loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'true', APP_SECRET: 'x'.repeat(40), ...env });
    const ctx = await setup({ env, payments: fapshiProvider(config, fetchImpl) });
    close = () => ctx.database.close();
    const ben = await login(ctx.app, PHONES.ben);
    const p = await ben.post('/api/me/checkout').send({ email: 'ben@example.org' });
    expect(p.status).toBe(201);
    expect(p.body.checkoutUrl).toBe('https://checkout.fapshi.com/payment/abc');
    expect(state.calls).toContain('POST /initiate-pay');

    // Demo confirmation is not available when a real provider is configured.
    expect((await ben.post(`/api/me/payments/${p.body.id}/demo-confirm`)).status).toBe(403);

    // Wrong secret is rejected; body claims are never trusted.
    const bad = await request(ctx.app).post('/api/billing/fapshi/webhook').set('x-wh-secret', 'nope').send({ transId: 'TRX12345', status: 'SUCCESSFUL' });
    expect(bad.status).toBe(401);
    // Correct secret but provider still says PENDING → nothing fulfilled.
    await request(ctx.app).post('/api/billing/fapshi/webhook').set('x-wh-secret', 'wh-secret').send({ transId: 'TRX12345', status: 'SUCCESSFUL' });
    expect((await ben.get('/api/me/subscription')).body.tier).toBe('free');

    state.status = 'SUCCESSFUL';
    await request(ctx.app).post('/api/billing/fapshi/webhook').set('x-wh-secret', 'wh-secret').send({ transId: 'TRX12345' });
    await request(ctx.app).post('/api/billing/fapshi/webhook').set('x-wh-secret', 'wh-secret').send({ transId: 'TRX12345' });
    const sub = await ben.get('/api/me/subscription');
    expect(sub.body.tier).toBe('premium');
    expect(sub.body.daysLeft).toBe(30); // fulfilled once, not twice
    expect(sub.body.payments[0].status).toBe('successful');
  }, 60_000);
});
