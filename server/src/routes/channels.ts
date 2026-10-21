import { desc, eq, inArray } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { isDemoNumber, maskPhone, normalizePhone, simSmsSchema, simUssdSchema, USSD_DEFAULT_TIMEOUT_MS } from '@medimate/shared';
import { smsLogs, smsSessions, ussdSessions } from '../db/schema';
import { safeEqual } from '../lib/crypto';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/http';
import { handleFapshiWebhook } from '../services/billing';
import { handleInboundSms } from '../services/sms';
import { processUssd } from '../services/ussd';
import { fullTick } from '../scheduler';
import type { Deps } from '../types';
import { validTwilioSignature } from '../providers/messaging';

function checkGatewaySecret(deps: Deps, req: Request) {
  const expected = deps.config.INBOUND_WEBHOOK_SECRET;
  if (!expected) {
    if (deps.config.isProduction && !deps.config.PUBLIC_DEMO) throw forbidden('Gateway webhook is not configured.');
    return;
  }
  const got = req.get('x-medimate-webhook-secret') ?? (typeof req.query.key === 'string' ? req.query.key : '');
  if (!got || !safeEqual(got, expected)) throw new AppError(401, 'BAD_WEBHOOK_SECRET', 'Invalid webhook secret.');
}

export function channelRoutes(deps: Deps) {
  const r = Router();

  // ---- live provider webhooks (Africa's Talking-style form posts)
  r.post('/sms/inbound', async (req, res) => {
    checkGatewaySecret(deps, req);
    const from = String(req.body?.from ?? '');
    const text = String(req.body?.text ?? '');
    if (!from) throw badRequest('Missing sender.');
    await handleInboundSms(deps, from, text, deps.messaging.name);
    res.json({ ok: true });
  });

  // Twilio inbound SMS webhook. Authenticated by X-Twilio-Signature (HMAC-SHA1 with the auth token).
  r.post('/sms/twilio', async (req, res) => {
    const token = deps.config.TWILIO_AUTH_TOKEN;
    if (!token) throw notFound('Route');
    const host = req.get('x-forwarded-host') ?? req.get('host');
    const proto = req.get('x-forwarded-proto') ?? req.protocol;
    const params = Object.fromEntries(Object.entries(req.body ?? {}).map(([k, v]) => [k, String(v)]));
    if (!validTwilioSignature(token, `${proto}://${host}${req.originalUrl}`, params, req.get('x-twilio-signature') ?? '')) {
      throw new AppError(401, 'BAD_SIGNATURE', 'Invalid Twilio signature.');
    }
    if (!params.From) throw badRequest('Missing sender.');
    await handleInboundSms(deps, params.From, params.Body ?? '', 'twilio');
    // Replies are sent through the REST API, so the TwiML response is empty.
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  r.post('/ussd/africastalking', async (req, res) => {
    checkGatewaySecret(deps, req);
    const sessionId = String(req.body?.sessionId ?? '').slice(0, 64);
    const phone = String(req.body?.phoneNumber ?? '');
    const text = String(req.body?.text ?? '');
    if (!sessionId || !phone) throw badRequest('Missing session or phone.');
    // Africa's Talking sends the whole input history joined by "*"; the state machine needs the latest entry.
    const input = text === '' ? '' : (text.split('*').at(-1) ?? '');
    const result = await processUssd(deps, sessionId, phone, input);
    res.type('text/plain').send(`${result.end ? 'END' : 'CON'} ${result.text}`);
  });

  // ---- payment webhook
  r.post('/billing/fapshi/webhook', async (req, res) => {
    res.json(await handleFapshiWebhook(deps, req.headers, req.body));
  });

  // ---- scheduled job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`)
  r.get('/cron/tick', async (req, res) => {
    const secret = deps.config.CRON_SECRET;
    if (!secret) throw notFound('Route');
    const got = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!got || !safeEqual(got, secret)) throw new AppError(401, 'UNAUTHORIZED', 'Invalid cron secret.');
    res.json(await fullTick(deps));
  });

  // ---- browser simulator (demo mode only; never delivers real messages)
  const sim = Router();
  sim.use((req, _res, next) => {
    if (!deps.config.DEMO_MODE) return next(notFound('Route'));
    next();
  });
  const simPhone = (raw: string) => {
    const phone = normalizePhone(raw);
    if (!phone) throw badRequest('Enter a valid phone number.');
    if (deps.config.PUBLIC_DEMO && !isDemoNumber(phone)) throw badRequest('The public demo simulator only accepts fictional numbers: +237 600 xxx xxx.');
    return phone;
  };
  sim.post('/sms', async (req, res) => {
    const body = parse(simSmsSchema, req.body);
    const phone = simPhone(body.phone);
    const r2 = await handleInboundSms(deps, phone, body.text, 'simulator');
    res.json({ replies: r2.replies, simulated: deps.messaging.name === 'simulator' });
  });
  sim.get('/sms/thread', async (req, res) => {
    const phone = simPhone(String(req.query.phone ?? ''));
    const rows = await deps.db.select().from(smsLogs).where(eq(smsLogs.phone, phone)).orderBy(desc(smsLogs.createdAt)).limit(60);
    const [session] = await deps.db.select().from(smsSessions).where(eq(smsSessions.phone, phone));
    res.json({
      phone: maskPhone(phone),
      provider: deps.messaging.name,
      live: deps.messaging.live,
      session: session ? { language: session.language, pending: Object.keys(session.pending ?? {}).filter((k) => (session.pending as Record<string, unknown>)[k] !== undefined) } : null,
      messages: rows.reverse().map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        command: m.command,
        segments: m.segments,
        encoding: m.encoding,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });
  sim.post('/ussd', async (req, res) => {
    const body = parse(simUssdSchema, req.body);
    const phone = simPhone(body.phone);
    if (body.expire) {
      await deps.db
        .update(ussdSessions)
        .set({ lastActiveAt: new Date(deps.clock.now().getTime() - USSD_DEFAULT_TIMEOUT_MS - 1000) })
        .where(eq(ussdSessions.sessionId, body.sessionId));
      const [row] = await deps.db.select().from(ussdSessions).where(eq(ussdSessions.sessionId, body.sessionId));
      if (row) {
        const state = { ...(row.state as Record<string, unknown>), lastActiveAt: row.lastActiveAt.getTime() };
        await deps.db.update(ussdSessions).set({ state }).where(eq(ussdSessions.sessionId, body.sessionId));
      }
    }
    res.json(await processUssd(deps, body.sessionId, phone, body.input));
  });
  sim.post('/reset', async (req, res) => {
    const phone = simPhone(String(req.body?.phone ?? ''));
    await deps.db.delete(smsSessions).where(eq(smsSessions.phone, phone));
    await deps.db.delete(ussdSessions).where(eq(ussdSessions.phone, phone));
    await deps.db.delete(smsLogs).where(inArray(smsLogs.phone, [phone]));
    res.json({ ok: true });
  });
  sim.post('/tick', async (_req, res) => {
    res.json(await fullTick(deps));
  });
  r.use('/sim', sim);
  return r;
}
