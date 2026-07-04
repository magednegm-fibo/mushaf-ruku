const CACHE = 'juzamma-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './juz-info.js',
  './data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          // cache same-origin assets (including fonts) as they're fetched
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, resClone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
