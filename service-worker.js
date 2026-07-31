/**
 * service-worker.js — PWA Service Worker
 * Strategy: Cache-first for static assets, Network-first for GAS API calls.
 */

const CACHE_NAME    = 'exp-inspect-v1.0.0';
const DYNAMIC_CACHE = 'exp-dynamic-v1';

// Assets to pre-cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/js/config.js',
  '/src/js/data.js',
  '/src/js/map.js',
  '/src/js/form.js',
  '/src/js/report.js',
  '/src/js/app.js',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// ── Install: pre-cache static shell ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
  console.info('[SW] Installed');
});

// ── Activate: purge old caches ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
  console.info('[SW] Activated');
});

// ── Fetch: routing strategy ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. GAS API calls → network-first, fall through on failure
  if (request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          // Cache successful GAS GETs
          if (request.method === 'GET' && res.ok) {
            const resClone = res.clone();
            caches.open(DYNAMIC_CACHE).then(c => c.put(request, resClone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 2. Tile requests (CartoDB/OSM) → cache with expiry
  if (url.hostname.includes('basemaps.cartocdn.com') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DYNAMIC_CACHE).then(c => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3. Everything else → cache-first
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

// ── Background sync (future: queue failed POST payloads) ─────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-inspections') {
    console.info('[SW] Background sync: sync-inspections');
    // Implementation: open IDB, retry failed POST calls to GAS
  }
});
