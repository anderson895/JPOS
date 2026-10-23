// JPOS service worker: makes JPOS installable as an app and shows a friendly
// page when there's no internet. It never stores the app itself, so every
// deploy shows up right away and nothing goes stale.
// When offline.html changes, bump CACHE so phones fetch the new one.
const CACHE = 'jpos-offline-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: 'reload' }))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Opening a page goes to the network as usual. Only when that fails (no
// internet) the saved offline page is shown. Every other request is left alone.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_PAGE).then((page) => page || Response.error())),
  );
});
