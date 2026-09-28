// Rex Comicsverse Service Worker — Offline Support
const CACHE = 'rex-v4';
// Relative paths so this works under the /rexcomicsverse/ GitHub Pages path
const FILES = ['./', './index.html', './setup-guide.html', './manifest.json', './icon-192.png', './icon-512.png', './app-update.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Images (art, icons): cache first, saved on first view for offline reading.
  // They get new file names when they change, so a cached copy is never stale.
  if (req.destination === 'image') {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Pages, scripts, manifest: network first so readers and the app always get the latest,
  // with the cached copy as the offline fallback.
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: req.mode === 'navigate'})
      .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
