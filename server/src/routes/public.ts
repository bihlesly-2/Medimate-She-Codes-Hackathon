import { Router, type Response } from 'express';
import { otpRequestSchema, otpVerifySchema, pharmacySearchSchema, reportCreateSchema } from '@medimate/shared';
import { z } from 'zod';
import { publicConfig } from '../config';
import { param, parse, requireAuth } from '../lib/http';
import { authRequired } from '../middleware';
import { createReport, listPublishedTips } from '../services/admin';
import { requestOtp, SESSION_COOKIE, SESSION_TTL_MS, signInWithFirebase, verifyOtp, destroySession } from '../services/auth';
import { getPublicMedicine, listMedicines } from '../services/medicines';
import { getPublicPharmacy, listPublicPharmacies, searchOffers } from '../services/pharmacy';
import { getSettings } from '../services/settings';
import { getConsentMap, getRoles, getUser, publicUser } from '../services/users';
import type { Deps } from '../types';
import { sql } from 'drizzle-orm';

export function publicRoutes(deps: Deps) {
  const r = Router();
  const setSessionCookie = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: deps.config.isProduction, path: '/', maxAge: SESSION_TTL_MS });

  r.get('/health', async (_req, res) => {
    let database = 'ok';
    try {
      await deps.db.execute(sql`select 1`);
    } catch {
      database = 'unavailable';
    }
    res.status(database === 'ok' ? 200 : 503).json({ status: database === 'ok' ? 'ok' : 'degraded', database, time: deps.clock.now().toISOString() });
  });

  r.get('/config', async (_req, res) => {
    const s = await getSettings(deps.db);
    res.json({ ...publicConfig(deps.config), healthDisclaimer: s.healthDisclaimer, medicineSafetyNotice: s.medicineSafetyNotice, trialDays: s.trialDays });
  });

  // ---- auth
  r.post('/auth/otp/request', async (req, res) => {
    const body = parse(otpRequestSchema, req.body);
    res.json(await requestOtp(deps, body.phone));
  });

  r.post('/auth/otp/verify', async (req, res) => {
    const body = parse(otpVerifySchema, req.body);
    const { token, created } = await verifyOtp(deps, body.phone, body.code);
    setSessionCookie(res, token);
    res.json({ ok: true, created });
  });

  // Firebase Authentication (email/password or Google). The browser sends a short-lived ID token.
  r.post('/auth/firebase', async (req, res) => {
    const body = parse(z.object({ idToken: z.string().min(20).max(4096) }), req.body);
    const { token, created } = await signInWithFirebase(deps, body.idToken);
    setSessionCookie(res, token);
    res.json({ ok: true, created });
  });

  r.post('/auth/logout', async (req, res) => {
    if (req.auth) await destroySession(deps, req.auth.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/auth/me', async (req, res) => {
    if (!req.auth) return res.json({ user: null });
    const user = await getUser(deps.db, req.auth.userId);
    if (!user) return res.json({ user: null });
    res.json({ user: { ...publicUser(user), roles: await getRoles(deps.db, user.id), consents: await getConsentMap(deps.db, user.id) } });
  });

  // ---- pharmacy discovery (free tier, no sign-in needed)
  r.get('/pharmacies/search', async (req, res) => {
    res.json(await searchOffers(deps, parse(pharmacySearchSchema, req.query)));
  });
  r.get('/pharmacies', async (req, res) => {
    res.json({ items: await listPublicPharmacies(deps, typeof req.query.area === 'string' ? req.query.area.slice(0, 60) : undefined) });
  });
  r.get('/pharmacies/:id', async (req, res) => {
    res.json(await getPublicPharmacy(deps, param(req, 'id')));
  });
  r.get('/medicines', async (req, res) => {
    res.json({ items: await listMedicines(deps.db, typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : undefined) });
  });
  r.get('/medicines/:id', async (req, res) => {
    res.json(await getPublicMedicine(deps.db, param(req, 'id')));
  });
  r.get('/tips', async (req, res) => {
    const lang = typeof req.query.lang === 'string' ? req.query.lang.slice(0, 3) : 'en';
    res.json({ items: await listPublishedTips(deps.db, lang) });
  });

  r.post('/reports', authRequired, async (req, res) => {
    const auth = requireAuth(req);
    res.status(201).json(await createReport(deps, auth.userId, parse(reportCreateSchema, req.body), req.requestId));
  });

  return r;
}
