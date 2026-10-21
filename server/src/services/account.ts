import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { localDate, localTime, VITAL_LABELS, type VitalType } from '@medimate/shared';
import {
  careLinks,
  checkups,
  consents,
  inquiries,
  medicationPlans,
  messages,
  payments,
  reactionLogs,
  reminderOccurrences,
  smsLogs,
  smsSessions,
  stepLogs,
  subscriptions,
  users,
  ussdSessions,
  vitalReadings,
  waterLogs,
} from '../db/schema';
import { audit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { SimplePdf } from '../lib/pdf';
import type { Deps } from '../types';
import { destroyAllSessions } from './auth';
import { adherence, publicPlan } from './reminders';
import { getSettings } from './settings';
import { publicCheckup, publicReaction, publicVital } from './tracking';
import { getUser, publicUser } from './users';

/** Everything MEDIMATE holds about the signed-in person — and nobody else. */
export async function exportAccount(deps: Pick<Deps, 'db' | 'clock'>, userId: string) {
  const user = await getUser(deps.db, userId);
  if (!user) throw notFound('User');
  const [cons, plans, occ, vitals, steps, water, reactions, cks, sub, pays, links, inqs] = await Promise.all([
    deps.db.select().from(consents).where(eq(consents.userId, userId)).orderBy(asc(consents.createdAt)),
    deps.db.select().from(medicationPlans).where(eq(medicationPlans.userId, userId)),
    deps.db.select().from(reminderOccurrences).where(eq(reminderOccurrences.userId, userId)).orderBy(desc(reminderOccurrences.scheduledFor)).limit(5000),
    deps.db.select().from(vitalReadings).where(eq(vitalReadings.userId, userId)),
    deps.db.select().from(stepLogs).where(eq(stepLogs.userId, userId)),
    deps.db.select().from(waterLogs).where(eq(waterLogs.userId, userId)),
    deps.db.select().from(reactionLogs).where(eq(reactionLogs.userId, userId)),
    deps.db.select().from(checkups).where(eq(checkups.userId, userId)),
    deps.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    deps.db.select().from(payments).where(eq(payments.userId, userId)),
    deps.db.select().from(careLinks).where(eq(careLinks.patientId, userId)),
    deps.db.select().from(inquiries).where(eq(inquiries.patientId, userId)),
  ]);
  const msgs = inqs.length ? await deps.db.select().from(messages).where(inArray(messages.inquiryId, inqs.map((i) => i.id))) : [];
  return {
    exportedAt: deps.clock.now().toISOString(),
    note: 'This export contains information you entered into MEDIMATE. It is not a medical record or a diagnosis.',
    profile: publicUser(user),
    consents: cons.map((c) => ({ purpose: c.purpose, granted: c.granted, version: c.version, channel: c.channel, at: c.createdAt.toISOString() })),
    medicationPlans: plans.map(publicPlan),
    reminders: occ.map((o) => ({ kind: o.kind, scheduledFor: o.scheduledFor.toISOString(), status: o.status, confirmedAt: o.confirmedAt?.toISOString() ?? null, channel: o.confirmedChannel })),
    vitals: vitals.map(publicVital),
    steps: steps.map((s) => ({ date: s.localDate, steps: s.steps, source: s.source })),
    water: water.map((w) => ({ at: w.loggedAt.toISOString(), amountMl: w.amountMl, source: w.source })),
    reactions: reactions.map(publicReaction),
    checkups: cks.map(publicCheckup),
    subscription: sub[0] ? { trialEndsAt: sub[0].trialEndsAt.toISOString(), premiumUntil: sub[0].premiumUntil?.toISOString() ?? null } : null,
    payments: pays.map((p) => ({ provider: p.provider, amount: p.amount, currency: p.currency, status: p.status, at: p.createdAt.toISOString() })),
    caretakerLinks: links.map((l) => ({ status: l.status, categories: l.categories, createdAt: l.createdAt.toISOString() })),
    pharmacyConversations: inqs.map((i) => ({
      subject: i.subject,
      status: i.status,
      messages: msgs.filter((m) => m.inquiryId === i.id).map((m) => ({ from: m.senderRole, body: m.body, at: m.createdAt.toISOString() })),
    })),
  };
}

/**
 * Delete the account and the personal records linked to it (cascading foreign keys), plus SMS/USSD
 * session data for the number. Audit entries keep only the pseudonymous user id. Retention, backups
 * and legal holds must be reviewed before production (see SECURITY.md).
 */
export async function deleteAccount(deps: Pick<Deps, 'db' | 'clock'>, userId: string, requestId?: string) {
  const user = await getUser(deps.db, userId);
  if (!user) throw notFound('User');
  await destroyAllSessions(deps, userId);
  if (user.phone) {
    await deps.db.delete(smsLogs).where(eq(smsLogs.phone, user.phone));
    await deps.db.delete(smsSessions).where(eq(smsSessions.phone, user.phone));
    await deps.db.delete(ussdSessions).where(eq(ussdSessions.phone, user.phone));
    await deps.db.delete(careLinks).where(and(eq(careLinks.invitedPhone, user.phone)));
  }
  await deps.db.delete(users).where(eq(users.id, userId));
  await audit(deps.db, { actorId: userId, action: 'user.deleted', targetType: 'user', targetId: userId, requestId });
}

export type ExportSection = 'medicines' | 'adherence' | 'vitals' | 'checkups' | 'reactions';

/** Patient-selected PDF summary for sharing with a clinician. */
export async function historyPdf(deps: Pick<Deps, 'db' | 'clock'>, userId: string, sections: ExportSection[], days: number): Promise<Buffer> {
  const user = await getUser(deps.db, userId);
  if (!user) throw notFound('User');
  const now = deps.clock.now();
  const tz = user.timezone;
  const since = new Date(now.getTime() - days * 86_400_000);
  const settings = await getSettings(deps.db);
  const pdf = new SimplePdf();
  pdf.text('MEDIMATE - Personal health summary', { size: 16, bold: true });
  pdf.text(`Prepared for: ${user.displayName ?? 'MEDIMATE user'}${user.dateOfBirth ? `   Date of birth: ${user.dateOfBirth}` : ''}`);
  pdf.text(`Generated: ${localDate(now, tz)} ${localTime(now, tz)} (${tz})   Period: last ${days} days`);
  pdf.text('All information below was entered by the person themselves (web, SMS or USSD). It is not a diagnosis and has not been checked by MEDIMATE.', { size: 9, gray: true });
  if (user.allergies) pdf.text(`Self-reported allergies: ${user.allergies}`);
  if (user.conditions) pdf.text(`Self-reported conditions: ${user.conditions}`);

  if (sections.includes('medicines')) {
    pdf.heading('Medicines (as entered from the prescription)');
    const plans = await deps.db.select().from(medicationPlans).where(eq(medicationPlans.userId, userId)).orderBy(desc(medicationPlans.active));
    if (!plans.length) pdf.text('No medicines recorded.', { gray: true });
    for (const p of plans) {
      pdf.text(`${p.medicineName} - ${p.doseText} - ${p.frequencyText} at ${p.times.join(', ')}${p.active ? '' : ' (stopped)'}`, { bold: true, size: 10 });
      pdf.text(`From ${p.startDate}${p.endDate ? ` to ${p.endDate}` : ''}${p.notes ? `. Notes: ${p.notes}` : ''}`, { size: 9 });
    }
  }
  if (sections.includes('adherence')) {
    pdf.heading('Reminder answers');
    const a = await adherence(deps, userId, days, tz);
    const s = a.summary;
    pdf.text(`Taken ${s.taken}, skipped ${s.skipped}, missed ${s.missed}, not answered ${s.pending}.${s.rate !== null ? ` Rate: ${Math.round(s.rate * 100)}%.` : ''}`);
    pdf.text(`How this is calculated: ${a.formula}`, { size: 9, gray: true });
  }
  if (sections.includes('vitals')) {
    pdf.heading('Readings');
    const rows = await deps.db
      .select()
      .from(vitalReadings)
      .where(and(eq(vitalReadings.userId, userId), gte(vitalReadings.measuredAt, since)))
      .orderBy(desc(vitalReadings.measuredAt))
      .limit(200);
    if (!rows.length) pdf.text('No readings in this period.', { gray: true });
    for (const v of rows.map(publicVital)) {
      const value = v.type === 'bp' ? `${v.value}/${v.value2}` : String(v.value);
      pdf.text(`${localDate(new Date(v.measuredAt), tz)} ${localTime(new Date(v.measuredAt), tz)}  ${VITAL_LABELS[v.type as VitalType] ?? v.type}: ${value} ${v.unit}  (via ${v.source})`, { size: 9 });
    }
    pdf.text('Units: weight kg, height cm, blood pressure mmHg, glucose mmol/L, heart rate beats per minute, temperature degrees C. Values entered in other units were converted.', { size: 8, gray: true });
  }
  if (sections.includes('checkups')) {
    pdf.heading('Checkups');
    const rows = await deps.db.select().from(checkups).where(and(eq(checkups.userId, userId), gte(checkups.dueAt, since))).orderBy(asc(checkups.dueAt));
    if (!rows.length) pdf.text('No checkups in this period.', { gray: true });
    for (const c of rows) pdf.text(`${localDate(c.dueAt, tz)} ${localTime(c.dueAt, tz)}  ${c.title}${c.location ? ` - ${c.location}` : ''} (${c.status})`, { size: 9 });
  }
  if (sections.includes('reactions')) {
    pdf.heading('Reactions marked "show to my clinician"');
    const rows = await deps.db
      .select()
      .from(reactionLogs)
      .where(and(eq(reactionLogs.userId, userId), eq(reactionLogs.showToClinician, true), gte(reactionLogs.occurredAt, since)))
      .orderBy(desc(reactionLogs.occurredAt));
    if (!rows.length) pdf.text('None.', { gray: true });
    for (const r of rows) {
      pdf.text(`${localDate(r.occurredAt, tz)}  ${r.medicineName ?? ''} - severity described as ${r.severity}`, { bold: true, size: 9 });
      pdf.text(`${r.description}${r.symptoms.length ? ` (${r.symptoms.join(', ')})` : ''}`, { size: 9 });
    }
  }
  pdf.gap(12);
  pdf.text(settings.healthDisclaimer, { size: 8, gray: true });
  return pdf.toBuffer();
}
