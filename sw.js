// OKADA service worker: play offline once you've played online.
//   /assets/*  content-hashed (never change)  → cache first
//   the page, manifest, icons (change per build) → network first, cache when offline
const CACHE = 'okada-v8'; // v8 = 1.4: flow, stunts, Yaba Base (D25)
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Store a copy, then hand the original on. The clone must happen NOW: once the page
 *  starts reading the body, cloning fails (and an async clone fails silently). */
const keep = (req) => (res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // 9S sync etc. go straight out
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit ?? fetch(e.request).then(keep(e.request))),
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(keep(e.request))
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('./'))),
  );
});
