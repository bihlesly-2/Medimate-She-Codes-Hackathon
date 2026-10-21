import { Router } from 'express';
import { z } from 'zod';
import {
  csvImportSchema,
  medicineUpsertSchema,
  pharmacyProfileSchema,
  reportResolveSchema,
  reviewDecisionSchema,
  roleUpdateSchema,
  settingsUpdateSchema,
  stockUpsertSchema,
  tipUpsertSchema,
  verificationDecisionSchema,
  verificationSubmitSchema,
} from '@medimate/shared';
import { param, parse, requireAuth } from '../lib/http';
import { authRequired, roles } from '../middleware';
import {
  adminOverview,
  archiveTip,
  decideVerification,
  listAudit,
  listMedicinesAdmin,
  listPharmaciesAdmin,
  listReports,
  listSmsLogs,
  listTipsAdmin,
  listUsers,
  listUssdSessions,
  resolveReport,
  reviewMedicine,
  reviewTip,
  setRole,
  upsertMedicine,
  upsertTip,
} from '../services/admin';
import { leaveLink, listInvitesForCaretaker, listPatients, patientOverview, respondToInvite } from '../services/care';
import { pharmacyInbox } from '../services/inquiries';
import {
  analytics,
  deleteStock,
  importStockCsv,
  listMyStock,
  myPharmacy,
  portalProfile,
  registerPharmacy,
  submitVerification,
  updateProfile,
  upsertStock,
} from '../services/portal';
import { getSettings, updateSettings } from '../services/settings';
import type { Deps } from '../types';

/** Caretaker portal: any signed-in person can receive invitations; data access needs an active link. */
export function careRoutes(deps: Deps) {
  const r = Router();
  r.use(authRequired);
  r.get('/invites', async (req, res) => {
    res.json({ items: await listInvitesForCaretaker(deps.db, requireAuth(req).userId) });
  });
  r.post('/invites/:id/accept', async (req, res) => {
    res.json(await respondToInvite(deps, requireAuth(req).userId, param(req, 'id'), true, req.requestId));
  });
  r.post('/invites/:id/decline', async (req, res) => {
    res.json(await respondToInvite(deps, requireAuth(req).userId, param(req, 'id'), false, req.requestId));
  });
  r.get('/patients', async (req, res) => {
    res.json({ items: await listPatients(deps.db, requireAuth(req).userId) });
  });
  r.get('/patients/:patientId', async (req, res) => {
    res.json(await patientOverview(deps, requireAuth(req).userId, param(req, 'patientId'), req.requestId));
  });
  r.post('/links/:id/leave', async (req, res) => {
    res.json(await leaveLink(deps, requireAuth(req).userId, param(req, 'id'), req.requestId));
  });
  return r;
}

/** Pharmacy portal: every route is scoped to the signed-in staff member's own pharmacy. */
export function pharmacyRoutes(deps: Deps) {
  const r = Router();
  r.use(authRequired);
  r.post('/register', async (req, res) => {
    res.status(201).json(await registerPharmacy(deps, requireAuth(req).userId, parse(pharmacyProfileSchema, req.body), req.requestId));
  });
  r.use(roles('pharmacy'));
  r.get('/profile', async (req, res) => {
    res.json(await portalProfile(deps.db, requireAuth(req).userId));
  });
  r.put('/profile', async (req, res) => {
    res.json(await updateProfile(deps, requireAuth(req).userId, parse(pharmacyProfileSchema, req.body), req.requestId));
  });
  r.post('/verification', async (req, res) => {
    res.json(await submitVerification(deps, requireAuth(req).userId, parse(verificationSubmitSchema, req.body), req.requestId));
  });
  r.get('/stock', async (req, res) => {
    res.json({ items: await listMyStock(deps, requireAuth(req).userId) });
  });
  r.put('/stock', async (req, res) => {
    res.json({ items: await upsertStock(deps, requireAuth(req).userId, parse(stockUpsertSchema, req.body), req.requestId) });
  });
  r.delete('/stock/:id', async (req, res) => {
    await deleteStock(deps, requireAuth(req).userId, param(req, 'id'), req.requestId);
    res.json({ ok: true });
  });
  r.post('/stock/import', async (req, res) => {
    const body = parse(csvImportSchema, req.body);
    res.json(await importStockCsv(deps, requireAuth(req).userId, body.csv, body.commit, req.requestId));
  });
  r.get('/inbox', async (req, res) => {
    const p = await myPharmacy(deps.db, requireAuth(req).userId);
    const status = z.enum(['open', 'answered', 'closed']).optional().catch(undefined).parse(req.query.status);
    res.json({ items: await pharmacyInbox(deps.db, p.id, status) });
  });
  r.get('/analytics', async (req, res) => {
    res.json(await analytics(deps, requireAuth(req).userId));
  });
  return r;
}

/** Admin and clinical-reviewer tools. Reviewers can only reach content review routes. */
export function adminRoutes(deps: Deps) {
  const r = Router();
  r.use(authRequired);
  const admin = roles('admin');
  const reviewer = roles('admin', 'reviewer');

  r.get('/overview', reviewer, async (_req, res) => {
    res.json(await adminOverview(deps.db));
  });

  r.get('/pharmacies', admin, async (req, res) => {
    res.json({ items: await listPharmaciesAdmin(deps.db, typeof req.query.status === 'string' ? req.query.status : undefined) });
  });
  r.post('/pharmacies/:id/decision', admin, async (req, res) => {
    res.json(await decideVerification(deps, requireAuth(req), param(req, 'id'), parse(verificationDecisionSchema, req.body), req.requestId));
  });

  r.get('/medicines', reviewer, async (_req, res) => {
    res.json({ items: await listMedicinesAdmin(deps.db) });
  });
  r.post('/medicines', reviewer, async (req, res) => {
    res.status(201).json(await upsertMedicine(deps, requireAuth(req), null, parse(medicineUpsertSchema, req.body), req.requestId));
  });
  r.put('/medicines/:id', reviewer, async (req, res) => {
    res.json(await upsertMedicine(deps, requireAuth(req), param(req, 'id'), parse(medicineUpsertSchema, req.body), req.requestId));
  });
  r.post('/medicines/:id/review', reviewer, async (req, res) => {
    res.json(await reviewMedicine(deps, requireAuth(req), param(req, 'id'), parse(reviewDecisionSchema, req.body), req.requestId));
  });

  r.get('/tips', reviewer, async (_req, res) => {
    res.json({ items: await listTipsAdmin(deps.db) });
  });
  r.post('/tips', reviewer, async (req, res) => {
    res.status(201).json(await upsertTip(deps, requireAuth(req), null, parse(tipUpsertSchema, req.body), req.requestId));
  });
  r.put('/tips/:id', reviewer, async (req, res) => {
    res.json(await upsertTip(deps, requireAuth(req), param(req, 'id'), parse(tipUpsertSchema, req.body), req.requestId));
  });
  r.post('/tips/:id/review', reviewer, async (req, res) => {
    res.json(await reviewTip(deps, requireAuth(req), param(req, 'id'), parse(reviewDecisionSchema, req.body), req.requestId));
  });
  r.post('/tips/:id/archive', reviewer, async (req, res) => {
    res.json(await archiveTip(deps, requireAuth(req), param(req, 'id'), req.requestId));
  });

  r.get('/reports', admin, async (req, res) => {
    res.json({ items: await listReports(deps.db, typeof req.query.status === 'string' ? req.query.status : undefined) });
  });
  r.post('/reports/:id/resolve', admin, async (req, res) => {
    res.json(await resolveReport(deps, requireAuth(req), param(req, 'id'), parse(reportResolveSchema, req.body), req.requestId));
  });

  r.get('/users', admin, async (req, res) => {
    res.json({ items: await listUsers(deps.db, typeof req.query.q === 'string' ? req.query.q.slice(0, 40) : undefined) });
  });
  r.post('/users/:id/roles', admin, async (req, res) => {
    const body = parse(roleUpdateSchema, req.body);
    await setRole(deps, requireAuth(req), param(req, 'id'), body.role, body.grant, req.requestId);
    res.json({ ok: true });
  });

  r.get('/settings', admin, async (_req, res) => {
    res.json(await getSettings(deps.db));
  });
  r.put('/settings', admin, async (req, res) => {
    res.json(await updateSettings(deps.db, requireAuth(req).userId, parse(settingsUpdateSchema, req.body), req.requestId));
  });

  r.get('/sms-logs', admin, async (_req, res) => {
    res.json({ items: await listSmsLogs(deps) });
  });
  r.get('/ussd-sessions', admin, async (_req, res) => {
    res.json({ items: await listUssdSessions(deps.db) });
  });
  r.get('/audit', admin, async (req, res) => {
    res.json({
      items: await listAudit(deps.db, {
        action: typeof req.query.action === 'string' ? req.query.action.slice(0, 40) : undefined,
        targetType: typeof req.query.targetType === 'string' ? req.query.targetType.slice(0, 40) : undefined,
      }),
    });
  });
  return r;
}
