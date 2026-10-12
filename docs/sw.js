// Offline shell for the WG-App. Data itself is cached by Firestore (IndexedDB), not here.
const VERSION = 'wg-1.0.0+202610121302';
const PRECACHE = ["./","./index.html","./config.js","./assets/app-f43071d208.css","./assets/main-6QGRCRGA.js","./assets/chunk-JJV3RC4A.js","./assets/chunk-4GELXGZE.js","./assets/fonts/shantell-sans-latin-700-normal.woff2","./assets/fonts/shantell-sans-latin-ext-700-normal.woff2","./assets/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2","./assets/fonts/atkinson-hyperlegible-next-latin-ext-400-normal.woff2","./assets/fonts/atkinson-hyperlegible-next-latin-600-normal.woff2","./assets/fonts/atkinson-hyperlegible-next-latin-ext-600-normal.woff2","./assets/fonts/atkinson-hyperlegible-next-latin-700-normal.woff2","./assets/fonts/atkinson-hyperlegible-next-latin-ext-700-normal.woff2","./assets/doodles-light-86d1adbe35.svg","./assets/doodles-dark-f114675faa.svg","./manifest.webmanifest","./icons/icon-192.png"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wg-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const networkFirst = async (request, fallbackKey) => {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackKey || request, response.clone());
    return response;
  } catch {
    return (await cache.match(fallbackKey || request)) || Response.error();
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firestore and friends go straight to the network

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
