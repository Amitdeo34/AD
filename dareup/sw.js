// DareUp service worker: offline shell for the hosted site only.
// index.html never registers it on file:// or inside the Android app.
// API calls (/api/...) and other origins (Razorpay) are never intercepted or cached.
// Bump CACHE when the shell list changes.

const CACHE = 'dareup-shell-v1';
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dareup-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isApi(url) {
  const scope = new URL(self.registration.scope).pathname;
  return url.pathname.startsWith(`${scope}api/`) || url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isApi(url)) return;

  // Pages: network first so updates arrive, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  // Shell assets: cache first.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
