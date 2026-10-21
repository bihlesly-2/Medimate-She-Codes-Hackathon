import { isDemoNumber, segmentCount, smsEncoding } from '@medimate/shared';
import { smsLogs } from '../db/schema';
import type { Deps } from '../types';
import { simulatorProvider, type SendResult } from '../providers/messaging';

/** Message bodies are kept for 7 days (support/debugging), then purged; metadata stays. */
export const SMS_BODY_RETENTION_MS = 7 * 24 * 3600_000;

export type SmsKind = 'reply' | 'routine' | 'otp' | 'transactional';

/**
 * Send one SMS through the configured provider and record delivery metadata.
 * Callers are responsible for consent checks on routine messages (reminders, alerts).
 * OTP bodies are never stored.
 */
export async function sendSms(
  deps: Pick<Deps, 'db' | 'clock' | 'messaging' | 'logger'>,
  m: { to: string; body: string; kind: SmsKind; userId?: string | null; command?: string },
): Promise<SendResult> {
  // Fictional demo numbers can never receive real SMS: always simulate them.
  const provider = isDemoNumber(m.to) ? simulatorProvider : deps.messaging;
  const result = await provider.send({ to: m.to, body: m.body });
  const now = deps.clock.now();
  await deps.db.insert(smsLogs).values({
    direction: 'out',
    phone: m.to,
    userId: m.userId ?? null,
    body: m.kind === 'otp' ? null : m.body,
    bodyExpiresAt: m.kind === 'otp' ? null : new Date(now.getTime() + SMS_BODY_RETENTION_MS),
    command: m.command ?? m.kind,
    status: result.status,
    provider: provider.name,
    providerMessageId: result.providerMessageId ?? null,
    segments: segmentCount(m.body),
    encoding: smsEncoding(m.body),
    createdAt: now,
  });
  if (result.status === 'failed') deps.logger.warn('sms.send_failed', { kind: m.kind, error: result.error });
  return result;
}

export async function logInboundSms(
  deps: Pick<Deps, 'db' | 'clock'>,
  m: { from: string; body: string; userId: string | null; command: string; provider: string },
) {
  const now = deps.clock.now();
  await deps.db.insert(smsLogs).values({
    direction: 'in',
    phone: m.from,
    userId: m.userId,
    body: m.body,
    bodyExpiresAt: new Date(now.getTime() + SMS_BODY_RETENTION_MS),
    command: m.command,
    status: 'received',
    provider: m.provider,
    segments: segmentCount(m.body),
    encoding: smsEncoding(m.body),
    createdAt: now,
  });
}
