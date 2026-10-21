import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  addDays,
  ageFromDob,
  bmi,
  dateRange,
  localDate,
  localDayBounds,
  localTime,
  normalizeVital,
  streakLength,
  zonedDateTimeToUtc,
  VITAL_TYPES,
  type OccurrenceStatus,
  type VitalType,
} from '@medimate/shared';
import type { z } from 'zod';
import type {
  checkupCreateSchema,
  checkupUpdateSchema,
  reactionCreateSchema,
  vitalCreateSchema,
} from '@medimate/shared';
import type { DB } from '../db/client';
import { checkups, medicationPlans, reactionLogs, reminderOccurrences, stepLogs, vitalReadings, waterLogs } from '../db/schema';
import { audit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import type { Deps } from '../types';
import { adherence } from './reminders';
import { getSettings } from './settings';
import { getUser } from './users';

type Vital = typeof vitalReadings.$inferSelect;

async function requireUser(db: DB, userId: string) {
  const u = await getUser(db, userId);
  if (!u) throw notFound('User');
  return u;
}

// ---------------------------------------------------------------- vitals

export function publicVital(v: Vital) {
  return {
    id: v.id,
    type: v.type,
    value: Number(v.value),
    value2: v.value2 === null ? null : Number(v.value2),
    unit: v.unit,
    enteredValue: v.enteredValue === null ? null : Number(v.enteredValue),
    enteredUnit: v.enteredUnit,
    measuredAt: v.measuredAt.toISOString(),
    source: v.source,
    note: v.note,
  };
}

export async function addVital(
  deps: Pick<Deps, 'db' | 'clock'>,
  userId: string,
  input: z.infer<typeof vitalCreateSchema>,
  source: 'web' | 'sms' | 'ussd' = 'web',
) {
  const r = normalizeVital({ type: input.type, value: input.value, value2: input.value2, unit: input.unit });
  if (!r.ok) throw badRequest(r.error);
  const now = deps.clock.now();
  const measuredAt = input.measuredAt ? new Date(input.measuredAt) : now;
  if (measuredAt.getTime() > now.getTime() + 5 * 60_000) throw badRequest('The time of the reading cannot be in the future.');
  const [v] = await deps.db
    .insert(vitalReadings)
    .values({
      userId,
      type: r.vital.type,
      value: String(r.vital.value),
      value2: r.vital.value2 === null ? null : String(r.vital.value2),
      unit: r.vital.unit,
      enteredValue: String(input.value),
      enteredUnit: input.unit,
      measuredAt,
      source,
      note: input.note ?? null,
      createdAt: now,
    })
    .returning();
  return publicVital(v!);
}

export async function listVitals(db: DB, userId: string, type?: VitalType, limit = 200) {
  const conds = [eq(vitalReadings.userId, userId)];
  if (type) conds.push(eq(vitalReadings.type, type));
  const rows = await db.select().from(vitalReadings).where(and(...conds)).orderBy(desc(vitalReadings.measuredAt)).limit(limit);
  return rows.map(publicVital);
}

export async function deleteVital(db: DB, userId: string, id: string) {
  const r = await db.delete(vitalReadings).where(and(eq(vitalReadings.id, id), eq(vitalReadings.userId, userId))).returning({ id: vitalReadings.id });
  if (!r.length) throw notFound('Reading');
}

/** Neutral overview: latest values and history, no normal/abnormal labels (no approved rule set is configured). */
export async function vitalsOverview(deps: Pick<Deps, 'db' | 'clock'>, userId: string) {
  const user = await requireUser(deps.db, userId);
  const all = await listVitals(deps.db, userId, undefined, 500);
  const latest = Object.fromEntries(VITAL_TYPES.map((t) => [t, all.find((v) => v.type === t) ?? null]));
  const w = latest.weight;
  const h = latest.height;
  const age = user.dateOfBirth ? ageFromDob(user.dateOfBirth, deps.clock.now()) : null;
  const bmiValue = w && h ? bmi(w.value, h.value, age) : null;
  const settings = await getSettings(deps.db);
  return {
    latest,
    series: Object.fromEntries(VITAL_TYPES.map((t) => [t, all.filter((v) => v.type === t).slice(0, 30).reverse()])),
    bmi: {
      value: bmiValue,
      note:
        bmiValue !== null
          ? 'BMI is weight (kg) ÷ height (m)². It is a rough screening number, not a diagnosis.'
          : age === null || age < 18
            ? 'BMI is only shown for adults with a date of birth on their profile; children and teens need age-specific charts.'
            : 'Add a height and a weight to see BMI.',
    },
    rangeRules: null,
    disclaimer: settings.healthDisclaimer,
  };
}

// ---------------------------------------------------------------- steps & water

async function dailyTotals(db: DB, table: 'steps' | 'water', userId: string, from: string, to: string) {
  const rows =
    table === 'steps'
      ? await db
          .select({ date: stepLogs.localDate, total: sql<number>`sum(${stepLogs.steps})::int` })
          .from(stepLogs)
          .where(and(eq(stepLogs.userId, userId), gte(stepLogs.localDate, from), lte(stepLogs.localDate, to)))
          .groupBy(stepLogs.localDate)
      : await db
          .select({ date: waterLogs.localDate, total: sql<number>`sum(${waterLogs.amountMl})::int` })
          .from(waterLogs)
          .where(and(eq(waterLogs.userId, userId), gte(waterLogs.localDate, from), lte(waterLogs.localDate, to)))
          .groupBy(waterLogs.localDate);
  const map = new Map(rows.map((r) => [r.date, Number(r.total)]));
  return dateRange(from, to).map((date) => ({ date, total: map.get(date) ?? 0 }));
}

export async function addSteps(deps: Pick<Deps, 'db' | 'clock'>, userId: string, date: string, steps: number, source: 'web' | 'sms' | 'ussd' = 'web') {
  const user = await requireUser(deps.db, userId);
  const today = localDate(deps.clock.now(), user.timezone);
  if (date > today) throw badRequest('You cannot log steps for a future date.');
  await deps.db.insert(stepLogs).values({ userId, localDate: date, steps, source, createdAt: deps.clock.now() });
  const [t] = await dailyTotals(deps.db, 'steps', userId, date, date);
  return { date, total: t?.total ?? steps, goal: user.stepGoal };
}

export async function addWater(deps: Pick<Deps, 'db' | 'clock'>, userId: string, amountMl: number, loggedAt?: string, source: 'web' | 'sms' | 'ussd' = 'web') {
  const user = await requireUser(deps.db, userId);
  const now = deps.clock.now();
  const at = loggedAt ? new Date(loggedAt) : now;
  if (at.getTime() > now.getTime() + 5 * 60_000) throw badRequest('The time cannot be in the future.');
  const date = localDate(at, user.timezone);
  const [row] = await deps.db.insert(waterLogs).values({ userId, amountMl, loggedAt: at, localDate: date, source, createdAt: now }).returning();
  const [t] = await dailyTotals(deps.db, 'water', userId, date, date);
  return { id: row!.id, date, total: t?.total ?? amountMl, target: user.waterTargetMl };
}

export async function deleteWater(db: DB, userId: string, id: string) {
  const r = await db.delete(waterLogs).where(and(eq(waterLogs.id, id), eq(waterLogs.userId, userId))).returning({ id: waterLogs.id });
  if (!r.length) throw notFound('Water entry');
}

export async function activitySummary(deps: Pick<Deps, 'db' | 'clock'>, userId: string, kind: 'steps' | 'water', days = 14) {
  const user = await requireUser(deps.db, userId);
  const today = localDate(deps.clock.now(), user.timezone);
  const from = addDays(today, -(days - 1));
  const daily = await dailyTotals(deps.db, kind, userId, from, today);
  const goal = kind === 'steps' ? user.stepGoal : user.waterTargetMl;
  const todayEntries =
    kind === 'water'
      ? (
          await deps.db
            .select()
            .from(waterLogs)
            .where(and(eq(waterLogs.userId, userId), eq(waterLogs.localDate, today)))
            .orderBy(desc(waterLogs.loggedAt))
        ).map((w) => ({ id: w.id, amountMl: w.amountMl, loggedAt: w.loggedAt.toISOString(), source: w.source }))
      : (
          await deps.db
            .select()
            .from(stepLogs)
            .where(and(eq(stepLogs.userId, userId), eq(stepLogs.localDate, today)))
            .orderBy(desc(stepLogs.createdAt))
        ).map((s) => ({ id: s.id, steps: s.steps, source: s.source, createdAt: s.createdAt.toISOString() }));
  const todayTotal = daily.at(-1)?.total ?? 0;
  // Today only counts toward the streak once the goal is reached; an unfinished today never breaks it.
  const streak = streakLength(daily.map((d) => ({ date: d.date, met: d.date === today && d.total < goal ? null : d.total >= goal })));
  return { today, todayTotal, goal, daily, streak, todayEntries };
}

// ---------------------------------------------------------------- reactions

type ReactionInput = z.infer<typeof reactionCreateSchema>;

export function publicReaction(r: typeof reactionLogs.$inferSelect) {
  return {
    id: r.id,
    description: r.description,
    symptoms: r.symptoms,
    severity: r.severity,
    occurredAt: r.occurredAt.toISOString(),
    medicineName: r.medicineName,
    showToClinician: r.showToClinician,
  };
}

export async function addReaction(deps: Pick<Deps, 'db' | 'clock'>, userId: string, input: ReactionInput) {
  if (new Date(input.occurredAt).getTime() > deps.clock.now().getTime() + 5 * 60_000) throw badRequest('The time cannot be in the future.');
  const [r] = await deps.db
    .insert(reactionLogs)
    .values({
      userId,
      description: input.description,
      symptoms: input.symptoms,
      severity: input.severity,
      occurredAt: new Date(input.occurredAt),
      medicineName: input.medicineName ?? null,
      showToClinician: input.showToClinician,
      createdAt: deps.clock.now(),
    })
    .returning();
  return publicReaction(r!);
}

export async function listReactions(db: DB, userId: string) {
  return (await db.select().from(reactionLogs).where(eq(reactionLogs.userId, userId)).orderBy(desc(reactionLogs.occurredAt)).limit(200)).map(publicReaction);
}

export async function updateReactionFlag(db: DB, userId: string, id: string, showToClinician: boolean) {
  const r = await db.update(reactionLogs).set({ showToClinician }).where(and(eq(reactionLogs.id, id), eq(reactionLogs.userId, userId))).returning();
  if (!r.length) throw notFound('Reaction');
  return publicReaction(r[0]!);
}

export async function deleteReaction(db: DB, userId: string, id: string) {
  const r = await db.delete(reactionLogs).where(and(eq(reactionLogs.id, id), eq(reactionLogs.userId, userId))).returning({ id: reactionLogs.id });
  if (!r.length) throw notFound('Reaction');
}

// ---------------------------------------------------------------- checkups

export function publicCheckup(c: typeof checkups.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    dueAt: c.dueAt.toISOString(),
    location: c.location,
    notes: c.notes,
    remindDayBefore: c.remindDayBefore,
    status: c.status,
  };
}

export async function listCheckups(db: DB, userId: string) {
  return (await db.select().from(checkups).where(eq(checkups.userId, userId)).orderBy(asc(checkups.dueAt)).limit(200)).map(publicCheckup);
}

export async function createCheckup(deps: Pick<Deps, 'db' | 'clock'>, userId: string, input: z.infer<typeof checkupCreateSchema>, requestId?: string) {
  const user = await requireUser(deps.db, userId);
  const now = deps.clock.now();
  const [c] = await deps.db
    .insert(checkups)
    .values({
      userId,
      title: input.title,
      dueAt: zonedDateTimeToUtc(input.dueDate, input.dueTime, user.timezone),
      location: input.location ?? null,
      notes: input.notes ?? null,
      remindDayBefore: input.remindDayBefore,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await audit(deps.db, { actorId: userId, action: 'checkup.created', targetType: 'checkup', targetId: c!.id, requestId });
  return publicCheckup(c!);
}

export async function updateCheckup(deps: Pick<Deps, 'db' | 'clock'>, userId: string, id: string, patch: z.infer<typeof checkupUpdateSchema>) {
  const user = await requireUser(deps.db, userId);
  const [cur] = await deps.db.select().from(checkups).where(and(eq(checkups.id, id), eq(checkups.userId, userId)));
  if (!cur) throw notFound('Checkup');
  const set: Partial<typeof checkups.$inferInsert> = { updatedAt: deps.clock.now() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.location !== undefined) set.location = patch.location;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.remindDayBefore !== undefined) set.remindDayBefore = patch.remindDayBefore;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.dueDate || patch.dueTime) {
    const tz = user.timezone;
    set.dueAt = zonedDateTimeToUtc(patch.dueDate ?? localDate(cur.dueAt, tz), patch.dueTime ?? localTime(cur.dueAt, tz), tz);
  }
  const [c] = await deps.db.update(checkups).set(set).where(eq(checkups.id, id)).returning();
  if (set.dueAt || set.status) {
    await deps.db.delete(reminderOccurrences).where(and(eq(reminderOccurrences.checkupId, id), eq(reminderOccurrences.status, 'scheduled')));
  }
  return publicCheckup(c!);
}

// ---------------------------------------------------------------- history & progress

export type TimelineType = 'reminder' | 'vital' | 'checkup' | 'reaction';

export async function timeline(
  deps: Pick<Deps, 'db' | 'clock'>,
  userId: string,
  opts: { types?: TimelineType[]; from?: string; to?: string },
) {
  const user = await requireUser(deps.db, userId);
  const tz = user.timezone;
  const now = deps.clock.now();
  const to = opts.to ? localDayBounds(opts.to, tz).end : now;
  const from = opts.from ? localDayBounds(opts.from, tz).start : new Date(now.getTime() - 90 * 86_400_000);
  const types = opts.types?.length ? opts.types : (['reminder', 'vital', 'checkup', 'reaction'] as TimelineType[]);
  const items: { type: TimelineType; at: string; title: string; detail: string; status?: string }[] = [];

  if (types.includes('reminder')) {
    const rows = await deps.db
      .select({ o: reminderOccurrences, plan: medicationPlans })
      .from(reminderOccurrences)
      .leftJoin(medicationPlans, eq(medicationPlans.id, reminderOccurrences.planId))
      .where(
        and(
          eq(reminderOccurrences.userId, userId),
          eq(reminderOccurrences.kind, 'medication'),
          inArray(reminderOccurrences.status, ['taken', 'skipped', 'missed']),
          gte(reminderOccurrences.scheduledFor, from),
          lte(reminderOccurrences.scheduledFor, to),
        ),
      )
      .limit(500);
    for (const { o, plan } of rows) {
      items.push({
        type: 'reminder',
        at: o.scheduledFor.toISOString(),
        title: plan?.medicineName ?? 'Medicine reminder',
        detail: plan?.doseText ?? '',
        status: o.status as OccurrenceStatus,
      });
    }
  }
  if (types.includes('vital')) {
    const rows = await deps.db
      .select()
      .from(vitalReadings)
      .where(and(eq(vitalReadings.userId, userId), gte(vitalReadings.measuredAt, from), lte(vitalReadings.measuredAt, to)))
      .limit(500);
    for (const v of rows.map(publicVital)) {
      items.push({
        type: 'vital',
        at: v.measuredAt,
        title: v.type,
        detail: v.type === 'bp' ? `${v.value}/${v.value2} ${v.unit}` : `${v.value} ${v.unit}`,
      });
    }
  }
  if (types.includes('checkup')) {
    const rows = await deps.db
      .select()
      .from(checkups)
      .where(and(eq(checkups.userId, userId), gte(checkups.dueAt, from), lte(checkups.dueAt, to)))
      .limit(200);
    for (const c of rows) items.push({ type: 'checkup', at: c.dueAt.toISOString(), title: c.title, detail: c.location ?? '', status: c.status });
  }
  if (types.includes('reaction')) {
    const rows = await deps.db
      .select()
      .from(reactionLogs)
      .where(and(eq(reactionLogs.userId, userId), gte(reactionLogs.occurredAt, from), lte(reactionLogs.occurredAt, to)))
      .limit(200);
    for (const r of rows) items.push({ type: 'reaction', at: r.occurredAt.toISOString(), title: r.medicineName ?? 'Reaction', detail: r.description, status: r.severity });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  return { timezone: tz, items: items.slice(0, 500) };
}

export async function progress(deps: Pick<Deps, 'db' | 'clock'>, userId: string) {
  const user = await requireUser(deps.db, userId);
  const tz = user.timezone;
  const now = deps.clock.now();
  const today = localDate(now, tz);
  const from = addDays(today, -29);
  const rows = await deps.db
    .select({ status: reminderOccurrences.status, at: reminderOccurrences.scheduledFor })
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        eq(reminderOccurrences.kind, 'medication'),
        gte(reminderOccurrences.scheduledFor, localDayBounds(from, tz).start),
        lte(reminderOccurrences.scheduledFor, now),
      ),
    );
  const byDay = new Map<string, string[]>();
  for (const r of rows) byDay.set(localDate(r.at, tz), [...(byDay.get(localDate(r.at, tz)) ?? []), r.status]);
  const medDays = dateRange(from, today).map((date) => {
    const st = byDay.get(date);
    if (!st?.length) return { date, met: null };
    if (st.some((s) => s === 'scheduled' || s === 'sent')) return { date, met: date === today ? null : false };
    return { date, met: st.every((s) => s === 'taken') };
  });
  const [steps, water, week, month] = await Promise.all([
    activitySummary(deps, userId, 'steps', 30),
    activitySummary(deps, userId, 'water', 30),
    adherence(deps, userId, 7, tz),
    adherence(deps, userId, 30, tz),
  ]);
  return {
    medication: { streak: streakLength(medDays), days: medDays, week, month },
    steps: { streak: steps.streak, goal: steps.goal },
    water: { streak: water.streak, goal: water.goal },
    note: 'Streaks count days in a row. A day with nothing scheduled does not break a streak.',
  };
}
