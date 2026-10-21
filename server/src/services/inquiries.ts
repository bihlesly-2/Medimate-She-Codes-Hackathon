import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { maskPhone, msg } from '@medimate/shared';
import type { DB } from '../db/client';
import { inquiries, messages, pharmacies, pharmacyStaff, users } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import type { AuthInfo, Deps } from '../types';
import { approvedCondition } from './pharmacy';
import { sendSms } from './messaging';

type Inquiry = typeof inquiries.$inferSelect;

export async function staffPharmacyIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db.select({ id: pharmacyStaff.pharmacyId }).from(pharmacyStaff).where(eq(pharmacyStaff.userId, userId));
  return rows.map((r) => r.id);
}

export async function createInquiry(
  deps: Pick<Deps, 'db' | 'clock'>,
  patientId: string,
  input: { pharmacyId: string; subject: string; body: string },
  channel: 'web' | 'sms' | 'ussd' = 'web',
) {
  const now = deps.clock.now();
  const [p] = await deps.db.select().from(pharmacies).where(and(eq(pharmacies.id, input.pharmacyId), approvedCondition(now))).limit(1);
  if (!p) throw notFound('Pharmacy');
  return deps.db.transaction(async (tx) => {
    const [inq] = await tx
      .insert(inquiries)
      .values({ patientId, pharmacyId: p.id, subject: input.subject, channel, createdAt: now, updatedAt: now })
      .returning();
    await tx.insert(messages).values({ inquiryId: inq!.id, senderId: patientId, senderRole: 'patient', body: input.body, channel, createdAt: now });
    return { id: inq!.id, pharmacy: { id: p.id, name: p.name, phone: p.phone } };
  });
}

export async function listPatientInquiries(db: DB, patientId: string) {
  const rows = await db
    .select({ i: inquiries, p: pharmacies })
    .from(inquiries)
    .innerJoin(pharmacies, eq(pharmacies.id, inquiries.pharmacyId))
    .where(eq(inquiries.patientId, patientId))
    .orderBy(desc(inquiries.updatedAt))
    .limit(100);
  return rows.map(({ i, p }) => ({
    id: i.id,
    subject: i.subject,
    status: i.status,
    channel: i.channel,
    updatedAt: i.updatedAt.toISOString(),
    pharmacy: { id: p.id, name: p.name, phone: p.phone },
  }));
}

/** Patient who owns the thread, or staff of the pharmacy it was sent to. Nobody else. */
async function accessibleInquiry(db: DB, auth: AuthInfo, inquiryId: string): Promise<{ inq: Inquiry; role: 'patient' | 'pharmacy' }> {
  const [inq] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId)).limit(1);
  if (!inq) throw notFound('Conversation');
  if (inq.patientId === auth.userId) return { inq, role: 'patient' };
  const staffOf = await staffPharmacyIds(db, auth.userId);
  if (staffOf.includes(inq.pharmacyId)) return { inq, role: 'pharmacy' };
  throw notFound('Conversation');
}

export async function getThread(deps: Pick<Deps, 'db'>, auth: AuthInfo, inquiryId: string) {
  const { inq, role } = await accessibleInquiry(deps.db, auth, inquiryId);
  const [p] = await deps.db.select().from(pharmacies).where(eq(pharmacies.id, inq.pharmacyId));
  const [patient] = await deps.db.select().from(users).where(eq(users.id, inq.patientId));
  const msgs = await deps.db.select().from(messages).where(eq(messages.inquiryId, inq.id)).orderBy(asc(messages.createdAt));
  return {
    id: inq.id,
    subject: inq.subject,
    status: inq.status,
    channel: inq.channel,
    viewerRole: role,
    pharmacy: { id: p!.id, name: p!.name, phone: p!.phone },
    // Pharmacies see a first name and masked number only — never the patient's health records.
    patient: { displayName: patient?.displayName?.split(' ')[0] ?? 'Patient', phone: maskPhone(patient?.phone ?? '') },
    messages: msgs.map((m) => ({ id: m.id, senderRole: m.senderRole, body: m.body, channel: m.channel, createdAt: m.createdAt.toISOString() })),
  };
}

export async function postMessage(deps: Deps, auth: AuthInfo, inquiryId: string, body: string) {
  const { inq, role } = await accessibleInquiry(deps.db, auth, inquiryId);
  if (inq.status === 'closed') throw badRequest('This conversation is closed.');
  const now = deps.clock.now();
  await deps.db.insert(messages).values({ inquiryId: inq.id, senderId: auth.userId, senderRole: role, body, channel: 'web', createdAt: now });
  await deps.db
    .update(inquiries)
    .set({ status: role === 'pharmacy' ? 'answered' : 'open', updatedAt: now })
    .where(eq(inquiries.id, inq.id));
  if (role === 'pharmacy' && inq.channel !== 'web') {
    const [patient] = await deps.db.select().from(users).where(eq(users.id, inq.patientId));
    const [p] = await deps.db.select().from(pharmacies).where(eq(pharmacies.id, inq.pharmacyId));
    if (patient?.phone && p) {
      const short = body.length > 110 ? `${body.slice(0, 107)}...` : body;
      await sendSms(deps, { to: patient.phone, body: msg(patient.language, 'pharmacy_reply_sms', { pharmacy: p.name, body: short }), kind: 'transactional', userId: patient.id, command: 'PHARMACY_REPLY' });
    }
  }
  return getThread(deps, auth, inq.id);
}

export async function closeInquiry(deps: Deps, auth: AuthInfo, inquiryId: string) {
  const { inq } = await accessibleInquiry(deps.db, auth, inquiryId);
  await deps.db.update(inquiries).set({ status: 'closed', updatedAt: deps.clock.now() }).where(eq(inquiries.id, inq.id));
  return getThread(deps, auth, inq.id);
}

export async function pharmacyInbox(db: DB, pharmacyId: string, status?: string) {
  const conds = [eq(inquiries.pharmacyId, pharmacyId)];
  if (status) conds.push(inArray(inquiries.status, [status]));
  const rows = await db
    .select({ i: inquiries, u: users })
    .from(inquiries)
    .innerJoin(users, eq(users.id, inquiries.patientId))
    .where(and(...conds))
    .orderBy(desc(inquiries.updatedAt))
    .limit(200);
  return rows.map(({ i, u }) => ({
    id: i.id,
    subject: i.subject,
    status: i.status,
    channel: i.channel,
    updatedAt: i.updatedAt.toISOString(),
    patient: { displayName: u.displayName?.split(' ')[0] ?? 'Patient', phone: u.phone ? maskPhone(u.phone) : 'web user' },
  }));
}
