import { and, desc, eq, gte, inArray, ne, or } from 'drizzle-orm';
import { localDate, localDayBounds, localTime, maskPhone, normalizePhone, type CareCategory } from '@medimate/shared';
import type { z } from 'zod';
import type { careInviteSchema, carePermissionsSchema } from '@medimate/shared';
import type { DB } from '../db/client';
import { careLinks, checkups, medicationPlans, reactionLogs, reminderEvents, reminderOccurrences, users } from '../db/schema';
import { audit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { Deps } from '../types';
import { adherence } from './reminders';
import { activitySummary, listVitals, publicCheckup, publicReaction } from './tracking';
import { getUser, grantRole, setConsent } from './users';

type Link = typeof careLinks.$inferSelect;

function publicLink(l: Link, other?: { displayName: string | null; phone: string | null } | null) {
  return {
    id: l.id,
    status: l.status,
    categories: l.categories as CareCategory[],
    alertDetail: l.alertDetail,
    invitedPhone: maskPhone(l.invitedPhone),
    createdAt: l.createdAt.toISOString(),
    respondedAt: l.respondedAt?.toISOString() ?? null,
    revokedAt: l.revokedAt?.toISOString() ?? null,
    person: other ? { displayName: other.displayName ?? 'MEDIMATE user', phone: other.phone ? maskPhone(other.phone) : '' } : null,
  };
}

export async function inviteCaretaker(deps: Deps, patientId: string, input: z.infer<typeof careInviteSchema>, requestId?: string) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw badRequest('Enter a valid phone number for your caretaker.');
  const patient = await getUser(deps.db, patientId);
  if (!patient) throw notFound('User');
  if (patient.phone === phone) throw badRequest('You cannot add yourself as a caretaker.');
  const existing = await deps.db
    .select({ id: careLinks.id })
    .from(careLinks)
    .where(and(eq(careLinks.patientId, patientId), eq(careLinks.invitedPhone, phone), inArray(careLinks.status, ['pending', 'active'])));
  if (existing.length) throw conflict('This person already has an invitation or an active link.');
  const [caretaker] = await deps.db.select().from(users).where(eq(users.phone, phone)).limit(1);
  const [link] = await deps.db
    .insert(careLinks)
    .values({
      patientId,
      caretakerId: caretaker?.id ?? null,
      invitedPhone: phone,
      categories: [...new Set(input.categories)],
      alertDetail: input.alertDetail,
      createdAt: deps.clock.now(),
    })
    .returning();
  await setConsent(deps, patientId, 'caretaker_sharing', true, 'web', { linkId: link!.id, categories: link!.categories, alertDetail: link!.alertDetail }, requestId);
  await audit(deps.db, { actorId: patientId, action: 'care.invited', targetType: 'care_link', targetId: link!.id, detail: { categories: link!.categories }, requestId });
  return publicLink(link!, caretaker ?? null);
}

export async function listLinksForPatient(db: DB, patientId: string) {
  const rows = await db
    .select({ link: careLinks, caretaker: users })
    .from(careLinks)
    .leftJoin(users, eq(users.id, careLinks.caretakerId))
    .where(eq(careLinks.patientId, patientId))
    .orderBy(desc(careLinks.createdAt));
  return rows.map((r) => publicLink(r.link, r.caretaker));
}

async function patientLink(db: DB, patientId: string, linkId: string) {
  const [l] = await db.select().from(careLinks).where(and(eq(careLinks.id, linkId), eq(careLinks.patientId, patientId))).limit(1);
  if (!l) throw notFound('Caretaker link');
  return l;
}

export async function updatePermissions(deps: Deps, patientId: string, linkId: string, input: z.infer<typeof carePermissionsSchema>, requestId?: string) {
  const l = await patientLink(deps.db, patientId, linkId);
  if (!['pending', 'active'].includes(l.status)) throw badRequest('This link is no longer active.');
  const [u] = await deps.db
    .update(careLinks)
    .set({ categories: [...new Set(input.categories)], alertDetail: input.alertDetail })
    .where(eq(careLinks.id, l.id))
    .returning();
  await setConsent(deps, patientId, 'caretaker_sharing', input.categories.length > 0, 'web', { linkId: l.id, categories: u!.categories, alertDetail: u!.alertDetail }, requestId);
  await audit(deps.db, { actorId: patientId, action: 'care.permissions_changed', targetType: 'care_link', targetId: l.id, detail: { categories: u!.categories }, requestId });
  return publicLink(u!);
}

/** Revocation is immediate: every caretaker read re-checks the link status in the database. */
export async function revokeLink(deps: Deps, patientId: string, linkId: string, requestId?: string) {
  const l = await patientLink(deps.db, patientId, linkId);
  if (l.status === 'revoked') return publicLink(l);
  const [u] = await deps.db.update(careLinks).set({ status: 'revoked', revokedAt: deps.clock.now() }).where(eq(careLinks.id, l.id)).returning();
  await setConsent(deps, patientId, 'caretaker_sharing', false, 'web', { linkId: l.id }, requestId);
  await audit(deps.db, { actorId: patientId, action: 'care.revoked', targetType: 'care_link', targetId: l.id, requestId });
  return publicLink(u!);
}

export async function listInvitesForCaretaker(db: DB, userId: string) {
  const rows = await db
    .select({ link: careLinks, patient: users })
    .from(careLinks)
    .innerJoin(users, eq(users.id, careLinks.patientId))
    .where(and(eq(careLinks.caretakerId, userId), eq(careLinks.status, 'pending')))
    .orderBy(desc(careLinks.createdAt));
  return rows.map((r) => publicLink(r.link, r.patient));
}

export async function respondToInvite(deps: Deps, userId: string, linkId: string, accept: boolean, requestId?: string) {
  const [l] = await deps.db.select().from(careLinks).where(and(eq(careLinks.id, linkId), eq(careLinks.caretakerId, userId))).limit(1);
  if (!l) throw notFound('Invitation');
  if (l.status !== 'pending') throw badRequest('This invitation has already been answered.');
  const [u] = await deps.db
    .update(careLinks)
    .set({ status: accept ? 'active' : 'declined', respondedAt: deps.clock.now() })
    .where(and(eq(careLinks.id, l.id), eq(careLinks.status, 'pending')))
    .returning();
  if (accept) await grantRole(deps.db, userId, 'caretaker', l.patientId);
  await audit(deps.db, { actorId: userId, action: accept ? 'care.accepted' : 'care.declined', targetType: 'care_link', targetId: l.id, requestId });
  return publicLink(u!);
}

export async function leaveLink(deps: Deps, caretakerId: string, linkId: string, requestId?: string) {
  const [l] = await deps.db.select().from(careLinks).where(and(eq(careLinks.id, linkId), eq(careLinks.caretakerId, caretakerId))).limit(1);
  if (!l) throw notFound('Caretaker link');
  const [u] = await deps.db.update(careLinks).set({ status: 'revoked', revokedAt: deps.clock.now() }).where(eq(careLinks.id, l.id)).returning();
  await audit(deps.db, { actorId: caretakerId, action: 'care.left', targetType: 'care_link', targetId: l.id, requestId });
  return publicLink(u!);
}

export async function listPatients(db: DB, caretakerId: string) {
  const rows = await db
    .select({ link: careLinks, patient: users })
    .from(careLinks)
    .innerJoin(users, eq(users.id, careLinks.patientId))
    .where(and(eq(careLinks.caretakerId, caretakerId), eq(careLinks.status, 'active')));
  return rows.map((r) => ({ patientId: r.patient.id, ...publicLink(r.link, r.patient) }));
}

async function activeLink(db: DB, caretakerId: string, patientId: string): Promise<Link> {
  const [l] = await db
    .select()
    .from(careLinks)
    .where(and(eq(careLinks.caretakerId, caretakerId), eq(careLinks.patientId, patientId), eq(careLinks.status, 'active')))
    .limit(1);
  if (!l) throw forbidden('You do not have access to this person’s information. They may have changed their sharing settings.');
  return l;
}

/** Permission-limited overview: each category is included only if the patient shared it. */
export async function patientOverview(deps: Deps, caretakerId: string, patientId: string, requestId?: string) {
  const link = await activeLink(deps.db, caretakerId, patientId);
  const patient = await getUser(deps.db, patientId);
  if (!patient) throw notFound('Person');
  const cats = new Set(link.categories as CareCategory[]);
  const tz = patient.timezone;
  const now = deps.clock.now();
  const out: Record<string, unknown> = {
    patient: { id: patient.id, displayName: patient.displayName ?? 'MEDIMATE user' },
    categories: [...cats],
    alertDetail: link.alertDetail,
  };

  if (cats.has('reminders')) {
    const b = localDayBounds(localDate(now, tz), tz);
    const today = await deps.db
      .select({ o: reminderOccurrences, plan: medicationPlans })
      .from(reminderOccurrences)
      .leftJoin(medicationPlans, eq(medicationPlans.id, reminderOccurrences.planId))
      .where(
        and(
          eq(reminderOccurrences.userId, patientId),
          eq(reminderOccurrences.kind, 'medication'),
          gte(reminderOccurrences.scheduledFor, b.start),
          ne(reminderOccurrences.status, 'scheduled'),
        ),
      );
    const alerts = await deps.db
      .select()
      .from(reminderEvents)
      .where(and(eq(reminderEvents.userId, patientId), eq(reminderEvents.action, 'escalated'), gte(reminderEvents.createdAt, new Date(now.getTime() - 7 * 86_400_000))))
      .orderBy(desc(reminderEvents.createdAt))
      .limit(20);
    out.reminders = {
      today: today
        .filter(({ o }) => o.scheduledFor.getTime() < b.end.getTime())
        .map(({ o, plan }) => ({
          time: localTime(o.scheduledFor, tz),
          status: o.status,
          // Medicine names are shared only if the person allowed detailed alerts.
          label: link.alertDetail ? plan?.medicineName ?? 'Medicine' : 'Medicine reminder',
        })),
      week: (await adherence(deps, patientId, 7, tz)).summary,
      alerts: alerts
        .filter((a) => ((a.detail?.caretakerIds as string[] | undefined) ?? []).includes(caretakerId))
        .map((a) => ({ at: a.createdAt.toISOString(), message: 'A reminder was not confirmed in time.' })),
    };
  }
  if (cats.has('checkups')) {
    const rows = await deps.db
      .select()
      .from(checkups)
      .where(and(eq(checkups.userId, patientId), or(eq(checkups.status, 'upcoming'), gte(checkups.dueAt, new Date(now.getTime() - 30 * 86_400_000)))))
      .limit(20);
    out.checkups = rows.map(publicCheckup);
  }
  if (cats.has('vitals')) out.vitals = (await listVitals(deps.db, patientId, undefined, 20));
  if (cats.has('activity')) {
    const [steps, water] = await Promise.all([activitySummary(deps, patientId, 'steps', 7), activitySummary(deps, patientId, 'water', 7)]);
    out.activity = { steps: { daily: steps.daily, goal: steps.goal }, water: { daily: water.daily, goal: water.goal } };
  }
  if (cats.has('reactions')) {
    const rows = await deps.db.select().from(reactionLogs).where(eq(reactionLogs.userId, patientId)).orderBy(desc(reactionLogs.occurredAt)).limit(20);
    out.reactions = rows.map(publicReaction);
  }
  await audit(deps.db, { actorId: caretakerId, action: 'care.viewed', targetType: 'user', targetId: patientId, detail: { categories: [...cats] }, requestId });
  return out;
}
