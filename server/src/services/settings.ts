import { DEFAULT_TRIAL_DAYS, PREMIUM_FEATURES } from '@medimate/shared';
import type { DB } from '../db/client';
import { appSettings } from '../db/schema';
import { audit } from '../lib/audit';

/** Editable copy is DRAFT pending client, clinical and legal review. */
export const DEFAULT_SETTINGS = {
  trialDays: DEFAULT_TRIAL_DAYS,
  premiumFeatures: [...PREMIUM_FEATURES] as string[],
  /** Placeholder price for the demo; set the real price after business review. */
  premiumPriceXaf: 1000,
  premiumPeriodDays: 30,
  medicineSafetyNotice:
    'Do not take medicine that was not prescribed or recommended for you. If you are unsure, ask a qualified pharmacist or health professional first.',
  healthDisclaimer:
    'MEDIMATE helps you keep track of your own information. It does not diagnose, treat or replace a health professional. If you are worried about a reading or how you feel, contact a qualified health professional.',
};
export type Settings = typeof DEFAULT_SETTINGS;
const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export async function getSettings(db: DB): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) if ((KEYS as string[]).includes(r.key)) out[r.key] = r.value;
  return out as Settings;
}

export async function updateSettings(db: DB, actorId: string, patch: Partial<Settings>, requestId?: string): Promise<Settings> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(KEYS as string[]).includes(key) || value === undefined) continue;
    await db
      .insert(appSettings)
      .values({ key, value: value as never, updatedBy: actorId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: value as never, updatedBy: actorId, updatedAt: new Date() } });
  }
  await audit(db, { actorId, action: 'settings.updated', targetType: 'settings', detail: { keys: Object.keys(patch) }, requestId });
  return getSettings(db);
}
