import { and, desc, eq } from 'drizzle-orm';
import {
  CONSENT_PURPOSES,
  CONSENT_VERSION,
  hasFeature,
  trialEndsAt,
  type Channel,
  type ConsentPurpose,
  type Feature,
  type Role,
  type SubscriptionState,
} from '@medimate/shared';
import type { DB } from '../db/client';
import { careLinks, consents, subscriptions, userRoles, users } from '../db/schema';
import { audit } from '../lib/audit';
import { consentRequired, premiumRequired } from '../lib/errors';
import type { Deps } from '../types';
import { getSettings } from './settings';

export type UserRow = typeof users.$inferSelect;

export async function findUserByPhone(db: DB, phone: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return u ?? null;
}

export async function getUser(db: DB, id: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

/** Pending caretaker invitations addressed to a number now belong to the account that owns it. */
export async function claimCareInvites(db: DB, userId: string, phone: string) {
  await db
    .update(careLinks)
    .set({ caretakerId: userId })
    .where(and(eq(careLinks.invitedPhone, phone), eq(careLinks.status, 'pending')));
}

/**
 * Create an account (patient role + trial). Identity is a phone number (SMS/USSD/phone code),
 * a Firebase identity (email/password or Google), or both once linked.
 */
export async function createUser(
  deps: Pick<Deps, 'db' | 'clock'>,
  identity: { phone?: string; email?: string | null; firebaseUid?: string; emailVerified?: boolean },
  via: Channel,
  opts: { language?: string; displayName?: string | null; isDemo?: boolean } = {},
): Promise<UserRow> {
  const now = deps.clock.now();
  const settings = await getSettings(deps.db);
  return deps.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        phone: identity.phone ?? null,
        email: identity.email ?? null,
        firebaseUid: identity.firebaseUid ?? null,
        emailVerified: identity.emailVerified ?? false,
        createdVia: via,
        language: opts.language ?? 'en',
        displayName: opts.displayName ?? null,
        isDemo: opts.isDemo ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(userRoles).values({ userId: created!.id, role: 'patient' });
    await tx.insert(subscriptions).values({ userId: created!.id, trialStartedAt: now, trialEndsAt: trialEndsAt(now, settings.trialDays) });
    if (identity.phone) await claimCareInvites(tx as unknown as DB, created!.id, identity.phone);
    await audit(tx as unknown as DB, { actorId: created!.id, action: 'user.created', targetType: 'user', targetId: created!.id, detail: { via } });
    return created!;
  });
}

/**
 * Find or create the single account for a phone number. The same account is used whether the
 * person starts on the web, SMS or USSD. New accounts get the patient role and a trial.
 */
export async function findOrCreateUser(
  deps: Pick<Deps, 'db' | 'clock'>,
  phone: string,
  via: Channel,
  opts: { language?: string; displayName?: string; isDemo?: boolean } = {},
): Promise<{ user: UserRow; created: boolean }> {
  const existing = await findUserByPhone(deps.db, phone);
  if (existing) return { user: existing, created: false };
  try {
    return { user: await createUser(deps, { phone }, via, opts), created: true };
  } catch (e) {
    // A concurrent request created the same number first.
    const again = await findUserByPhone(deps.db, phone);
    if (again) return { user: again, created: false };
    throw e;
  }
}

export async function getRoles(db: DB, userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role as Role);
}

export async function grantRole(db: DB, userId: string, role: Role, grantedBy: string | null) {
  await db.insert(userRoles).values({ userId, role, grantedBy }).onConflictDoNothing();
}

export interface ConsentState {
  granted: boolean;
  at: string;
  version: string;
  channel: string;
}

export async function getConsentMap(db: DB, userId: string): Promise<Record<ConsentPurpose, ConsentState | null>> {
  const rows = await db.select().from(consents).where(eq(consents.userId, userId)).orderBy(desc(consents.seq));
  const out = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, null])) as Record<ConsentPurpose, ConsentState | null>;
  for (const r of rows) {
    const p = r.purpose as ConsentPurpose;
    if (p in out && out[p] === null) out[p] = { granted: r.granted, at: r.createdAt.toISOString(), version: r.version, channel: r.channel };
  }
  return out;
}

export async function hasConsent(db: DB, userId: string, purpose: ConsentPurpose): Promise<boolean> {
  const [r] = await db
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.purpose, purpose)))
    .orderBy(desc(consents.seq))
    .limit(1);
  return r?.granted ?? false;
}

/** Consent history is append-only: each change is a new row with version, channel and time. */
export async function setConsent(
  deps: Pick<Deps, 'db' | 'clock'>,
  userId: string,
  purpose: ConsentPurpose,
  granted: boolean,
  channel: Channel,
  scope?: Record<string, unknown>,
  requestId?: string,
) {
  await deps.db.insert(consents).values({
    userId,
    purpose,
    granted,
    version: CONSENT_VERSION,
    channel,
    scope: scope ?? null,
    createdAt: deps.clock.now(),
  });
  await audit(deps.db, {
    actorId: userId,
    action: granted ? 'consent.granted' : 'consent.withdrawn',
    targetType: 'consent',
    targetId: userId,
    detail: { purpose, channel, version: CONSENT_VERSION, ...(scope ? { scope } : {}) },
    requestId,
  });
}

export async function assertConsent(db: DB, userId: string, purpose: ConsentPurpose) {
  if (!(await hasConsent(db, userId, purpose))) throw consentRequired(purpose);
}

export async function getSubscriptionState(db: DB, userId: string): Promise<SubscriptionState> {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  // An account without a subscription row has no trial (deny premium by default).
  return s ? { trialEndsAt: s.trialEndsAt, premiumUntil: s.premiumUntil } : { trialEndsAt: new Date(0), premiumUntil: null };
}

export async function userHasFeature(deps: Pick<Deps, 'db' | 'clock'>, userId: string, feature: Feature): Promise<boolean> {
  const [sub, settings] = await Promise.all([getSubscriptionState(deps.db, userId), getSettings(deps.db)]);
  return hasFeature(feature, sub, deps.clock.now(), settings.premiumFeatures);
}

/** Server-side entitlement enforcement — hiding a button is never enough. */
export async function assertFeature(deps: Pick<Deps, 'db' | 'clock'>, userId: string, feature: Feature) {
  if (!(await userHasFeature(deps, userId, feature))) throw premiumRequired(feature);
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    emailVerified: u.emailVerified,
    hasEmailLogin: u.firebaseUid !== null,
    displayName: u.displayName,
    dateOfBirth: u.dateOfBirth,
    language: u.language,
    area: u.area,
    timezone: u.timezone,
    stepGoal: u.stepGoal,
    waterTargetMl: u.waterTargetMl,
    allergies: u.allergies,
    conditions: u.conditions,
    onboarded: u.onboardedAt !== null,
    isDemo: u.isDemo,
    createdAt: u.createdAt.toISOString(),
  };
}
