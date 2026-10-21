import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { maskPhone, type Role } from '@medimate/shared';
import type { z } from 'zod';
import type {
  medicineUpsertSchema,
  reportCreateSchema,
  reportResolveSchema,
  reviewDecisionSchema,
  tipUpsertSchema,
  verificationDecisionSchema,
} from '@medimate/shared';
import type { DB } from '../db/client';
import {
  auditLogs,
  healthTips,
  medicineReviews,
  medicines,
  pharmacies,
  pharmacyVerifications,
  reports,
  smsLogs,
  subscriptions,
  userRoles,
  users,
  ussdSessions,
} from '../db/schema';
import { audit } from '../lib/audit';
import { badRequest, forbidden, notFound } from '../lib/errors';
import type { AuthInfo, Deps } from '../types';
import { medicineSummary } from './medicines';
import { approvedCondition } from './pharmacy';

// ---------------------------------------------------------------- overview

export async function adminOverview(db: DB) {
  const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);
  return {
    pharmaciesPending: n(await db.select({ n: count() }).from(pharmacies).where(eq(pharmacies.verificationStatus, 'pending'))),
    pharmaciesApproved: n(await db.select({ n: count() }).from(pharmacies).where(eq(pharmacies.verificationStatus, 'approved'))),
    reportsOpen: n(await db.select({ n: count() }).from(reports).where(inArray(reports.status, ['open', 'investigating']))),
    tipsInReview: n(await db.select({ n: count() }).from(healthTips).where(eq(healthTips.status, 'in_review'))),
    medicinesInReview: n(await db.select({ n: count() }).from(medicines).where(eq(medicines.infoStatus, 'in_review'))),
  };
}

// ---------------------------------------------------------------- pharmacies

export async function listPharmaciesAdmin(db: DB, status?: string) {
  const rows = await db
    .select()
    .from(pharmacies)
    .where(status ? eq(pharmacies.verificationStatus, status) : undefined)
    .orderBy(desc(pharmacies.updatedAt))
    .limit(300);
  const ids = rows.map((r) => r.id);
  const history = ids.length
    ? await db.select().from(pharmacyVerifications).where(inArray(pharmacyVerifications.pharmacyId, ids)).orderBy(desc(pharmacyVerifications.createdAt))
    : [];
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    area: p.area,
    town: p.town,
    address: p.address,
    phone: p.phone,
    isDemo: p.isDemo,
    verificationStatus: p.verificationStatus,
    verifiedUntil: p.verifiedUntil,
    history: history
      .filter((h) => h.pharmacyId === p.id)
      .map((h) => ({
        status: h.status,
        notes: h.notes,
        licenceNumber: h.licenceNumber,
        documentReference: h.documentReference,
        validUntil: h.validUntil,
        createdAt: h.createdAt.toISOString(),
      })),
  }));
}

/** Every verification decision keeps evidence, actor, date and notes; the status is never a single boolean. */
export async function decideVerification(deps: Deps, actor: AuthInfo, pharmacyId: string, input: z.infer<typeof verificationDecisionSchema>, requestId?: string) {
  const [p] = await deps.db.select().from(pharmacies).where(eq(pharmacies.id, pharmacyId));
  if (!p) throw notFound('Pharmacy');
  if (input.status === 'approved' && !input.validUntil) throw badRequest('Set the date until which this verification is valid.');
  await deps.db
    .update(pharmacies)
    .set({ verificationStatus: input.status, verifiedUntil: input.status === 'approved' ? input.validUntil ?? null : p.verifiedUntil, updatedAt: deps.clock.now() })
    .where(eq(pharmacies.id, p.id));
  await deps.db.insert(pharmacyVerifications).values({
    pharmacyId: p.id,
    status: input.status,
    actorId: actor.userId,
    notes: input.notes,
    validUntil: input.validUntil ?? null,
    createdAt: deps.clock.now(),
  });
  await audit(deps.db, { actorId: actor.userId, action: `pharmacy.${input.status}`, targetType: 'pharmacy', targetId: p.id, detail: { from: p.verificationStatus }, requestId });
  return (await listPharmaciesAdmin(deps.db)).find((x) => x.id === p.id);
}

// ---------------------------------------------------------------- medicines

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

export async function listMedicinesAdmin(db: DB) {
  const rows = await db.select().from(medicines).orderBy(desc(medicines.updatedAt)).limit(500);
  return rows.map((m) => ({
    ...medicineSummary(m),
    content: {
      indications: m.indications,
      usageNotes: m.usageNotes,
      warnings: m.warnings,
      interactions: m.interactions,
      storage: m.storage,
      sideEffects: m.sideEffects,
      sourceAuthority: m.sourceAuthority,
      sourceUrl: m.sourceUrl,
      sourceVersionDate: m.sourceVersionDate,
    },
    submittedBy: m.submittedBy,
    reviewedBy: m.reviewedBy,
    verifiedAt: m.verifiedAt?.toISOString() ?? null,
  }));
}

const CONTENT_FIELDS = ['indications', 'usageNotes', 'warnings', 'interactions', 'storage', 'sideEffects'] as const;

export async function upsertMedicine(deps: Deps, actor: AuthInfo, id: string | null, input: z.infer<typeof medicineUpsertSchema>, requestId?: string) {
  const now = deps.clock.now();
  const hasContent = CONTENT_FIELDS.some((f) => input[f]);
  const values = {
    name: input.name,
    genericName: input.genericName,
    strength: input.strength,
    form: input.form,
    indications: input.indications ?? null,
    usageNotes: input.usageNotes ?? null,
    warnings: input.warnings ?? null,
    interactions: input.interactions ?? null,
    storage: input.storage ?? null,
    sideEffects: input.sideEffects ?? null,
    sourceAuthority: input.sourceAuthority ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceVersionDate: input.sourceVersionDate ?? null,
    // Any edit to clinical content sends the record back to review; it is no longer "verified".
    infoStatus: hasContent ? 'in_review' : 'none',
    submittedBy: actor.userId,
    reviewedBy: null,
    verifiedAt: null,
    updatedAt: now,
  };
  let m: typeof medicines.$inferSelect;
  if (id) {
    const [u] = await deps.db.update(medicines).set(values).where(eq(medicines.id, id)).returning();
    if (!u) throw notFound('Medicine');
    m = u;
  } else {
    const slug = slugify(`${input.name} ${input.strength} ${input.form}`);
    const [dup] = await deps.db.select({ id: medicines.id }).from(medicines).where(eq(medicines.slug, slug));
    if (dup) throw badRequest('A medicine with this name, strength and form already exists.');
    [m] = (await deps.db.insert(medicines).values({ ...values, slug, createdAt: now }).returning()) as [typeof medicines.$inferSelect];
  }
  await deps.db.insert(medicineReviews).values({ medicineId: m.id, action: id ? 'edited' : 'created', actorId: actor.userId, snapshot: values as Record<string, unknown>, createdAt: now });
  await audit(deps.db, { actorId: actor.userId, action: id ? 'medicine.updated' : 'medicine.created', targetType: 'medicine', targetId: m.id, requestId });
  return medicineSummary(m);
}

/** A reviewer other than the submitter must approve, and a source + version date are required. */
export async function reviewMedicine(deps: Deps, actor: AuthInfo, id: string, input: z.infer<typeof reviewDecisionSchema>, requestId?: string) {
  const [m] = await deps.db.select().from(medicines).where(eq(medicines.id, id));
  if (!m) throw notFound('Medicine');
  if (m.infoStatus !== 'in_review') throw badRequest('Only records waiting for review can be reviewed.');
  if (m.submittedBy === actor.userId) throw forbidden('A different reviewer must approve content you submitted.');
  if (input.decision === 'approve' && (!m.sourceAuthority || !m.sourceUrl || !m.sourceVersionDate)) {
    throw badRequest('Add the source authority, source link and source version date before approving.');
  }
  const now = deps.clock.now();
  const [u] = await deps.db
    .update(medicines)
    .set(
      input.decision === 'approve'
        ? { infoStatus: 'verified', reviewedBy: actor.userId, verifiedAt: now, updatedAt: now }
        : { infoStatus: 'rejected', reviewedBy: actor.userId, verifiedAt: null, updatedAt: now },
    )
    .where(eq(medicines.id, id))
    .returning();
  await deps.db.insert(medicineReviews).values({ medicineId: id, action: input.decision === 'approve' ? 'approved' : 'rejected', actorId: actor.userId, notes: input.notes, createdAt: now });
  await audit(deps.db, { actorId: actor.userId, action: `medicine.${input.decision}d`, targetType: 'medicine', targetId: id, requestId });
  return medicineSummary(u!);
}

// ---------------------------------------------------------------- tips

export function publicTip(t: typeof healthTips.$inferSelect) {
  return {
    id: t.id,
    title: t.title,
    body: t.body,
    topic: t.topic,
    language: t.language,
    source: t.source,
    status: t.status,
    isDemo: t.isDemo,
    reviewedAt: t.reviewedAt?.toISOString() ?? null,
    reviewNotes: t.reviewNotes,
  };
}

export async function listPublishedTips(db: DB, language = 'en') {
  const rows = await db.select().from(healthTips).where(and(eq(healthTips.status, 'published'), eq(healthTips.language, language))).orderBy(desc(healthTips.reviewedAt)).limit(50);
  if (!rows.length && language !== 'en') return listPublishedTips(db, 'en');
  return rows.map(publicTip);
}

export async function listTipsAdmin(db: DB) {
  return (await db.select().from(healthTips).orderBy(desc(healthTips.updatedAt)).limit(300)).map(publicTip);
}

export async function upsertTip(deps: Deps, actor: AuthInfo, id: string | null, input: z.infer<typeof tipUpsertSchema>, requestId?: string) {
  const now = deps.clock.now();
  const values = { ...input, status: 'in_review', authorId: actor.userId, reviewerId: null, reviewedAt: null, reviewNotes: null, updatedAt: now };
  const [t] = id
    ? await deps.db.update(healthTips).set(values).where(eq(healthTips.id, id)).returning()
    : await deps.db.insert(healthTips).values({ ...values, createdAt: now }).returning();
  if (!t) throw notFound('Tip');
  await audit(deps.db, { actorId: actor.userId, action: id ? 'tip.updated' : 'tip.created', targetType: 'health_tip', targetId: t.id, requestId });
  return publicTip(t);
}

export async function reviewTip(deps: Deps, actor: AuthInfo, id: string, input: z.infer<typeof reviewDecisionSchema>, requestId?: string) {
  const [t] = await deps.db.select().from(healthTips).where(eq(healthTips.id, id));
  if (!t) throw notFound('Tip');
  if (t.status !== 'in_review') throw badRequest('Only tips waiting for review can be reviewed.');
  if (t.authorId === actor.userId) throw forbidden('A different reviewer must approve a tip you wrote.');
  const now = deps.clock.now();
  const [u] = await deps.db
    .update(healthTips)
    .set({ status: input.decision === 'approve' ? 'published' : 'draft', reviewerId: actor.userId, reviewedAt: now, reviewNotes: input.notes, updatedAt: now })
    .where(eq(healthTips.id, id))
    .returning();
  await audit(deps.db, { actorId: actor.userId, action: input.decision === 'approve' ? 'tip.published' : 'tip.returned', targetType: 'health_tip', targetId: id, requestId });
  return publicTip(u!);
}

export async function archiveTip(deps: Deps, actor: AuthInfo, id: string, requestId?: string) {
  const [u] = await deps.db.update(healthTips).set({ status: 'archived', updatedAt: deps.clock.now() }).where(eq(healthTips.id, id)).returning();
  if (!u) throw notFound('Tip');
  await audit(deps.db, { actorId: actor.userId, action: 'tip.archived', targetType: 'health_tip', targetId: id, requestId });
  return publicTip(u);
}

// ---------------------------------------------------------------- reports

export async function createReport(deps: Deps, reporterId: string, input: z.infer<typeof reportCreateSchema>, requestId?: string) {
  const [p] = await deps.db.select({ id: pharmacies.id }).from(pharmacies).where(and(eq(pharmacies.id, input.pharmacyId), approvedCondition(deps.clock.now())));
  if (!p) throw notFound('Pharmacy');
  const [r] = await deps.db
    .insert(reports)
    .values({ reporterId, pharmacyId: p.id, stockId: input.stockId ?? null, reason: input.reason, details: input.details, createdAt: deps.clock.now(), updatedAt: deps.clock.now() })
    .returning();
  await audit(deps.db, { actorId: reporterId, action: 'report.created', targetType: 'report', targetId: r!.id, detail: { pharmacyId: p.id, reason: input.reason }, requestId });
  return { id: r!.id, status: r!.status };
}

export async function listReports(db: DB, status?: string) {
  const rows = await db
    .select({ r: reports, p: pharmacies })
    .from(reports)
    .innerJoin(pharmacies, eq(pharmacies.id, reports.pharmacyId))
    .where(status ? eq(reports.status, status) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(300);
  return rows.map(({ r, p }) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    status: r.status,
    resolutionNote: r.resolutionNote,
    createdAt: r.createdAt.toISOString(),
    pharmacy: { id: p.id, name: p.name, code: p.code, verificationStatus: p.verificationStatus },
  }));
}

export async function resolveReport(deps: Deps, actor: AuthInfo, id: string, input: z.infer<typeof reportResolveSchema>, requestId?: string) {
  const [u] = await deps.db
    .update(reports)
    .set({ status: input.status, resolutionNote: input.note, resolvedBy: actor.userId, updatedAt: deps.clock.now() })
    .where(eq(reports.id, id))
    .returning();
  if (!u) throw notFound('Report');
  await audit(deps.db, { actorId: actor.userId, action: `report.${input.status}`, targetType: 'report', targetId: id, requestId });
  return { id: u.id, status: u.status };
}

// ---------------------------------------------------------------- users & roles

export async function listUsers(db: DB, q?: string) {
  const cond = q ? or(ilike(users.displayName, `%${q.replace(/[%_\\]/g, '')}%`), ilike(users.phone, `%${q.replace(/[^\d+]/g, '')}%`)) : undefined;
  const rows = await db.select().from(users).where(cond).orderBy(desc(users.createdAt)).limit(200);
  const ids = rows.map((r) => r.id);
  const roles = ids.length ? await db.select().from(userRoles).where(inArray(userRoles.userId, ids)) : [];
  const subs = ids.length ? await db.select().from(subscriptions).where(inArray(subscriptions.userId, ids)) : [];
  return rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    phone: u.phone ? maskPhone(u.phone) : null,
    email: u.email ? u.email.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
    createdVia: u.createdVia,
    isDemo: u.isDemo,
    createdAt: u.createdAt.toISOString(),
    roles: roles.filter((r) => r.userId === u.id).map((r) => r.role),
    trialEndsAt: subs.find((s) => s.userId === u.id)?.trialEndsAt.toISOString() ?? null,
    premiumUntil: subs.find((s) => s.userId === u.id)?.premiumUntil?.toISOString() ?? null,
  }));
}

export async function setRole(deps: Deps, actor: AuthInfo, userId: string, role: Role, grant: boolean, requestId?: string) {
  if (userId === actor.userId && role === 'admin' && !grant) throw badRequest('You cannot remove your own admin role.');
  const [u] = await deps.db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound('User');
  if (grant) await deps.db.insert(userRoles).values({ userId, role, grantedBy: actor.userId }).onConflictDoNothing();
  else await deps.db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
  await audit(deps.db, { actorId: actor.userId, action: grant ? 'role.granted' : 'role.revoked', targetType: 'user', targetId: userId, detail: { role }, requestId });
}

// ---------------------------------------------------------------- logs

export async function listSmsLogs(deps: Pick<Deps, 'db' | 'clock'>, limit = 200) {
  const now = deps.clock.now();
  const rows = await deps.db.select().from(smsLogs).orderBy(desc(smsLogs.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    phone: maskPhone(r.phone),
    command: r.command,
    status: r.status,
    provider: r.provider,
    segments: r.segments,
    encoding: r.encoding,
    body: r.body && r.bodyExpiresAt && r.bodyExpiresAt > now ? r.body : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listUssdSessions(db: DB) {
  const rows = await db.select().from(ussdSessions).orderBy(desc(ussdSessions.lastActiveAt)).limit(100);
  return rows.map((s) => ({
    sessionId: s.sessionId,
    phone: maskPhone(s.phone),
    screen: (s.state as { screen?: string }).screen ?? null,
    ended: s.ended,
    lastActiveAt: s.lastActiveAt.toISOString(),
  }));
}

export async function listAudit(db: DB, filters: { action?: string; targetType?: string }) {
  const conds: SQL[] = [];
  if (filters.action) conds.push(ilike(auditLogs.action, `${filters.action.replace(/[%_\\]/g, '')}%`));
  if (filters.targetType) conds.push(eq(auditLogs.targetType, filters.targetType));
  const rows = await db.select().from(auditLogs).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLogs.createdAt)).limit(300);
  return rows.map((a) => ({
    id: a.id,
    actorId: a.actorId,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    detail: a.detail,
    createdAt: a.createdAt.toISOString(),
  }));
}
