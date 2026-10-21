import type { Config } from '../config';
import { AppError } from '../lib/errors';

/**
 * Payment adapter. Mobile money is always behind this interface.
 * - `demo`: a clearly labelled test checkout. No money moves and nothing is charged.
 * - `fapshi`: Fapshi hosted checkout (MTN MoMo / Orange Money, Cameroon). https://docs.fapshi.com
 *     POST /initiate-pay  → { link, transId }
 *     GET  /payment-status/{transId} → Transaction { status: CREATED|PENDING|SUCCESSFUL|FAILED|EXPIRED }
 *   Auth headers: `apiuser`, `apikey`. Webhook carries the Transaction object and an optional
 *   `x-wh-secret` header; we always re-query payment-status before fulfilling.
 */
export type PaymentStatus = 'created' | 'pending' | 'successful' | 'failed' | 'expired';

export interface CheckoutRequest {
  paymentId: string;
  userId: string;
  amount: number;
  email?: string;
  redirectUrl: string;
  message: string;
}
export interface PaymentProvider {
  name: 'demo' | 'fapshi';
  createCheckout(req: CheckoutRequest): Promise<{ checkoutUrl: string | null; transId: string | null }>;
  getStatus(transId: string): Promise<{ status: PaymentStatus; providerStatus: string }>;
}

export const demoPaymentProvider: PaymentProvider = {
  name: 'demo',
  async createCheckout() {
    return { checkoutUrl: null, transId: null };
  },
  async getStatus() {
    return { status: 'pending', providerStatus: 'DEMO' };
  },
};

const FAPSHI_STATUS: Record<string, PaymentStatus> = {
  CREATED: 'created',
  PENDING: 'pending',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  EXPIRED: 'expired',
};

export function fapshiProvider(config: Config, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const base = config.FAPSHI_ENV === 'live' ? 'https://live.fapshi.com' : 'https://sandbox.fapshi.com';
  const headers = {
    apiuser: config.FAPSHI_API_USER ?? '',
    apikey: config.FAPSHI_API_KEY ?? '',
    'Content-Type': 'application/json',
  };
  async function call<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(base + path, { ...init, headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new AppError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'The payment service could not be reached. Please try again.');
    }
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Payment service error: ${data.message ?? `HTTP ${res.status}`}`);
    }
    return data;
  }
  return {
    name: 'fapshi',
    async createCheckout(req) {
      if (!Number.isInteger(req.amount) || req.amount < 100) throw new AppError(400, 'BAD_AMOUNT', 'Fapshi requires a whole amount of at least 100 XAF.');
      const body: Record<string, unknown> = {
        amount: req.amount,
        redirectUrl: req.redirectUrl,
        userId: req.userId,
        externalId: req.paymentId,
        message: req.message,
      };
      if (req.email) body.email = req.email;
      const data = await call<{ link?: string; transId?: string }>('/initiate-pay', { method: 'POST', body: JSON.stringify(body) });
      if (!data.link || !data.transId) throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment service returned an incomplete response.');
      return { checkoutUrl: data.link, transId: data.transId };
    },
    async getStatus(transId) {
      if (!/^[A-Za-z0-9]{4,40}$/.test(transId)) throw new AppError(400, 'BAD_TRANSACTION', 'Invalid transaction id.');
      const data = await call<{ status?: string }>(`/payment-status/${encodeURIComponent(transId)}`, { method: 'GET' });
      const providerStatus = String(data.status ?? '').toUpperCase();
      return { status: FAPSHI_STATUS[providerStatus] ?? 'pending', providerStatus };
    },
  };
}

export function createPaymentProvider(config: Config): PaymentProvider {
  return config.PAYMENTS_PROVIDER === 'fapshi' ? fapshiProvider(config) : demoPaymentProvider;
}
