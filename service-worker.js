// ============================================================
// service-worker.js — offline app shell for the Kerb PWA.
// Bump CACHE when any precached file changes.
// ============================================================
const CACHE = 'kerb-v4';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/util.js',
  'js/store.js',
  'js/db.js',
  'js/tax.js',
  'js/charts.js',
  'js/claude.js',
  'js/bus.js',
  'js/shift.js',
  'js/ui/shared.js',
  'js/ui/shift.js',
  'js/ui/forms.js',
  'js/ui/items.js',
  'js/ui/dashboard.js',
  'js/ui/income.js',
  'js/ui/expenses.js',
  'js/ui/tax-view.js',
  'js/ui/pots.js',
  'js/ui/insights.js',
  'js/ui/settings.js',
  'js/ui/onboarding.js',
  'js/ui/report.js',
  'icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch cross-origin requests (e.g. the Anthropic API).
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first for a fresh shell, fall back to cache offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // Static assets: stale-while-revalidate — serve cache immediately for speed
  // and offline, and refresh the cache in the background so updates land next load.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || cached;
  })());
});
