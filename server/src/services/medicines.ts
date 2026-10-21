import { asc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { medicines, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { medicineLabel, resolveMedicines } from './pharmacy';
import { getSettings } from './settings';

type MedicineRow = typeof medicines.$inferSelect;

export function medicineSummary(m: MedicineRow) {
  return {
    id: m.id,
    label: medicineLabel(m),
    name: m.name,
    genericName: m.genericName,
    strength: m.strength,
    form: m.form,
    infoStatus: m.infoStatus,
    isDemo: m.isDemo,
  };
}

export async function listMedicines(db: DB, q?: string) {
  const rows = q ? await resolveMedicines(db, q, 50) : await db.select().from(medicines).orderBy(asc(medicines.name)).limit(200);
  return rows.map(medicineSummary);
}

/**
 * Public medicine page. Clinical content is only returned once a reviewer has verified it with a
 * recorded source; otherwise we say plainly that reviewed information is not available yet.
 */
export async function getPublicMedicine(db: DB, id: string) {
  const [m] = await db.select().from(medicines).where(eq(medicines.id, id)).limit(1);
  if (!m) throw notFound('Medicine');
  const settings = await getSettings(db);
  let reviewer: string | null = null;
  if (m.reviewedBy) {
    const [r] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, m.reviewedBy));
    reviewer = r?.name ?? 'MEDIMATE reviewer';
  }
  const verified = m.infoStatus === 'verified';
  return {
    ...medicineSummary(m),
    safetyNotice: settings.medicineSafetyNotice,
    information: verified
      ? {
          indications: m.indications,
          usageNotes: m.usageNotes,
          warnings: m.warnings,
          interactions: m.interactions,
          storage: m.storage,
          sideEffects: m.sideEffects,
          source: { authority: m.sourceAuthority, url: m.sourceUrl, versionDate: m.sourceVersionDate },
          reviewedBy: reviewer,
          verifiedAt: m.verifiedAt?.toISOString() ?? null,
        }
      : null,
  };
}
