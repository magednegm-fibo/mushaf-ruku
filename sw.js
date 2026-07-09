// Bump this version on every release so old, previously-cached HTML/JS/data
// files are guaranteed to be replaced instead of silently kept forever.
const CACHE = 'juzamma-v22';

// Assets whose CONTENT rarely/never changes once shipped: safe to serve
// cache-first for speed and offline use.
const STATIC_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/UthmanicHafs.woff2',
  './fonts/PDMS-Saleem-QuranFont.woff2'
];

// Assets that change whenever the app is updated: must always be fetched
// fresh from the network first, falling back to cache only when offline.
const DYNAMIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './juz-info.js',
  './data.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS.concat(DYNAMIC_ASSETS)))
      .catch(()=>{})
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

function isStaticAsset(url){
  return STATIC_ASSETS.some((a) => url.endsWith(a.replace('./', '/')) || url.endsWith(a));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  if (isStaticAsset(url)) {
    // Cache-first for fonts/icons: they never change between releases.
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, resClone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for HTML/JS/CSS/data: always try to get the latest
  // deployed version so app updates (bug fixes, new features) show up
  // immediately instead of being masked by a stale cached copy. Falls back
  // to cache only when the network is unavailable (offline support).
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, resClone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
