import { post } from './api';

/**
 * Web Push (reminders that pop up even when MEDIMATE is closed).
 * Android Chrome and desktop browsers support it in a normal tab; on iPhone it works once the app
 * is added to the home screen (iOS 16.4 or newer).
 */
export function pushSupport(): 'ok' | 'ios-install' | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  if (ios && !standalone) return 'ios-install';
  return 'unsupported';
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe through the service worker and register the subscription with the API. */
export async function enablePush(vapidPublicKey: string): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (pushSupport() !== 'ok') return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
  await post('/me/push', sub.toJSON());
  return 'enabled';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await post('/me/push/remove', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
}
