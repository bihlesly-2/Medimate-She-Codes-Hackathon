import webpush from 'web-push';
import type { Config } from '../config';

/**
 * Web Push sender (VAPID). The browser's push service (Google FCM, Mozilla, Apple) delivers the
 * message to the device, so reminders pop up even when MEDIMATE is closed.
 */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Reminder actions shown on the notification (Taken / Snooze). */
  occurrenceId?: string;
}
export type PushResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
  enabled: boolean;
  send(target: PushTarget, msg: PushMessage): Promise<PushResult>;
}

export const disabledPush: PushSender = { enabled: false, send: async () => 'failed' };

export function createPushSender(config: Config): PushSender {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return disabledPush;
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
  return {
    enabled: true,
    async send(target, msg) {
      try {
        await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(msg), { TTL: 60 * 60, urgency: 'high' });
        return 'sent';
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the subscription is gone (app uninstalled or permission revoked).
        return status === 404 || status === 410 ? 'gone' : 'failed';
      }
    },
  };
}
