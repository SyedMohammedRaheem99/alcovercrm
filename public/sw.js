/**
 * Service worker.
 *
 * Deliberately conservative. A CRM shows business-critical numbers, so stale
 * data is worse than no data: API responses are NEVER served from cache, and
 * pages are network-first. The cache exists to make the app shell load fast and
 * to show a helpful offline page instead of the browser's dinosaur.
 */

const VERSION = 'v1';
const SHELL_CACHE = `alcove-shell-${VERSION}`;
const ASSET_CACHE = `alcove-assets-${VERSION}`;

const SHELL_URLS = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      // A failed pre-cache must not block installation.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('alcove-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  /* ---- API: always network. Never serve a cached lead list or dashboard
     number — showing yesterday's follow-ups as if they were today's would be
     actively harmful. ---- */
  if (url.pathname.startsWith('/api/')) return;

  /* ---- Hashed build assets: cache-first, they are immutable ---- */
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  /* ---- Navigations: network-first, fall back to the offline page ---- */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/offline'))
            .then((res) => res || new Response('Offline', { status: 503 })),
        ),
    );
  }
});
