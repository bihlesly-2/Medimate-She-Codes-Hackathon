/*
 * MEDIMATE service worker — offline APP SHELL only.
 * Health data is never cached: every /api request goes straight to the network, so nothing
 * personal is left in the cache on a shared device.
 */
const CACHE = 'medimate-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/brand/medimate-mark.png', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API responses
  if (url.pathname.startsWith('/assets/')) {
    // Hashed build assets are immutable: cache-first.
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
            return res;
          }),
      ),
    );
    return;
  }
  if (event.request.mode === 'navigate') {
    // Network-first for pages; fall back to the cached shell when offline.
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
  }
});

/*
 * Reminders that pop up (Web Push). The server sends { title, body, url, tag, occurrenceId }.
 * Lock-screen text is generic by design. For medicine reminders the notification offers
 * "Taken" directly; the request uses the person's own session cookie.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'MEDIMATE', body: event.data ? event.data.text() : '' };
  }
  const actions = data.occurrenceId
    ? [
        { action: 'taken', title: 'Taken' },
        { action: 'open', title: 'Open' },
      ]
    : [];
  event.waitUntil(
    self.registration.showNotification(data.title || 'MEDIMATE', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-64.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: Boolean(data.occurrenceId),
      data: { url: data.url || '/app', occurrenceId: data.occurrenceId || null },
      actions,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const { url, occurrenceId } = event.notification.data || {};
  event.notification.close();
  if (event.action === 'taken' && occurrenceId) {
    event.waitUntil(
      fetch(`/api/reminders/${occurrenceId}/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'taken', idempotencyKey: `${occurrenceId}:web` }),
      })
        .then((res) =>
          self.registration.showNotification(res.ok ? 'Recorded as taken' : 'Could not record it', {
            body: res.ok ? 'Nice work. Your streak keeps going.' : 'Open MEDIMATE to answer this reminder.',
            icon: '/icons/icon-192.png',
            tag: `done-${occurrenceId}`,
          }),
        )
        .catch(() => undefined),
    );
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const target = new URL(url || '/app', self.location.origin).href;
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(target).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
