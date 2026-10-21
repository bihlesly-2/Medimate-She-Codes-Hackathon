export const PREMIUM_FEATURES = ['reminders', 'vitals', 'steps', 'water', 'streaks', 'history_export'] as const;
export const FREE_FEATURES = ['pharmacy_finder', 'price_compare', 'medicine_info', 'pharmacy_contact'] as const;
export type Feature = (typeof PREMIUM_FEATURES)[number] | (typeof FREE_FEATURES)[number];

export const DEFAULT_TRIAL_DAYS = 30;

export interface SubscriptionState {
  trialEndsAt: Date;
  premiumUntil: Date | null;
}

export type AccessTier = 'trial' | 'premium' | 'free';

export function trialEndsAt(accountCreatedAt: Date, trialDays: number): Date {
  return new Date(accountCreatedAt.getTime() + trialDays * 86_400_000);
}

/**
 * Server time is authoritative. The trial is active while now < trialEndsAt —
 * at the exact expiry instant the account is no longer in trial.
 */
export function accessTier(sub: SubscriptionState, now: Date): AccessTier {
  if (sub.premiumUntil && now.getTime() < sub.premiumUntil.getTime()) return 'premium';
  if (now.getTime() < sub.trialEndsAt.getTime()) return 'trial';
  return 'free';
}

export function hasFeature(
  feature: Feature,
  sub: SubscriptionState,
  now: Date,
  premiumFeatures: readonly string[] = PREMIUM_FEATURES,
): boolean {
  if (!premiumFeatures.includes(feature)) return true;
  return accessTier(sub, now) !== 'free';
}

export function daysLeft(until: Date, now: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000));
}
