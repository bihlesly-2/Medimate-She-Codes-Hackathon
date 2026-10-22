import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  careInviteSchema,
  carePermissionsSchema,
  checkoutSchema,
  checkupCreateSchema,
  checkupUpdateSchema,
  confirmReminderSchema,
  consentUpdateSchema,
  correctReminderSchema,
  deleteAccountSchema,
  inquiryCreateSchema,
  messageCreateSchema,
  otpRequestSchema,
  otpVerifySchema,
  planCreateSchema,
  planUpdateSchema,
  profileUpdateSchema,
  reactionCreateSchema,
  stepsCreateSchema,
  vitalCreateSchema,
  VITAL_TYPES,
  waterCreateSchema,
} from '@medimate/shared';
import { users } from '../db/schema';
import { forbidden } from '../lib/errors';
import { param, parse, requireAuth } from '../lib/http';
import { authRequired, consent, feature } from '../middleware';
import { deleteAccount, exportAccount, historyPdf, type ExportSection } from '../services/account';
import { linkFirebase, linkPhone, requestOtp } from '../services/auth';
import { assistantMessageSchema, assistantReply } from '../services/assistant';
import { listNotifications, markNotificationsRead, notifyUser, removePushSubscription, savePushSubscription } from '../services/notify';
import { confirmDemoPayment, refreshPayment, startCheckout, subscriptionStatus } from '../services/billing';
import { inviteCaretaker, listLinksForPatient, revokeLink, updatePermissions } from '../services/care';
import { closeInquiry, createInquiry, getThread, listPatientInquiries, postMessage } from '../services/inquiries';
import {
  adherence,
  confirmOccurrence,
  correctOccurrence,
  createPlan,
  getPlan,
  listOccurrences,
  listPlans,
  sendTestReminder,
  stopPlan,
  updatePlan,
} from '../services/reminders';
import {
  activitySummary,
  addReaction,
  addSteps,
  addVital,
  addWater,
  createCheckup,
  deleteReaction,
  deleteVital,
  deleteWater,
  listCheckups,
  listReactions,
  listVitals,
  progress,
  timeline,
  updateCheckup,
  updateReactionFlag,
  vitalsOverview,
  type TimelineType,
} from '../services/tracking';
import { getConsentMap, getUser, publicUser, setConsent } from '../services/users';
import type { Deps } from '../types';
import { maybeTick } from '../scheduler';

export function patientRoutes(deps: Deps) {
  const r = Router();
  r.use(authRequired);
  const health = consent(deps, 'health_data');

  // ---- profile, consent, account
  r.get('/me/profile', async (req, res) => {
    const u = await getUser(deps.db, requireAuth(req).userId);
    res.json(publicUser(u!));
  });
  r.patch('/me/profile', async (req, res) => {
    const auth = requireAuth(req);
    const body = parse(profileUpdateSchema, req.body);
    const { completeOnboarding, ...fields } = body;
    await deps.db
      .update(users)
      .set({ ...fields, ...(completeOnboarding ? { onboardedAt: deps.clock.now() } : {}), updatedAt: deps.clock.now() })
      .where(eq(users.id, auth.userId));
    const u = (await getUser(deps.db, auth.userId))!;
    if (completeOnboarding) {
      await notifyUser(deps, auth.userId, {
        kind: 'welcome',
        title: `Welcome to MEDIMATE, ${u.displayName?.split(' ')[0] ?? 'friend'}!`,
        body: 'Add a medicine from your prescription and we will remind you on time. Your water and steps goals are set.',
        url: '/app/medicines/new',
        dedupeKey: `welcome:${auth.userId}`,
      });
    }
    res.json(publicUser(u));
  });
  r.get('/me/consents', async (req, res) => {
    res.json(await getConsentMap(deps.db, requireAuth(req).userId));
  });
  r.post('/me/consents', async (req, res) => {
    const auth = requireAuth(req);
    const body = parse(consentUpdateSchema, req.body);
    await setConsent(deps, auth.userId, body.purpose, body.granted, 'web', undefined, req.requestId);
    res.json(await getConsentMap(deps.db, auth.userId));
  });
  // ---- sign-in methods: link email/Google or a verified phone to this account
  r.post('/me/link/email', async (req, res) => {
    const body = parse(z.object({ idToken: z.string().min(20).max(4096) }), req.body);
    const u = await linkFirebase(deps, requireAuth(req).userId, body.idToken, req.requestId);
    res.json(publicUser(u!));
  });
  r.post('/me/link/phone/request', async (req, res) => {
    const body = parse(otpRequestSchema, req.body);
    res.json(await requestOtp(deps, body.phone));
  });
  r.post('/me/link/phone/verify', async (req, res) => {
    const body = parse(otpVerifySchema, req.body);
    const u = await linkPhone(deps, requireAuth(req).userId, body.phone, body.code, req.requestId);
    res.json(publicUser(u!));
  });

  // ---- notifications: push subscriptions and the in-app inbox
  r.post('/me/push', async (req, res) => {
    res.json(await savePushSubscription(deps, requireAuth(req).userId, req.body, req.get('user-agent')));
  });
  r.post('/me/push/remove', async (req, res) => {
    const body = parse(z.object({ endpoint: z.string().url().max(1000) }), req.body);
    res.json(await removePushSubscription(deps, requireAuth(req).userId, body.endpoint));
  });
  r.post('/me/push/test', async (req, res) => {
    const auth = requireAuth(req);
    res.json(await notifyUser(deps, auth.userId, { kind: 'system', title: 'Test from MEDIMATE', body: 'Notifications work on this device.', url: '/app' }));
  });
  r.post('/assistant', async (req, res) => {
    const body = parse(assistantMessageSchema, req.body);
    res.json(await assistantReply(deps, requireAuth(req).userId, body.messages));
  });
  r.get('/me/notifications', async (req, res) => {
    res.json(await listNotifications(deps, requireAuth(req).userId));
  });
  r.post('/me/notifications/read', async (req, res) => {
    res.json(await markNotificationsRead(deps, requireAuth(req).userId));
  });

  r.get('/me/export', async (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="medimate-my-data.json"');
    res.json(await exportAccount(deps, requireAuth(req).userId));
  });
  r.delete('/me', async (req, res) => {
    parse(deleteAccountSchema, req.body);
    await deleteAccount(deps, requireAuth(req).userId, req.requestId);
    res.clearCookie('mm_session', { path: '/' });
    res.json({ ok: true });
  });

  // ---- subscription & payments
  r.get('/me/subscription', async (req, res) => {
    res.json(await subscriptionStatus(deps, requireAuth(req).userId));
  });
  r.post('/me/checkout', async (req, res) => {
    const auth = requireAuth(req);
    const body = parse(checkoutSchema, req.body ?? {});
    const host = req.get('x-forwarded-host') ?? req.get('host');
    const proto = req.get('x-forwarded-proto') ?? req.protocol;
    const origin = deps.config.allowedOrigins.find((o) => o.endsWith(host ?? '')) ?? `${proto}://${host}`;
    res.status(201).json(await startCheckout(deps, auth.userId, origin, body.email, req.requestId));
  });
  r.get('/me/payments/:id', async (req, res) => {
    res.json(await refreshPayment(deps, requireAuth(req).userId, param(req, 'id')));
  });
  r.post('/me/payments/:id/demo-confirm', async (req, res) => {
    res.json(await confirmDemoPayment(deps, requireAuth(req).userId, param(req, 'id')));
  });

  // ---- medicines & reminders (premium + health-data consent)
  const reminders = feature(deps, 'reminders');
  r.get('/plans', reminders, health, async (req, res) => {
    res.json({ items: await listPlans(deps.db, requireAuth(req).userId) });
  });
  r.post('/plans', reminders, health, async (req, res) => {
    res.status(201).json(await createPlan(deps, requireAuth(req).userId, parse(planCreateSchema, req.body), req.requestId));
  });
  r.get('/plans/:id', reminders, health, async (req, res) => {
    res.json(await getPlan(deps.db, requireAuth(req).userId, param(req, 'id')));
  });
  r.patch('/plans/:id', reminders, health, async (req, res) => {
    res.json(await updatePlan(deps, requireAuth(req).userId, param(req, 'id'), parse(planUpdateSchema, req.body), req.requestId));
  });
  r.delete('/plans/:id', reminders, health, async (req, res) => {
    res.json(await stopPlan(deps, requireAuth(req).userId, param(req, 'id'), req.requestId));
  });
  r.post('/plans/:id/test-reminder', reminders, health, async (req, res) => {
    if (!deps.config.DEMO_MODE) throw forbidden('Test reminders are only available in demo mode.');
    res.status(201).json(await sendTestReminder(deps, requireAuth(req).userId, param(req, 'id')));
  });
  r.get('/reminders', reminders, health, async (req, res) => {
    await maybeTick(deps);
    const range = z.enum(['today', 'upcoming', 'history']).catch('today').parse(req.query.range);
    res.json({ items: await listOccurrences(deps, requireAuth(req).userId, range) });
  });
  r.post('/reminders/:id/confirm', reminders, health, async (req, res) => {
    const body = parse(confirmReminderSchema, req.body);
    res.json(await confirmOccurrence(deps, requireAuth(req).userId, param(req, 'id'), body.action, 'web'));
  });
  r.post('/reminders/:id/correct', reminders, health, async (req, res) => {
    const body = parse(correctReminderSchema, req.body);
    res.json(await correctOccurrence(deps, requireAuth(req).userId, param(req, 'id'), body.status, body.reason, req.requestId));
  });
  r.get('/adherence', reminders, health, async (req, res) => {
    const auth = requireAuth(req);
    const u = await getUser(deps.db, auth.userId);
    const days = req.query.period === 'month' ? 30 : 7;
    res.json(await adherence(deps, auth.userId, days, u!.timezone));
  });
  r.get('/progress', feature(deps, 'streaks'), health, async (req, res) => {
    res.json(await progress(deps, requireAuth(req).userId));
  });

  // ---- checkups
  r.get('/checkups', reminders, health, async (req, res) => {
    res.json({ items: await listCheckups(deps.db, requireAuth(req).userId) });
  });
  r.post('/checkups', reminders, health, async (req, res) => {
    res.status(201).json(await createCheckup(deps, requireAuth(req).userId, parse(checkupCreateSchema, req.body), req.requestId));
  });
  r.patch('/checkups/:id', reminders, health, async (req, res) => {
    res.json(await updateCheckup(deps, requireAuth(req).userId, param(req, 'id'), parse(checkupUpdateSchema, req.body)));
  });

  // ---- vitals
  const vitals = feature(deps, 'vitals');
  r.get('/vitals', vitals, health, async (req, res) => {
    const type = z.enum(VITAL_TYPES).optional().catch(undefined).parse(req.query.type);
    res.json({ items: await listVitals(deps.db, requireAuth(req).userId, type) });
  });
  r.get('/vitals/overview', vitals, health, async (req, res) => {
    res.json(await vitalsOverview(deps, requireAuth(req).userId));
  });
  r.post('/vitals', vitals, health, async (req, res) => {
    res.status(201).json(await addVital(deps, requireAuth(req).userId, parse(vitalCreateSchema, req.body)));
  });
  r.delete('/vitals/:id', vitals, health, async (req, res) => {
    await deleteVital(deps.db, requireAuth(req).userId, param(req, 'id'));
    res.json({ ok: true });
  });

  // ---- steps & water
  r.get('/steps', feature(deps, 'steps'), health, async (req, res) => {
    res.json(await activitySummary(deps, requireAuth(req).userId, 'steps', 14));
  });
  r.post('/steps', feature(deps, 'steps'), health, async (req, res) => {
    const body = parse(stepsCreateSchema, req.body);
    res.status(201).json(await addSteps(deps, requireAuth(req).userId, body.date, body.steps));
  });
  r.get('/water', feature(deps, 'water'), health, async (req, res) => {
    res.json(await activitySummary(deps, requireAuth(req).userId, 'water', 14));
  });
  r.post('/water', feature(deps, 'water'), health, async (req, res) => {
    const body = parse(waterCreateSchema, req.body);
    res.status(201).json(await addWater(deps, requireAuth(req).userId, body.amountMl, body.loggedAt));
  });
  r.delete('/water/:id', feature(deps, 'water'), health, async (req, res) => {
    await deleteWater(deps.db, requireAuth(req).userId, param(req, 'id'));
    res.json({ ok: true });
  });

  // ---- reactions & history (viewing history is free; export is premium)
  r.get('/reactions', health, async (req, res) => {
    res.json({ items: await listReactions(deps.db, requireAuth(req).userId) });
  });
  r.post('/reactions', health, async (req, res) => {
    res.status(201).json(await addReaction(deps, requireAuth(req).userId, parse(reactionCreateSchema, req.body)));
  });
  r.patch('/reactions/:id', health, async (req, res) => {
    const body = parse(z.object({ showToClinician: z.boolean() }), req.body);
    res.json(await updateReactionFlag(deps.db, requireAuth(req).userId, param(req, 'id'), body.showToClinician));
  });
  r.delete('/reactions/:id', health, async (req, res) => {
    await deleteReaction(deps.db, requireAuth(req).userId, param(req, 'id'));
    res.json({ ok: true });
  });
  r.get('/history', health, async (req, res) => {
    const q = parse(
      z.object({
        types: z.string().max(60).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      req.query,
    );
    const types = q.types?.split(',').filter((t): t is TimelineType => ['reminder', 'vital', 'checkup', 'reaction'].includes(t));
    res.json(await timeline(deps, requireAuth(req).userId, { types, from: q.from, to: q.to }));
  });
  r.get('/history/export.pdf', feature(deps, 'history_export'), health, async (req, res) => {
    const q = parse(z.object({ sections: z.string().max(80).default('medicines,adherence,vitals,checkups,reactions'), days: z.coerce.number().int().min(1).max(365).default(90) }), req.query);
    const sections = q.sections.split(',').filter((s): s is ExportSection => ['medicines', 'adherence', 'vitals', 'checkups', 'reactions'].includes(s));
    const pdf = await historyPdf(deps, requireAuth(req).userId, sections, q.days);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="medimate-health-summary.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  });

  // ---- caretaker links (patient side)
  r.get('/care/links', async (req, res) => {
    res.json({ items: await listLinksForPatient(deps.db, requireAuth(req).userId) });
  });
  r.post('/care/links', async (req, res) => {
    res.status(201).json(await inviteCaretaker(deps, requireAuth(req).userId, parse(careInviteSchema, req.body), req.requestId));
  });
  r.patch('/care/links/:id', async (req, res) => {
    res.json(await updatePermissions(deps, requireAuth(req).userId, param(req, 'id'), parse(carePermissionsSchema, req.body), req.requestId));
  });
  r.post('/care/links/:id/revoke', async (req, res) => {
    res.json(await revokeLink(deps, requireAuth(req).userId, param(req, 'id'), req.requestId));
  });

  // ---- pharmacy inquiries (patient side; free)
  r.get('/inquiries', async (req, res) => {
    res.json({ items: await listPatientInquiries(deps.db, requireAuth(req).userId) });
  });
  r.post('/inquiries', async (req, res) => {
    res.status(201).json(await createInquiry(deps, requireAuth(req).userId, parse(inquiryCreateSchema, req.body)));
  });
  r.get('/inquiries/:id', async (req, res) => {
    res.json(await getThread(deps, requireAuth(req), param(req, 'id')));
  });
  r.post('/inquiries/:id/messages', async (req, res) => {
    res.status(201).json(await postMessage(deps, requireAuth(req), param(req, 'id'), parse(messageCreateSchema, req.body).body));
  });
  r.post('/inquiries/:id/close', async (req, res) => {
    res.json(await closeInquiry(deps, requireAuth(req), param(req, 'id')));
  });

  return r;
}
