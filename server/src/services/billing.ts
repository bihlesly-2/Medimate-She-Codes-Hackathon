import { and, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { accessTier, daysLeft } from '@medimate/shared';
import { payments, subscriptions } from '../db/schema';
import { audit } from '../lib/audit';
import { safeEqual } from '../lib/crypto';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import type { PaymentStatus } from '../providers/payments';
import type { Deps } from '../types';
import { getSettings } from './settings';
import { getSubscriptionState } from './users';

type Payment = typeof payments.$inferSelect;
const FINAL: PaymentStatus[] = ['successful', 'failed', 'expired'];
/** Fapshi allows at most 6 status checks per minute per transaction; we stay well below that. */
const STATUS_CHECK_INTERVAL_MS = 15_000;

export async function subscriptionStatus(deps: Pick<Deps, 'db' | 'clock' | 'config'>, userId: string) {
  const now = deps.clock.now();
  const [sub, settings] = await Promise.all([getSubscriptionState(deps.db, userId), getSettings(deps.db)]);
  const tier = accessTier(sub, now);
  const recent = await deps.db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).limit(10);
  return {
    tier,
    trialEndsAt: sub.trialEndsAt.toISOString(),
    premiumUntil: sub.premiumUntil?.toISOString() ?? null,
    daysLeft: tier === 'trial' ? daysLeft(sub.trialEndsAt, now) : tier === 'premium' && sub.premiumUntil ? daysLeft(sub.premiumUntil, now) : 0,
    premiumFeatures: settings.premiumFeatures,
    price: { amount: settings.premiumPriceXaf, currency: 'XAF', periodDays: settings.premiumPeriodDays },
    provider: deps.config.PAYMENTS_PROVIDER,
    providerEnvironment: deps.config.PAYMENTS_PROVIDER === 'fapshi' ? deps.config.FAPSHI_ENV : 'demo',
    payments: recent.map(publicPayment),
  };
}

export function publicPayment(p: Payment) {
  return {
    id: p.id,
    provider: p.provider,
    amount: p.amount,
    currency: p.currency,
    periodDays: p.periodDays,
    status: p.status,
    checkoutUrl: FINAL.includes(p.status as PaymentStatus) ? null : p.checkoutUrl,
    createdAt: p.createdAt.toISOString(),
    fulfilledAt: p.fulfilledAt?.toISOString() ?? null,
  };
}

export async function startCheckout(deps: Deps, userId: string, origin: string, email?: string, requestId?: string) {
  const settings = await getSettings(deps.db);
  const now = deps.clock.now();
  const [p] = await deps.db
    .insert(payments)
    .values({
      userId,
      provider: deps.payments.name,
      amount: settings.premiumPriceXaf,
      periodDays: settings.premiumPeriodDays,
      status: 'created',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const { checkoutUrl, transId } = await deps.payments.createCheckout({
    paymentId: p!.id,
    userId,
    amount: settings.premiumPriceXaf,
    email,
    redirectUrl: `${origin}/app/billing/return?payment=${p!.id}`,
    message: `MEDIMATE Premium (${settings.premiumPeriodDays} days)`,
  });
  const [u] = await deps.db.update(payments).set({ checkoutUrl, transId, status: 'pending', updatedAt: now }).where(eq(payments.id, p!.id)).returning();
  await audit(deps.db, { actorId: userId, action: 'payment.started', targetType: 'payment', targetId: p!.id, detail: { provider: deps.payments.name, amount: p!.amount }, requestId });
  return publicPayment(u!);
}

/**
 * Apply a provider status. Fulfilment is idempotent: the conditional update on `fulfilled_at`
 * guarantees premium time is added once, however many webhooks or polls arrive.
 */
async function applyStatus(deps: Deps, p: Payment, status: PaymentStatus, providerStatus: string) {
  const now = deps.clock.now();
  await deps.db.update(payments).set({ status, providerStatus, lastCheckedAt: now, updatedAt: now }).where(eq(payments.id, p.id));
  if (status !== 'successful') return;
  const claimed = await deps.db
    .update(payments)
    .set({ fulfilledAt: now })
    .where(and(eq(payments.id, p.id), isNull(payments.fulfilledAt)))
    .returning();
  if (!claimed.length) return;
  const sub = await getSubscriptionState(deps.db, p.userId);
  const base = sub.premiumUntil && sub.premiumUntil > now ? sub.premiumUntil : now;
  await deps.db
    .update(subscriptions)
    .set({ premiumUntil: new Date(base.getTime() + p.periodDays * 86_400_000), updatedAt: now })
    .where(eq(subscriptions.userId, p.userId));
  await audit(deps.db, { actorId: p.userId, action: 'payment.fulfilled', targetType: 'payment', targetId: p.id, detail: { provider: p.provider, periodDays: p.periodDays } });
}

export async function refreshPayment(deps: Deps, userId: string, paymentId: string) {
  const [p] = await deps.db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.userId, userId)));
  if (!p) throw notFound('Payment');
  const now = deps.clock.now();
  if (p.provider === 'fapshi' && p.transId && !FINAL.includes(p.status as PaymentStatus)) {
    if (!p.lastCheckedAt || now.getTime() - p.lastCheckedAt.getTime() >= STATUS_CHECK_INTERVAL_MS) {
      const s = await deps.payments.getStatus(p.transId);
      await applyStatus(deps, p, s.status, s.providerStatus);
    }
  }
  const [after] = await deps.db.select().from(payments).where(eq(payments.id, p.id));
  return publicPayment(after!);
}

/** Demo checkout only: there is no real payment provider and no money moves. */
export async function confirmDemoPayment(deps: Deps, userId: string, paymentId: string) {
  if (deps.config.PAYMENTS_PROVIDER !== 'demo') throw forbidden('Demo checkout is turned off.');
  const [p] = await deps.db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.userId, userId), eq(payments.provider, 'demo')));
  if (!p) throw notFound('Payment');
  if (FINAL.includes(p.status as PaymentStatus)) return publicPayment(p);
  await applyStatus(deps, p, 'successful', 'DEMO_CONFIRMED');
  const [after] = await deps.db.select().from(payments).where(eq(payments.id, p.id));
  return publicPayment(after!);
}

/**
 * Fapshi webhook. We check the optional shared secret (`x-wh-secret`), then NEVER trust the body:
 * the transaction status is re-queried from Fapshi before anything is fulfilled.
 */
export async function handleFapshiWebhook(deps: Deps, headers: Record<string, string | string[] | undefined>, body: unknown) {
  if (deps.config.PAYMENTS_PROVIDER !== 'fapshi') throw notFound('Webhook');
  const expected = deps.config.FAPSHI_WEBHOOK_SECRET;
  if (expected) {
    const got = headers['x-wh-secret'];
    if (typeof got !== 'string' || !safeEqual(got, expected)) throw new AppError(401, 'BAD_WEBHOOK_SECRET', 'Invalid webhook secret.');
  }
  const transId = typeof (body as { transId?: unknown })?.transId === 'string' ? (body as { transId: string }).transId : null;
  if (!transId) throw badRequest('Missing transId.');
  const [p] = await deps.db.select().from(payments).where(eq(payments.transId, transId));
  if (!p) {
    deps.logger.warn('fapshi.webhook_unknown_transaction', {});
    return { ok: true, ignored: true };
  }
  const s = await deps.payments.getStatus(transId);
  await applyStatus(deps, p, s.status, s.providerStatus);
  return { ok: true };
}

/** Reconciliation for missed webhooks (Fapshi sends each webhook once, without retries). */
export async function reconcilePendingPayments(deps: Deps) {
  if (deps.payments.name !== 'fapshi') return 0;
  const now = deps.clock.now();
  const pending = await deps.db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.provider, 'fapshi'),
        inArray(payments.status, ['created', 'pending']),
        or(isNull(payments.lastCheckedAt), lte(payments.lastCheckedAt, new Date(now.getTime() - 120_000))),
      ),
    )
    .limit(20);
  for (const p of pending) {
    if (!p.transId) continue;
    try {
      const s = await deps.payments.getStatus(p.transId);
      await applyStatus(deps, p, s.status, s.providerStatus);
    } catch (e) {
      deps.logger.warn('fapshi.reconcile_failed', { paymentId: p.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return pending.length;
}
