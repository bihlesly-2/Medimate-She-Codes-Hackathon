import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { ageLabel, isStale, normalizePhone, validateStockCsv, type CsvIssue } from '@medimate/shared';
import type { z } from 'zod';
import type { pharmacyProfileSchema, stockUpsertSchema, verificationSubmitSchema } from '@medimate/shared';
import type { DB } from '../db/client';
import {
  inquiries,
  medicines,
  messages,
  pharmacies,
  pharmacyHours,
  pharmacyStaff,
  pharmacyStock,
  pharmacyVerifications,
  reports,
  stockEvents,
} from '../db/schema';
import { audit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { Deps } from '../types';
import { medicineLabel } from './pharmacy';
import { grantRole } from './users';

type Pharmacy = typeof pharmacies.$inferSelect;

/** Every portal operation is scoped to the signed-in staff member's own pharmacy (tenant isolation). */
export async function myPharmacy(db: DB, userId: string): Promise<Pharmacy> {
  const [row] = await db
    .select({ p: pharmacies })
    .from(pharmacyStaff)
    .innerJoin(pharmacies, eq(pharmacies.id, pharmacyStaff.pharmacyId))
    .where(eq(pharmacyStaff.userId, userId))
    .limit(1);
  if (!row) throw forbidden('Your account is not linked to a pharmacy.');
  return row.p;
}

async function hoursOf(db: DB, pharmacyId: string) {
  return (await db.select().from(pharmacyHours).where(eq(pharmacyHours.pharmacyId, pharmacyId)).orderBy(asc(pharmacyHours.weekday))).map((h) => ({
    weekday: h.weekday,
    opens: h.opens,
    closes: h.closes,
  }));
}

export async function portalProfile(db: DB, userId: string) {
  const p = await myPharmacy(db, userId);
  const history = await db.select().from(pharmacyVerifications).where(eq(pharmacyVerifications.pharmacyId, p.id)).orderBy(desc(pharmacyVerifications.createdAt));
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    phone: p.phone,
    address: p.address,
    area: p.area,
    town: p.town,
    isDemo: p.isDemo,
    verificationStatus: p.verificationStatus,
    verifiedUntil: p.verifiedUntil,
    hours: await hoursOf(db, p.id),
    verificationHistory: history.map((h) => ({
      id: h.id,
      status: h.status,
      notes: h.notes,
      licenceNumber: h.licenceNumber,
      documentReference: h.documentReference,
      validUntil: h.validUntil,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

async function uniqueCode(db: DB, area: string): Promise<string> {
  const prefix = (area.replace(/[^A-Za-z]/g, '').toUpperCase() + 'PHX').slice(0, 3);
  for (let n = 1; n < 1000; n++) {
    const code = `${prefix}${n}`;
    const [hit] = await db.select({ id: pharmacies.id }).from(pharmacies).where(eq(pharmacies.code, code));
    if (!hit) return code;
  }
  throw conflict('Could not allocate a pharmacy code.');
}

/** A new pharmacy starts as a draft and is never public until an admin approves its verification. */
export async function registerPharmacy(deps: Deps, userId: string, input: z.infer<typeof pharmacyProfileSchema>, requestId?: string) {
  const existing = await deps.db.select().from(pharmacyStaff).where(eq(pharmacyStaff.userId, userId));
  if (existing.length) throw conflict('Your account is already linked to a pharmacy.');
  const phone = normalizePhone(input.phone);
  if (!phone) throw badRequest('Enter a valid pharmacy phone number.');
  const now = deps.clock.now();
  const code = await uniqueCode(deps.db, input.area);
  const [p] = await deps.db
    .insert(pharmacies)
    .values({ code, name: input.name, phone, address: input.address, area: input.area, town: input.town, verificationStatus: 'draft', createdAt: now, updatedAt: now })
    .returning();
  await deps.db.insert(pharmacyStaff).values({ userId, pharmacyId: p!.id });
  if (input.hours.length) await deps.db.insert(pharmacyHours).values(input.hours.map((h) => ({ ...h, pharmacyId: p!.id })));
  await grantRole(deps.db, userId, 'pharmacy', userId);
  await audit(deps.db, { actorId: userId, action: 'pharmacy.registered', targetType: 'pharmacy', targetId: p!.id, requestId });
  return portalProfile(deps.db, userId);
}

export async function updateProfile(deps: Deps, userId: string, input: z.infer<typeof pharmacyProfileSchema>, requestId?: string) {
  const p = await myPharmacy(deps.db, userId);
  const phone = normalizePhone(input.phone);
  if (!phone) throw badRequest('Enter a valid pharmacy phone number.');
  await deps.db
    .update(pharmacies)
    .set({ name: input.name, phone, address: input.address, area: input.area, town: input.town, updatedAt: deps.clock.now() })
    .where(eq(pharmacies.id, p.id));
  await deps.db.delete(pharmacyHours).where(eq(pharmacyHours.pharmacyId, p.id));
  if (input.hours.length) await deps.db.insert(pharmacyHours).values(input.hours.map((h) => ({ ...h, pharmacyId: p.id })));
  await audit(deps.db, { actorId: userId, action: 'pharmacy.profile_updated', targetType: 'pharmacy', targetId: p.id, requestId });
  return portalProfile(deps.db, userId);
}

export async function submitVerification(deps: Deps, userId: string, input: z.infer<typeof verificationSubmitSchema>, requestId?: string) {
  const p = await myPharmacy(deps.db, userId);
  if (p.verificationStatus === 'pending') throw conflict('A verification request is already waiting for review.');
  // An approved pharmacy stays public while its renewal is reviewed; anything else waits as pending.
  if (p.verificationStatus !== 'approved') {
    await deps.db.update(pharmacies).set({ verificationStatus: 'pending', updatedAt: deps.clock.now() }).where(eq(pharmacies.id, p.id));
  }
  await deps.db.insert(pharmacyVerifications).values({
    pharmacyId: p.id,
    status: 'submitted',
    actorId: userId,
    licenceNumber: input.licenceNumber,
    documentReference: input.documentReference,
    notes: input.notes ?? null,
    createdAt: deps.clock.now(),
  });
  await audit(deps.db, { actorId: userId, action: 'pharmacy.verification_submitted', targetType: 'pharmacy', targetId: p.id, requestId });
  return portalProfile(deps.db, userId);
}

export async function listMyStock(deps: Pick<Deps, 'db' | 'clock'>, userId: string) {
  const p = await myPharmacy(deps.db, userId);
  const now = deps.clock.now();
  const rows = await deps.db
    .select({ s: pharmacyStock, m: medicines })
    .from(pharmacyStock)
    .innerJoin(medicines, eq(medicines.id, pharmacyStock.medicineId))
    .where(eq(pharmacyStock.pharmacyId, p.id))
    .orderBy(asc(medicines.name));
  return rows.map(({ s, m }) => ({
    id: s.id,
    medicine: { id: m.id, label: medicineLabel(m) },
    price: s.price === null ? null : Number(s.price),
    currency: s.currency,
    stockState: s.stockState,
    quantity: s.quantity,
    updatedAt: s.updatedAt.toISOString(),
    ageLabel: ageLabel(s.updatedAt, now),
    stale: isStale(s.updatedAt, now),
  }));
}

async function writeStock(
  db: DB,
  pharmacyId: string,
  actorId: string,
  now: Date,
  row: { medicineId: string; price: number | null; stockState: string; quantity: number | null },
  source: 'manual' | 'csv',
) {
  const values = {
    pharmacyId,
    medicineId: row.medicineId,
    price: row.price === null ? null : row.price.toFixed(2),
    stockState: row.stockState,
    quantity: row.quantity,
    updatedAt: now,
    updatedBy: actorId,
  };
  const [s] = await db
    .insert(pharmacyStock)
    .values(values)
    .onConflictDoUpdate({
      target: [pharmacyStock.pharmacyId, pharmacyStock.medicineId],
      set: { price: values.price, stockState: values.stockState, quantity: values.quantity, updatedAt: now, updatedBy: actorId },
    })
    .returning();
  await db.insert(stockEvents).values({
    stockId: s!.id,
    pharmacyId,
    medicineId: row.medicineId,
    price: values.price,
    stockState: row.stockState,
    quantity: row.quantity,
    actorId,
    source,
    createdAt: now,
  });
  return s!;
}

export async function upsertStock(deps: Deps, userId: string, input: z.infer<typeof stockUpsertSchema>, requestId?: string) {
  const p = await myPharmacy(deps.db, userId);
  const [m] = await deps.db.select({ id: medicines.id }).from(medicines).where(eq(medicines.id, input.medicineId));
  if (!m) throw notFound('Medicine');
  const s = await writeStock(deps.db, p.id, userId, deps.clock.now(), { medicineId: m.id, price: input.price, stockState: input.stockState, quantity: input.quantity ?? null }, 'manual');
  await audit(deps.db, { actorId: userId, action: 'stock.updated', targetType: 'pharmacy_stock', targetId: s.id, detail: { pharmacyId: p.id, stockState: input.stockState }, requestId });
  return listMyStock(deps, userId);
}

export async function deleteStock(deps: Deps, userId: string, stockId: string, requestId?: string) {
  const p = await myPharmacy(deps.db, userId);
  const r = await deps.db.delete(pharmacyStock).where(and(eq(pharmacyStock.id, stockId), eq(pharmacyStock.pharmacyId, p.id))).returning({ id: pharmacyStock.id });
  if (!r.length) throw notFound('Stock item');
  await audit(deps.db, { actorId: userId, action: 'stock.removed', targetType: 'pharmacy_stock', targetId: stockId, detail: { pharmacyId: p.id }, requestId });
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/**
 * CSV import with preview. Rows are validated structurally (shared) then matched to the catalogue.
 * Commit is refused while any row has an issue, so the pharmacy fixes errors first.
 */
export async function importStockCsv(deps: Deps, userId: string, csv: string, commit: boolean, requestId?: string) {
  const p = await myPharmacy(deps.db, userId);
  const { rows, issues } = validateStockCsv(csv);
  const allIssues: CsvIssue[] = [...issues];
  const catalogue = await deps.db.select().from(medicines);
  const existing = new Set((await deps.db.select({ m: pharmacyStock.medicineId }).from(pharmacyStock).where(eq(pharmacyStock.pharmacyId, p.id))).map((r) => r.m));
  const valid: { line: number; medicineId: string; label: string; price: number | null; stockState: string; quantity: number | null; change: 'new' | 'update' }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const candidates = catalogue.filter(
      (m) =>
        (norm(m.name) === norm(r.medicine) || norm(m.genericName) === norm(r.medicine)) &&
        (!r.strength || norm(m.strength) === norm(r.strength)) &&
        (!r.form || norm(m.form) === norm(r.form)),
    );
    if (candidates.length === 0) {
      const label = [r.medicine, r.strength, r.form].filter(Boolean).join(' ');
      allIssues.push({ line: r.line, message: `"${label}" is not in the MEDIMATE catalogue. Check the spelling, or ask an admin to add it.` });
      continue;
    }
    if (candidates.length > 1) {
      allIssues.push({ line: r.line, message: `"${r.medicine}" matches ${candidates.length} catalogue items. Add the strength and form columns.` });
      continue;
    }
    const m = candidates[0]!;
    if (seen.has(m.id)) {
      allIssues.push({ line: r.line, message: `${medicineLabel(m)} appears more than once in this file.` });
      continue;
    }
    seen.add(m.id);
    valid.push({ line: r.line, medicineId: m.id, label: medicineLabel(m), price: r.price, stockState: r.stockState, quantity: r.quantity, change: existing.has(m.id) ? 'update' : 'new' });
  }
  allIssues.sort((a, b) => a.line - b.line);
  if (!commit) return { committed: false, valid, issues: allIssues };
  if (allIssues.length) throw badRequest('Fix the rows with issues before importing.', allIssues);
  if (!valid.length) throw badRequest('There are no rows to import.');
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    for (const v of valid) await writeStock(tx as unknown as DB, p.id, userId, now, v, 'csv');
  });
  await audit(deps.db, { actorId: userId, action: 'stock.csv_imported', targetType: 'pharmacy', targetId: p.id, detail: { rows: valid.length }, requestId });
  return { committed: true, valid, issues: [] };
}

/** Operational analytics computed only from recorded events — no decorative numbers. */
export async function analytics(deps: Pick<Deps, 'db' | 'clock'>, userId: string) {
  const p = await myPharmacy(deps.db, userId);
  const now = deps.clock.now();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const byStatus = await deps.db
    .select({ status: inquiries.status, n: count() })
    .from(inquiries)
    .where(and(eq(inquiries.pharmacyId, p.id), gte(inquiries.createdAt, since)))
    .groupBy(inquiries.status);
  const inq = await deps.db.select({ id: inquiries.id, createdAt: inquiries.createdAt }).from(inquiries).where(and(eq(inquiries.pharmacyId, p.id), gte(inquiries.createdAt, since)));
  let responseMinutes: number[] = [];
  if (inq.length) {
    const firstReplies = await deps.db
      .select({ inquiryId: messages.inquiryId, first: sql<Date>`min(${messages.createdAt})` })
      .from(messages)
      .where(and(inArray(messages.inquiryId, inq.map((i) => i.id)), eq(messages.senderRole, 'pharmacy')))
      .groupBy(messages.inquiryId);
    const created = new Map(inq.map((i) => [i.id, i.createdAt.getTime()]));
    responseMinutes = firstReplies.map((r) => (new Date(r.first).getTime() - (created.get(r.inquiryId) ?? 0)) / 60_000);
  }
  const stock = await listMyStock(deps, userId);
  const [updates] = await deps.db.select({ n: count() }).from(stockEvents).where(and(eq(stockEvents.pharmacyId, p.id), gte(stockEvents.createdAt, since)));
  const reportRows = await deps.db.select({ status: reports.status, n: count() }).from(reports).where(eq(reports.pharmacyId, p.id)).groupBy(reports.status);
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return Math.round(s[Math.floor(s.length / 2)]!);
  };
  return {
    periodDays: 30,
    inquiries: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
    medianFirstReplyMinutes: median(responseMinutes),
    stock: { items: stock.length, stale: stock.filter((s) => s.stale).length, updatesLast30Days: Number(updates?.n ?? 0) },
    reports: Object.fromEntries(reportRows.map((r) => [r.status, Number(r.n)])),
    source: 'Calculated from MEDIMATE events for your pharmacy only.',
  };
}
