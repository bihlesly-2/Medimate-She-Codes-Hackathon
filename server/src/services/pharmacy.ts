import { and, asc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  ageLabel,
  haversineKm,
  isOpenAt,
  isStale,
  lowestPriceIds,
  type OpeningHours,
  type PharmacySearch,
  type StockState,
} from '@medimate/shared';
import type { DB } from '../db/client';
import { medicines, pharmacies, pharmacyHours, pharmacyStock } from '../db/schema';
import { notFound } from '../lib/errors';
import type { Deps } from '../types';

type PharmacyRow = typeof pharmacies.$inferSelect;
type MedicineRow = typeof medicines.$inferSelect;

export const todayUtc = (now: Date) => now.toISOString().slice(0, 10);

/** Only admin-approved pharmacies whose verification has not lapsed are ever public. */
export function approvedCondition(now: Date): SQL {
  return and(
    eq(pharmacies.verificationStatus, 'approved'),
    or(isNull(pharmacies.verifiedUntil), gte(pharmacies.verifiedUntil, todayUtc(now))),
  )!;
}

export function medicineLabel(m: Pick<MedicineRow, 'name' | 'strength' | 'form'>): string {
  return [m.name, m.strength, m.form].filter(Boolean).join(' ');
}

/** Match medicines where every word of the query appears in name, generic name, strength or form. */
export async function resolveMedicines(db: DB, query: string, limit = 10): Promise<MedicineRow[]> {
  const tokens = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0)
    .slice(0, 6);
  if (!tokens.length) return [];
  const haystack = sql`lower(${medicines.name} || ' ' || ${medicines.genericName} || ' ' || ${medicines.strength} || ' ' || ${medicines.form})`;
  const conds = tokens.map((t) => sql`${haystack} like ${'%' + t.replace(/[%_\\]/g, '') + '%'}`);
  return db
    .select()
    .from(medicines)
    .where(and(...conds))
    .orderBy(asc(medicines.name), asc(medicines.strength))
    .limit(limit);
}

async function hoursFor(db: DB, ids: string[]): Promise<Map<string, OpeningHours[]>> {
  const map = new Map<string, OpeningHours[]>();
  if (!ids.length) return map;
  const rows = await db.select().from(pharmacyHours).where(inArray(pharmacyHours.pharmacyId, ids));
  for (const r of rows) {
    const list = map.get(r.pharmacyId) ?? [];
    list.push({ weekday: r.weekday, opens: r.opens, closes: r.closes });
    map.set(r.pharmacyId, list);
  }
  return map;
}

function publicPharmacy(p: PharmacyRow, hours: OpeningHours[], now: Date) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    phone: p.phone,
    address: p.address,
    area: p.area,
    town: p.town,
    lat: p.lat,
    lng: p.lng,
    isDemo: p.isDemo,
    verificationStatus: p.verificationStatus,
    verifiedUntil: p.verifiedUntil,
    openNow: isOpenAt(hours, p.timezone, now),
    hours,
  };
}

export interface Offer {
  stockId: string;
  pharmacy: ReturnType<typeof publicPharmacy> & { distanceKm: number | null };
  medicine: { id: string; label: string; name: string; strength: string; form: string };
  price: number | null;
  currency: string;
  stockState: StockState;
  quantity: number | null;
  updatedAt: string;
  ageLabel: string;
  stale: boolean;
  lowest: boolean;
}

export async function searchOffers(deps: Pick<Deps, 'db' | 'clock'>, params: PharmacySearch, opts: { medicineIds?: string[] } = {}) {
  const { db } = deps;
  const now = deps.clock.now();
  const meds = opts.medicineIds?.length
    ? await db.select().from(medicines).where(inArray(medicines.id, opts.medicineIds))
    : params.q
      ? await resolveMedicines(db, params.q, 20)
      : [];
  if ((params.q || opts.medicineIds?.length) && meds.length === 0) {
    return { items: [] as Offer[], total: 0, staleHidden: 0, medicines: [], unknownMedicine: true };
  }
  const conds: SQL[] = [approvedCondition(now)];
  if (meds.length) conds.push(inArray(pharmacyStock.medicineId, meds.map((m) => m.id)));
  if (params.area) {
    const a = `%${params.area.replace(/[%_\\]/g, '')}%`;
    conds.push(or(ilike(pharmacies.area, a), ilike(pharmacies.town, a), ilike(pharmacies.address, a))!);
  }
  const rows = await db
    .select({ s: pharmacyStock, p: pharmacies, m: medicines })
    .from(pharmacyStock)
    .innerJoin(pharmacies, eq(pharmacies.id, pharmacyStock.pharmacyId))
    .innerJoin(medicines, eq(medicines.id, pharmacyStock.medicineId))
    .where(and(...conds))
    .limit(500);

  const hours = await hoursFor(db, [...new Set(rows.map((r) => r.p.id))]);
  const lowest = lowestPriceIds(
    rows.map((r) => ({
      id: r.s.id,
      medicineId: r.m.id,
      price: r.s.price === null ? null : Number(r.s.price),
      stockState: r.s.stockState as StockState,
      updatedAt: r.s.updatedAt,
    })),
    now,
  );
  const origin = params.lat !== undefined && params.lng !== undefined ? { lat: params.lat, lng: params.lng } : null;

  let items: Offer[] = rows.map((r) => {
    const price = r.s.price === null ? null : Number(r.s.price);
    const pharmacy = publicPharmacy(r.p, hours.get(r.p.id) ?? [], now);
    return {
      stockId: r.s.id,
      pharmacy: {
        ...pharmacy,
        distanceKm: origin && r.p.lat !== null && r.p.lng !== null ? Math.round(haversineKm(origin, { lat: r.p.lat, lng: r.p.lng }) * 10) / 10 : null,
      },
      medicine: { id: r.m.id, label: medicineLabel(r.m), name: r.m.name, strength: r.m.strength, form: r.m.form },
      price,
      currency: r.s.currency,
      stockState: r.s.stockState as StockState,
      quantity: r.s.quantity,
      updatedAt: r.s.updatedAt.toISOString(),
      ageLabel: ageLabel(r.s.updatedAt, now),
      stale: isStale(r.s.updatedAt, now),
      lowest: lowest.has(r.s.id),
    };
  });

  const staleCount = items.filter((i) => i.stale).length;
  if (params.includeStale !== 'true') items = items.filter((i) => !i.stale);
  if (params.openNow === 'true') items = items.filter((i) => i.pharmacy.openNow === true);
  if (params.minPrice !== undefined) items = items.filter((i) => i.price !== null && i.price >= params.minPrice!);
  if (params.maxPrice !== undefined) items = items.filter((i) => i.price !== null && i.price <= params.maxPrice!);

  const byFresh = (a: Offer, b: Offer) => b.updatedAt.localeCompare(a.updatedAt);
  const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
  items.sort((a, b) => {
    if (params.sort === 'price') return nullsLast(a.price, b.price) || byFresh(a, b);
    if (params.sort === 'distance') return nullsLast(a.pharmacy.distanceKm, b.pharmacy.distanceKm) || byFresh(a, b);
    return byFresh(a, b);
  });

  const total = items.length;
  return {
    items: items.slice(params.offset, params.offset + params.limit),
    total,
    staleHidden: params.includeStale === 'true' ? 0 : staleCount,
    medicines: meds.map((m) => ({ id: m.id, label: medicineLabel(m) })),
    unknownMedicine: false,
  };
}

export async function listPublicPharmacies(deps: Pick<Deps, 'db' | 'clock'>, area?: string) {
  const now = deps.clock.now();
  const conds: SQL[] = [approvedCondition(now)];
  if (area) {
    const a = `%${area.replace(/[%_\\]/g, '')}%`;
    conds.push(or(ilike(pharmacies.area, a), ilike(pharmacies.town, a))!);
  }
  const rows = await deps.db.select().from(pharmacies).where(and(...conds)).orderBy(asc(pharmacies.name)).limit(200);
  const hours = await hoursFor(deps.db, rows.map((r) => r.id));
  return rows.map((p) => publicPharmacy(p, hours.get(p.id) ?? [], now));
}

export async function getPublicPharmacy(deps: Pick<Deps, 'db' | 'clock'>, id: string) {
  const now = deps.clock.now();
  const [p] = await deps.db
    .select()
    .from(pharmacies)
    .where(and(eq(pharmacies.id, id), approvedCondition(now)))
    .limit(1);
  if (!p) throw notFound('Pharmacy');
  const hours = await hoursFor(deps.db, [p.id]);
  const stock = await deps.db
    .select({ s: pharmacyStock, m: medicines })
    .from(pharmacyStock)
    .innerJoin(medicines, eq(medicines.id, pharmacyStock.medicineId))
    .where(eq(pharmacyStock.pharmacyId, p.id))
    .orderBy(asc(medicines.name));
  return {
    ...publicPharmacy(p, hours.get(p.id) ?? [], now),
    stock: stock.map(({ s, m }) => ({
      stockId: s.id,
      medicine: { id: m.id, label: medicineLabel(m) },
      price: s.price === null ? null : Number(s.price),
      currency: s.currency,
      stockState: s.stockState,
      updatedAt: s.updatedAt.toISOString(),
      ageLabel: ageLabel(s.updatedAt, now),
      stale: isStale(s.updatedAt, now),
    })),
  };
}

export async function pharmacyByCode(deps: Pick<Deps, 'db' | 'clock'>, code: string): Promise<PharmacyRow | null> {
  const [p] = await deps.db
    .select()
    .from(pharmacies)
    .where(and(eq(pharmacies.code, code.toUpperCase()), approvedCondition(deps.clock.now())))
    .limit(1);
  return p ?? null;
}
