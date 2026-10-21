import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import {
  addDays,
  adherenceSummary,
  localDate,
  localDayBounds,
  localTime,
  msg,
  zonedDateTimeToUtc,
  type OccurrenceStatus,
  type PlanCreate,
} from '@medimate/shared';
import type { z } from 'zod';
import type { planUpdateSchema } from '@medimate/shared';
import type { DB } from '../db/client';
import { careLinks, checkups, medicationPlans, reminderEvents, reminderOccurrences, users } from '../db/schema';
import { audit } from '../lib/audit';
import { refCode } from '../lib/crypto';
import { badRequest, notFound } from '../lib/errors';
import type { Deps } from '../types';
import { sendSms } from './messaging';
import { getUser, hasConsent, userHasFeature } from './users';

type Occurrence = typeof reminderOccurrences.$inferSelect;
type Plan = typeof medicationPlans.$inferSelect;

export const MAX_SMS_ATTEMPTS = 5;
/** Bounded exponential backoff: 30s, 60s, 120s, 240s … capped at 15 minutes. */
export const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);

// ---------------------------------------------------------------- plans

export function publicPlan(p: Plan) {
  return {
    id: p.id,
    medicineName: p.medicineName,
    medicineId: p.medicineId,
    doseText: p.doseText,
    frequencyText: p.frequencyText,
    times: p.times,
    startDate: p.startDate,
    endDate: p.endDate,
    refillDate: p.refillDate,
    notes: p.notes,
    timezone: p.timezone,
    smsReminders: p.smsReminders,
    caretakerAlerts: p.caretakerAlerts,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listPlans(db: DB, userId: string) {
  const rows = await db.select().from(medicationPlans).where(eq(medicationPlans.userId, userId)).orderBy(desc(medicationPlans.active), asc(medicationPlans.medicineName));
  return rows.map(publicPlan);
}

async function ownedPlan(db: DB, userId: string, planId: string): Promise<Plan> {
  const [p] = await db.select().from(medicationPlans).where(and(eq(medicationPlans.id, planId), eq(medicationPlans.userId, userId))).limit(1);
  // 404 (not 403) so other people's plan ids are not confirmed to exist.
  if (!p) throw notFound('Medication plan');
  return p;
}

export async function getPlan(db: DB, userId: string, planId: string) {
  return publicPlan(await ownedPlan(db, userId, planId));
}

/** The dose text is stored exactly as entered — MEDIMATE never calculates or changes a dose. */
export async function createPlan(deps: Deps, userId: string, input: PlanCreate, requestId?: string) {
  const user = await getUser(deps.db, userId);
  if (!user) throw notFound('User');
  const now = deps.clock.now();
  const [p] = await deps.db
    .insert(medicationPlans)
    .values({
      userId,
      medicineName: input.medicineName,
      medicineId: input.medicineId ?? null,
      doseText: input.doseText,
      frequencyText: input.frequencyText,
      times: [...input.times].sort(),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      refillDate: input.refillDate ?? null,
      notes: input.notes ?? null,
      timezone: user.timezone,
      smsReminders: input.smsReminders,
      caretakerAlerts: input.caretakerAlerts,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await audit(deps.db, { actorId: userId, action: 'plan.created', targetType: 'medication_plan', targetId: p!.id, requestId });
  await materialize(deps, now, userId);
  return publicPlan(p!);
}

export async function updatePlan(
  deps: Deps,
  userId: string,
  planId: string,
  patch: z.infer<typeof planUpdateSchema>,
  requestId?: string,
) {
  const plan = await ownedPlan(deps.db, userId, planId);
  const now = deps.clock.now();
  const next = { ...patch, times: patch.times ? [...patch.times].sort() : undefined, updatedAt: now };
  const startDate = patch.startDate ?? plan.startDate;
  const endDate = patch.endDate === undefined ? plan.endDate : patch.endDate;
  if (endDate && endDate < startDate) throw badRequest('End date must be on or after the start date.');
  const [p] = await deps.db.update(medicationPlans).set(next).where(eq(medicationPlans.id, plan.id)).returning();
  // Future reminders are regenerated from the new schedule; history is kept.
  await deps.db
    .delete(reminderOccurrences)
    .where(and(eq(reminderOccurrences.planId, plan.id), eq(reminderOccurrences.status, 'scheduled'), gt(reminderOccurrences.scheduledFor, now)));
  await audit(deps.db, { actorId: userId, action: 'plan.updated', targetType: 'medication_plan', targetId: plan.id, detail: { fields: Object.keys(patch) }, requestId });
  if (p!.active) await materialize(deps, now, userId);
  return publicPlan(p!);
}

export async function stopPlan(deps: Deps, userId: string, planId: string, requestId?: string) {
  return updatePlan(deps, userId, planId, { active: false }, requestId);
}

// ---------------------------------------------------------------- occurrences

/**
 * Create reminder occurrences for today and tomorrow (in each plan's time zone). Idempotent: the
 * unique dedupe key means running this any number of times creates each reminder once.
 */
export async function materialize(deps: Pick<Deps, 'db'>, now: Date, userId?: string): Promise<number> {
  const { db } = deps;
  const planConds = [eq(medicationPlans.active, true)];
  if (userId) planConds.push(eq(medicationPlans.userId, userId));
  const plans = await db.select().from(medicationPlans).where(and(...planConds)).limit(5000);
  const values: (typeof reminderOccurrences.$inferInsert)[] = [];
  for (const p of plans) {
    const today = localDate(now, p.timezone);
    for (const day of [today, addDays(today, 1)]) {
      if (day < p.startDate || (p.endDate && day > p.endDate)) continue;
      for (const time of p.times) {
        const at = zonedDateTimeToUtc(day, time, p.timezone);
        if (at.getTime() < p.createdAt.getTime()) continue;
        values.push({
          userId: p.userId,
          kind: 'medication',
          planId: p.id,
          refCode: refCode(),
          dedupeKey: `med:${p.id}:${at.toISOString()}`,
          scheduledFor: at,
        });
      }
    }
    if (p.refillDate) {
      // Assumption shown in the UI: one reminder at 09:00 local, two days before the refill date the person entered.
      const at = zonedDateTimeToUtc(addDays(p.refillDate, -2), '09:00', p.timezone);
      if (at.getTime() >= p.createdAt.getTime() && at.getTime() - now.getTime() < 2 * 86_400_000) {
        values.push({ userId: p.userId, kind: 'refill', planId: p.id, refCode: refCode(), dedupeKey: `refill:${p.id}:${p.refillDate}`, scheduledFor: at });
      }
    }
  }
  const checkupConds = [eq(checkups.status, 'upcoming'), eq(checkups.remindDayBefore, true), gt(checkups.dueAt, now)];
  if (userId) checkupConds.push(eq(checkups.userId, userId));
  const cks = await db.select().from(checkups).where(and(...checkupConds)).limit(5000);
  for (const c of cks) {
    const at = new Date(c.dueAt.getTime() - 86_400_000);
    if (at.getTime() >= c.createdAt.getTime() && at.getTime() - now.getTime() < 2 * 86_400_000) {
      values.push({ userId: c.userId, kind: 'checkup', checkupId: c.id, refCode: refCode(), dedupeKey: `checkup:${c.id}:${c.dueAt.toISOString()}`, scheduledFor: at });
    }
  }
  if (!values.length) return 0;
  let inserted = 0;
  for (let i = 0; i < values.length; i += 200) {
    const r = await db.insert(reminderOccurrences).values(values.slice(i, i + 200)).onConflictDoNothing({ target: reminderOccurrences.dedupeKey }).returning({ id: reminderOccurrences.id });
    inserted += r.length;
  }
  return inserted;
}

function smsBodyFor(o: Occurrence, lang: string, tz: string, extra: { dueAt?: Date; refillDate?: string | null }) {
  if (o.kind === 'refill') return msg(lang, 'refill_sms', { date: extra.refillDate ?? '' });
  if (o.kind === 'checkup' && extra.dueAt) return msg(lang, 'checkup_sms', { date: localDate(extra.dueAt, tz), time: localTime(extra.dueAt, tz) });
  // Generic by default: no medicine or condition in the SMS body.
  return msg(lang, 'reminder_sms', { ref: o.refCode });
}

async function smsAllowed(deps: Deps, o: Occurrence, plan: Plan | null) {
  if (plan && !plan.smsReminders) return false;
  return hasConsent(deps.db, o.userId, 'sms_messages');
}

async function trySms(deps: Deps, o: Occurrence, body: string, phone: string, now: Date) {
  const r = await sendSms(deps, { to: phone, body, kind: 'routine', userId: o.userId, command: `REMINDER:${o.kind}` });
  const attempts = o.attempts + 1;
  if (r.status !== 'failed') {
    await deps.db.update(reminderOccurrences).set({ deliveryStatus: r.status, attempts, nextAttemptAt: null, lastError: null }).where(eq(reminderOccurrences.id, o.id));
    return true;
  }
  const exhausted = attempts >= MAX_SMS_ATTEMPTS;
  await deps.db
    .update(reminderOccurrences)
    .set({
      deliveryStatus: exhausted ? 'failed' : 'retrying',
      attempts,
      nextAttemptAt: exhausted ? null : new Date(now.getTime() + backoffMs(attempts)),
      lastError: r.error ?? 'send failed',
    })
    .where(eq(reminderOccurrences.id, o.id));
  return false;
}

/** Deliver one due occurrence exactly once (claimed with a conditional update). */
async function deliver(deps: Deps, o: Occurrence, now: Date): Promise<'sent' | 'suppressed' | 'skipped'> {
  if (!(await userHasFeature(deps, o.userId, 'reminders'))) {
    await deps.db.update(reminderOccurrences).set({ deliveryStatus: 'suppressed' }).where(and(eq(reminderOccurrences.id, o.id), eq(reminderOccurrences.status, 'scheduled')));
    return 'suppressed';
  }
  const [claimed] = await deps.db
    .update(reminderOccurrences)
    .set({ status: 'sent', sentAt: now })
    .where(and(eq(reminderOccurrences.id, o.id), eq(reminderOccurrences.status, 'scheduled')))
    .returning();
  if (!claimed) return 'skipped';
  const user = await getUser(deps.db, o.userId);
  const plan = o.planId ? ((await deps.db.select().from(medicationPlans).where(eq(medicationPlans.id, o.planId)))[0] ?? null) : null;
  const checkup = o.checkupId ? ((await deps.db.select().from(checkups).where(eq(checkups.id, o.checkupId)))[0] ?? null) : null;
  let channel = 'web';
  if (user?.phone && (await smsAllowed(deps, claimed, plan))) {
    channel = 'sms';
    await trySms(deps, claimed, smsBodyFor(claimed, user.language, user.timezone, { dueAt: checkup?.dueAt, refillDate: plan?.refillDate }), user.phone, now);
  } else {
    await deps.db.update(reminderOccurrences).set({ deliveryStatus: 'web_only' }).where(eq(reminderOccurrences.id, o.id));
  }
  await deps.db.insert(reminderEvents).values({ occurrenceId: o.id, userId: o.userId, action: 'sent', channel, createdAt: now });
  return 'sent';
}

export interface TickReport {
  materialized: number;
  sent: number;
  suppressed: number;
  retried: number;
  followups: number;
  escalations: number;
  missed: number;
}

/**
 * One pass of the reminder engine. Safe to run concurrently or repeatedly: every state change is a
 * conditional update, so duplicate ticks cannot create duplicate logical outcomes.
 */
export async function runReminderTick(deps: Deps): Promise<TickReport> {
  const now = deps.clock.now();
  const cfg = deps.config;
  const missedMs = cfg.REMINDER_MISSED_MINUTES * 60_000;
  const report: TickReport = { materialized: 0, sent: 0, suppressed: 0, retried: 0, followups: 0, escalations: 0, missed: 0 };
  report.materialized = await materialize(deps, now);

  const due = await deps.db
    .select()
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.status, 'scheduled'),
        ne(reminderOccurrences.deliveryStatus, 'suppressed'),
        lte(reminderOccurrences.scheduledFor, now),
        gt(reminderOccurrences.scheduledFor, new Date(now.getTime() - missedMs)),
      ),
    )
    .orderBy(asc(reminderOccurrences.scheduledFor))
    .limit(200);
  for (const o of due) {
    const r = await deliver(deps, o, now);
    if (r === 'sent') report.sent++;
    if (r === 'suppressed') report.suppressed++;
  }

  // SMS retries with bounded exponential backoff.
  const retry = await deps.db
    .select()
    .from(reminderOccurrences)
    .where(and(eq(reminderOccurrences.deliveryStatus, 'retrying'), eq(reminderOccurrences.status, 'sent'), lte(reminderOccurrences.nextAttemptAt, now)))
    .limit(200);
  for (const o of retry) {
    const user = await getUser(deps.db, o.userId);
    if (!user?.phone || !(await hasConsent(deps.db, o.userId, 'sms_messages'))) continue;
    await trySms(deps, o, msg(user.language, 'reminder_sms', { ref: o.refCode }), user.phone, now);
    report.retried++;
  }

  // Follow-up for unconfirmed medication reminders.
  const followMs = cfg.REMINDER_FOLLOWUP_MINUTES * 60_000;
  const needFollow = await deps.db
    .select()
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.kind, 'medication'),
        eq(reminderOccurrences.status, 'sent'),
        isNull(reminderOccurrences.followupSentAt),
        lte(reminderOccurrences.sentAt, new Date(now.getTime() - followMs)),
      ),
    )
    .limit(200);
  for (const o of needFollow) {
    const [claimed] = await deps.db
      .update(reminderOccurrences)
      .set({ followupSentAt: now })
      .where(and(eq(reminderOccurrences.id, o.id), isNull(reminderOccurrences.followupSentAt), eq(reminderOccurrences.status, 'sent')))
      .returning();
    if (!claimed) continue;
    const user = await getUser(deps.db, o.userId);
    const plan = o.planId ? ((await deps.db.select().from(medicationPlans).where(eq(medicationPlans.id, o.planId)))[0] ?? null) : null;
    let channel = 'web';
    if (user?.phone && (await smsAllowed(deps, o, plan))) {
      channel = 'sms';
      await sendSms(deps, { to: user.phone, body: msg(user.language, 'reminder_followup_sms', { ref: o.refCode }), kind: 'routine', userId: o.userId, command: 'REMINDER:followup' });
    }
    await deps.db.insert(reminderEvents).values({ occurrenceId: o.id, userId: o.userId, action: 'followup', channel, createdAt: now });
    report.followups++;
  }

  // Escalation to consenting caretakers — only when the plan allows it and the link shares reminders.
  const escMs = cfg.REMINDER_ESCALATE_MINUTES * 60_000;
  const needEscalate = await deps.db
    .select()
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.kind, 'medication'),
        eq(reminderOccurrences.status, 'sent'),
        isNull(reminderOccurrences.escalatedAt),
        lte(reminderOccurrences.sentAt, new Date(now.getTime() - escMs)),
      ),
    )
    .limit(200);
  for (const o of needEscalate) {
    const [claimed] = await deps.db
      .update(reminderOccurrences)
      .set({ escalatedAt: now })
      .where(and(eq(reminderOccurrences.id, o.id), isNull(reminderOccurrences.escalatedAt), eq(reminderOccurrences.status, 'sent')))
      .returning();
    if (!claimed || !o.planId) continue;
    const [plan] = await deps.db.select().from(medicationPlans).where(eq(medicationPlans.id, o.planId));
    if (!plan?.caretakerAlerts) continue;
    const links = await deps.db
      .select({ link: careLinks, caretaker: users })
      .from(careLinks)
      .innerJoin(users, eq(users.id, careLinks.caretakerId))
      .where(and(eq(careLinks.patientId, o.userId), eq(careLinks.status, 'active')));
    const eligible = links.filter((l) => l.link.categories.includes('reminders'));
    if (!eligible.length) continue;
    const patient = await getUser(deps.db, o.userId);
    const name = patient?.displayName?.split(' ')[0] || 'your contact';
    let smsSent = 0;
    for (const l of eligible) {
      if (l.caretaker.phone && (await hasConsent(deps.db, l.caretaker.id, 'sms_messages'))) {
        await sendSms(deps, {
          to: l.caretaker.phone,
          body: msg(l.caretaker.language, 'caretaker_alert_sms', { name }),
          kind: 'routine',
          userId: l.caretaker.id,
          command: 'CARETAKER_ALERT',
        });
        smsSent++;
      }
    }
    await deps.db.insert(reminderEvents).values({
      occurrenceId: o.id,
      userId: o.userId,
      action: 'escalated',
      channel: smsSent ? 'sms' : 'web',
      detail: { caretakerIds: eligible.map((l) => l.caretaker.id), smsSent },
      createdAt: now,
    });
    report.escalations++;
  }

  // Mark unconfirmed medication reminders as missed after the configured window.
  const missed = await deps.db
    .update(reminderOccurrences)
    .set({ status: 'missed' })
    .where(
      and(
        eq(reminderOccurrences.kind, 'medication'),
        eq(reminderOccurrences.status, 'sent'),
        lte(reminderOccurrences.sentAt, new Date(now.getTime() - missedMs)),
      ),
    )
    .returning({ id: reminderOccurrences.id, userId: reminderOccurrences.userId });
  if (missed.length) {
    await deps.db.insert(reminderEvents).values(missed.map((m) => ({ occurrenceId: m.id, userId: m.userId, action: 'missed', createdAt: now })));
  }
  report.missed = missed.length;
  return report;
}

// ---------------------------------------------------------------- patient actions

export async function listOccurrences(deps: Deps, userId: string, range: 'today' | 'upcoming' | 'history') {
  const user = await getUser(deps.db, userId);
  if (!user) throw notFound('User');
  const now = deps.clock.now();
  await materialize(deps, now, userId);
  const tz = user.timezone;
  let cond;
  if (range === 'today') {
    const b = localDayBounds(localDate(now, tz), tz);
    cond = and(gte(reminderOccurrences.scheduledFor, b.start), lte(reminderOccurrences.scheduledFor, b.end));
  } else if (range === 'upcoming') {
    cond = and(gt(reminderOccurrences.scheduledFor, now), lte(reminderOccurrences.scheduledFor, new Date(now.getTime() + 7 * 86_400_000)));
  } else {
    cond = and(gte(reminderOccurrences.scheduledFor, new Date(now.getTime() - 30 * 86_400_000)), lte(reminderOccurrences.scheduledFor, now));
  }
  const rows = await deps.db
    .select({ o: reminderOccurrences, plan: medicationPlans, checkup: checkups })
    .from(reminderOccurrences)
    .leftJoin(medicationPlans, eq(medicationPlans.id, reminderOccurrences.planId))
    .leftJoin(checkups, eq(checkups.id, reminderOccurrences.checkupId))
    .where(and(eq(reminderOccurrences.userId, userId), cond))
    .orderBy(range === 'history' ? desc(reminderOccurrences.scheduledFor) : asc(reminderOccurrences.scheduledFor))
    .limit(300);
  return rows.map(({ o, plan, checkup }) => ({
    id: o.id,
    kind: o.kind,
    ref: o.refCode,
    scheduledFor: o.scheduledFor.toISOString(),
    localTime: localTime(o.scheduledFor, tz),
    localDate: localDate(o.scheduledFor, tz),
    status: o.status,
    deliveryStatus: o.deliveryStatus,
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    confirmedChannel: o.confirmedChannel,
    canConfirm: o.kind === 'medication' && ['scheduled', 'sent', 'missed'].includes(o.status) && o.scheduledFor.getTime() <= now.getTime() + 3600_000,
    plan: plan ? { id: plan.id, medicineName: plan.medicineName, doseText: plan.doseText } : null,
    checkup: checkup ? { id: checkup.id, title: checkup.title, dueAt: checkup.dueAt.toISOString() } : null,
  }));
}

/** Open medication reminders a person can answer by SMS/USSD (last 12 hours, not yet answered). */
export async function openOccurrences(deps: Pick<Deps, 'db' | 'clock'>, userId: string) {
  const now = deps.clock.now();
  return deps.db
    .select()
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        eq(reminderOccurrences.kind, 'medication'),
        or(eq(reminderOccurrences.status, 'sent'), and(eq(reminderOccurrences.status, 'scheduled'), lte(reminderOccurrences.scheduledFor, now))),
        gte(reminderOccurrences.scheduledFor, new Date(now.getTime() - 12 * 3600_000)),
      ),
    )
    .orderBy(asc(reminderOccurrences.scheduledFor));
}

/**
 * Record TAKEN or SKIP exactly once. A unique idempotency key on the event and a conditional status
 * update mean retries, double taps and duplicate provider callbacks cannot produce two outcomes.
 */
export async function confirmOccurrence(
  deps: Pick<Deps, 'db' | 'clock'>,
  userId: string,
  occurrenceId: string,
  action: 'taken' | 'skipped',
  channel: 'web' | 'sms' | 'ussd',
): Promise<{ result: 'recorded' | 'already'; status: OccurrenceStatus; ref: string }> {
  const now = deps.clock.now();
  const [o] = await deps.db
    .select()
    .from(reminderOccurrences)
    .where(and(eq(reminderOccurrences.id, occurrenceId), eq(reminderOccurrences.userId, userId)))
    .limit(1);
  if (!o) throw notFound('Reminder');
  if (o.kind !== 'medication') throw badRequest('Only medicine reminders can be marked taken or skipped.');
  if (o.status === 'taken' || o.status === 'skipped') return { result: 'already', status: o.status, ref: o.refCode };
  if (o.scheduledFor.getTime() > now.getTime() + 3600_000) throw badRequest('This reminder is not due yet.');
  const [updated] = await deps.db
    .update(reminderOccurrences)
    .set({ status: action, confirmedAt: now, confirmedChannel: channel })
    .where(and(eq(reminderOccurrences.id, o.id), inArray(reminderOccurrences.status, ['scheduled', 'sent', 'missed'])))
    .returning();
  if (!updated) {
    const [cur] = await deps.db.select().from(reminderOccurrences).where(eq(reminderOccurrences.id, o.id));
    return { result: 'already', status: (cur?.status ?? o.status) as OccurrenceStatus, ref: o.refCode };
  }
  await deps.db
    .insert(reminderEvents)
    .values({
      occurrenceId: o.id,
      userId,
      action,
      channel,
      actorId: userId,
      idempotencyKey: `confirm:${o.id}`,
      detail: o.status === 'missed' ? { late: true } : null,
      createdAt: now,
    })
    .onConflictDoNothing();
  return { result: 'recorded', status: action, ref: o.refCode };
}

/** Let a person correct a mistaken answer; the change is kept in the event log and audit trail. */
export async function correctOccurrence(
  deps: Deps,
  userId: string,
  occurrenceId: string,
  status: 'taken' | 'skipped' | 'missed',
  reason: string,
  requestId?: string,
) {
  const now = deps.clock.now();
  const [o] = await deps.db
    .select()
    .from(reminderOccurrences)
    .where(and(eq(reminderOccurrences.id, occurrenceId), eq(reminderOccurrences.userId, userId)))
    .limit(1);
  if (!o) throw notFound('Reminder');
  if (o.kind !== 'medication' || !['taken', 'skipped', 'missed'].includes(o.status)) {
    throw badRequest('Only answered or missed medicine reminders can be corrected.');
  }
  if (o.status === status) return { status };
  await deps.db.update(reminderOccurrences).set({ status, confirmedAt: now, confirmedChannel: 'web' }).where(eq(reminderOccurrences.id, o.id));
  await deps.db.insert(reminderEvents).values({
    occurrenceId: o.id,
    userId,
    action: 'corrected',
    channel: 'web',
    actorId: userId,
    detail: { from: o.status, to: status, reason },
    createdAt: now,
  });
  await audit(deps.db, { actorId: userId, action: 'reminder.corrected', targetType: 'reminder_occurrence', targetId: o.id, detail: { from: o.status, to: status }, requestId });
  return { status };
}

export async function adherence(deps: Pick<Deps, 'db' | 'clock'>, userId: string, days: number, tz: string) {
  const now = deps.clock.now();
  const from = new Date(now.getTime() - days * 86_400_000);
  const rows = await deps.db
    .select({ status: reminderOccurrences.status, at: reminderOccurrences.scheduledFor })
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        eq(reminderOccurrences.kind, 'medication'),
        gte(reminderOccurrences.scheduledFor, from),
        lte(reminderOccurrences.scheduledFor, now),
      ),
    );
  const summary = adherenceSummary(rows.map((r) => r.status as OccurrenceStatus));
  const byDay = new Map<string, OccurrenceStatus[]>();
  for (const r of rows) {
    const d = localDate(r.at, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), r.status as OccurrenceStatus]);
  }
  return {
    days,
    summary,
    formula: 'taken ÷ (taken + skipped + missed). Reminders not answered yet are shown separately and not counted.',
    daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, st]) => ({ date, ...adherenceSummary(st) })),
  };
}

/** Demo tool: create a reminder due now for a plan and deliver it immediately. */
export async function sendTestReminder(deps: Deps, userId: string, planId: string) {
  const plan = await ownedPlan(deps.db, userId, planId);
  const now = deps.clock.now();
  const [o] = await deps.db
    .insert(reminderOccurrences)
    .values({ userId, kind: 'medication', planId: plan.id, refCode: refCode(), dedupeKey: `test:${randomUUID()}`, scheduledFor: now })
    .returning();
  await deliver(deps, o!, now);
  const [after] = await deps.db.select().from(reminderOccurrences).where(eq(reminderOccurrences.id, o!.id));
  return { id: after!.id, ref: after!.refCode, status: after!.status, deliveryStatus: after!.deliveryStatus };
}
