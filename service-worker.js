// ============================================================
// service-worker.js — offline app shell for the Kerb PWA.
// Bump CACHE when any precached file changes.
// ============================================================
const CACHE = 'kerb-v23';

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
  'js/goals.js',
  'js/notify.js',
  'js/i18n.js',
  'js/dedupe.js',
  'js/lock.js',
  'js/csv.js',
  'js/payslips.js',
  'js/ui/shared.js',
  'js/ui/import.js',
  'js/ui/payslips.js',
  'js/ui/scan-earnings.js',
  'js/ui/bank-import.js',
  'js/ui/shift.js',
  'js/ui/goals.js',
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
  'js/ui/assistant.js',
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

// Focus (or open) the app when a notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

// Best-effort daily nudge on supported platforms (registered only when the
// user has enabled reminders).
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'kerb-daily') {
    event.waitUntil(self.registration.showNotification('Kerb', {
      body: 'Log today\'s shifts and keep your tax pot up to date.',
      tag: 'kerb-daily', icon: 'icons/icon.svg', badge: 'icons/icon.svg',
    }));
  }
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
