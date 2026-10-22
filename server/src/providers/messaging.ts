import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from '../config';

/**
 * Provider-agnostic SMS gateway. Business logic only talks to this interface.
 * - `simulator`: never sends anything; messages appear in the browser simulator, labelled "Simulated".
 * - `africastalking`: Africa's Talking bulk SMS API. Implemented to the provider's documented request
 *   shape but NOT verified against a live account in this repository (see docs/SMS_USSD.md).
 */
export interface OutboundSms {
  to: string;
  body: string;
}
export interface SendResult {
  status: 'simulated' | 'sent' | 'failed';
  providerMessageId?: string;
  error?: string;
}
export interface MessagingProvider {
  name: 'simulator' | 'twilio' | 'africastalking' | 'test-failing';
  live: boolean;
  send(msg: OutboundSms): Promise<SendResult>;
}

export const simulatorProvider: MessagingProvider = {
  name: 'simulator',
  live: false,
  async send() {
    return { status: 'simulated', providerMessageId: `sim-${randomUUID()}` };
  },
};

export function africasTalkingProvider(config: Config): MessagingProvider {
  const base =
    config.AT_ENVIRONMENT === 'live'
      ? 'https://api.africastalking.com/version1/messaging'
      : 'https://api.sandbox.africastalking.com/version1/messaging';
  return {
    name: 'africastalking',
    live: config.AT_ENVIRONMENT === 'live',
    async send({ to, body }) {
      const form = new URLSearchParams({ username: config.AT_USERNAME ?? '', to, message: body });
      if (config.AT_SENDER_ID) form.set('from', config.AT_SENDER_ID);
      try {
        const res = await fetch(base, {
          method: 'POST',
          headers: { apiKey: config.AT_API_KEY ?? '', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { status: 'failed', error: `HTTP ${res.status}` };
        const data = (await res.json()) as { SMSMessageData?: { Recipients?: { status?: string; messageId?: string }[] } };
        const r = data.SMSMessageData?.Recipients?.[0];
        if (r?.status === 'Success') return { status: 'sent', providerMessageId: r.messageId };
        return { status: 'failed', error: r?.status ?? 'No recipient status' };
      } catch (e) {
        return { status: 'failed', error: e instanceof Error ? e.message : 'Network error' };
      }
    },
  };
}

/**
 * Twilio Programmable Messaging (REST API 2010-04-01). Outbound only; Twilio trial accounts can only
 * send to numbers verified in the Twilio console. https://www.twilio.com/docs/messaging/api/message-resource
 */
export function twilioProvider(config: Config, fetchImpl: typeof fetch = fetch): MessagingProvider {
  const sid = config.TWILIO_ACCOUNT_SID ?? '';
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = `Basic ${Buffer.from(`${sid}:${config.TWILIO_AUTH_TOKEN ?? ''}`).toString('base64')}`;
  return {
    name: 'twilio',
    live: true,
    async send({ to, body }) {
      const form = new URLSearchParams({ To: to, Body: body });
      if (config.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', config.TWILIO_MESSAGING_SERVICE_SID);
      else form.set('From', config.TWILIO_FROM ?? '');
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: form,
          signal: AbortSignal.timeout(10_000),
        });
        const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
        if (!res.ok) return { status: 'failed', error: `Twilio ${res.status}${data.code ? ` (${data.code})` : ''}: ${data.message ?? 'error'}` };
        return { status: 'sent', providerMessageId: data.sid };
      } catch (e) {
        return { status: 'failed', error: e instanceof Error ? e.message : 'Network error' };
      }
    },
  };
}

/** Validate Twilio's X-Twilio-Signature (HMAC-SHA1 of the full URL plus sorted POST params). */
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = createHmac('sha1', authToken).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Test double: fails the first `failures` sends. */
export function failingProvider(failures: number): MessagingProvider & { calls: number } {
  const p = {
    name: 'test-failing' as const,
    live: false,
    calls: 0,
    async send(): Promise<SendResult> {
      p.calls++;
      if (p.calls <= failures) return { status: 'failed', error: 'Simulated provider outage' };
      return { status: 'simulated', providerMessageId: `sim-${randomUUID()}` };
    },
  };
  return p;
}

export function createMessagingProvider(config: Config): MessagingProvider {
  if (config.MESSAGING_PROVIDER === 'twilio') return twilioProvider(config);
  if (config.MESSAGING_PROVIDER === 'africastalking') return africasTalkingProvider(config);
  return simulatorProvider;
}
