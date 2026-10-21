import { STALE_AFTER_HOURS, type StockState } from './constants';

const HOUR = 3_600_000;

/** A stock/price report is stale when it is strictly older than 48 hours. */
export function isStale(updatedAt: Date | string, now: Date, hours = STALE_AFTER_HOURS): boolean {
  return now.getTime() - new Date(updatedAt).getTime() > hours * HOUR;
}

export function ageLabel(updatedAt: Date | string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(updatedAt).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export interface PriceCandidate {
  id: string;
  /** One medicine record = one name + strength + form, so equal ids are comparable. */
  medicineId: string;
  price: number | null;
  stockState: StockState;
  updatedAt: Date | string;
}

/**
 * Ids of the lowest listed price per medicine. Only comparable (same medicine record),
 * non-stale, priced offers that were last reported in stock or low are eligible.
 */
export function lowestPriceIds(items: PriceCandidate[], now: Date): Set<string> {
  const best = new Map<string, number>();
  const eligible = items.filter(
    (i) => i.price !== null && (i.stockState === 'in_stock' || i.stockState === 'low') && !isStale(i.updatedAt, now),
  );
  for (const i of eligible) {
    const cur = best.get(i.medicineId);
    if (cur === undefined || (i.price as number) < cur) best.set(i.medicineId, i.price as number);
  }
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  for (const i of eligible) counts.set(i.medicineId, (counts.get(i.medicineId) ?? 0) + 1);
  for (const i of eligible) {
    // A "lowest" highlight only means something when at least two offers are compared.
    if ((counts.get(i.medicineId) ?? 0) >= 2 && i.price === best.get(i.medicineId)) ids.add(i.id);
  }
  return ids;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
