/*
 * MEDIMATE service worker — offline APP SHELL only.
 * Health data is never cached: every /api request goes straight to the network, so nothing
 * personal is left in the cache on a shared device.
 */
const CACHE = 'medimate-shell-v1';
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
