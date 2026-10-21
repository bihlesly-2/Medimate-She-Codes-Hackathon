import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { createRuntime } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { seedDemo } from '../src/db/seed';
import { FakeClock } from '../src/lib/clock';
import { createLogger } from '../src/lib/logger';
import type { MessagingProvider } from '../src/providers/messaging';
import type { PaymentProvider } from '../src/providers/payments';

export const T0 = '2026-10-21T10:00:00Z';

export async function setup(opts: { env?: Record<string, string>; messaging?: MessagingProvider; payments?: PaymentProvider } = {}) {
  const clock = new FakeClock(Date.parse(T0));
  const config = loadConfig({
    NODE_ENV: 'test',
    DEMO_MODE: 'true',
    APP_SECRET: 'test-secret-test-secret-test-secret-123',
    SCHEDULER_INTERVAL_SECONDS: '0',
    ...opts.env,
  });
  const { deps, database } = await createRuntime({
    config,
    pgliteDir: 'memory',
    clock,
    logger: createLogger({ silent: true }),
    messaging: opts.messaging,
    payments: opts.payments,
  });
  await database.migrate();
  await seedDemo(deps, { reset: false });
  const app = createApp(deps, { rateLimits: false });
  return { deps, database, clock, app };
}

// One signed-in agent per app + phone: the OTP rate limit (3 codes / 15 min) applies in tests too.
const agents = new WeakMap<Express, Map<string, ReturnType<typeof request.agent>>>();

export async function login(app: Express, phone: string) {
  const cache = agents.get(app) ?? new Map();
  agents.set(app, cache);
  const cached = cache.get(phone);
  if (cached) return cached;
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/otp/request').send({ phone });
  if (!r.body.devCode) throw new Error(`no dev code: ${JSON.stringify(r.body)}`);
  const v = await agent.post('/api/auth/otp/verify').send({ phone, code: r.body.devCode });
  if (v.status !== 200) throw new Error(`verify failed: ${JSON.stringify(v.body)}`);
  cache.set(phone, agent);
  return agent;
}

export const PHONES = {
  ama: '600000001',
  ben: '600000002',
  clara: '600000003',
  dan: '600000004',
  eve: '600000005',
  femi: '600000006',
  gina: '600000007',
};
