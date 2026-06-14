/*
 * Chista service worker — makes the installed PWA load and work offline.
 *
 * Strategy:
 *   • Navigations  → network-first, fall back to the last-seen page, then /offline.
 *   • Static/build → stale-while-revalidate (instant loads, refreshed in the bg).
 *   • Everything else (incl. API/auth) → network, with a cache fall-back only if
 *     it happens to be cached. We never proactively cache API responses, so no
 *     authenticated data is written to disk.
 *
 * Bump VERSION to roll the caches on a new release.
 */
const VERSION = 'chista-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/chista-logo.svg', '/icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Let the page tell a freshly-installed worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/backgrounds/') ||
    /\.(?:js|css|woff2?|ttf|png|svg|jpe?g|webp|gif|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (API/CDN) pass through

  // App navigations: network-first so updates flow; fall back to cache / offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          return (
            (await cache.match(request)) ||
            (await caches.match(OFFLINE_URL)) ||
            new Response('Offline', { status: 503, statusText: 'Offline' })
          );
        }
      })(),
    );
    return;
  }

  // Static + build assets: serve from cache, refresh in the background.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
    return;
  }

  // Default: network, falling back to any cached copy (never proactively cached).
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
