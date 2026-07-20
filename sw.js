// Cache name is derived from the app's single version number (version.js)
// so it's impossible for the Service Worker to drift out of sync with the
// version shown in Settings/About. Bump the version in version.js on every
// release — old, previously-cached HTML/JS/data files are then guaranteed
// to be replaced instead of silently kept forever.
importScripts('./version.js');
const CACHE = 'juzamma-v' + self.APP_VERSION;

// Assets whose CONTENT rarely/never changes once shipped: safe to serve
// cache-first for speed and offline use.
const STATIC_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/UthmanicHafs.woff2',
  './fonts/PDMS-Saleem-QuranFont.woff2',
  './fonts/cairo-arabic-400-normal.woff2',
  './fonts/cairo-arabic-500-normal.woff2',
  './fonts/cairo-arabic-600-normal.woff2',
  './fonts/cairo-arabic-700-normal.woff2',
  './fonts/amiri-quran-arabic-400-normal.woff2',
  // data.js (النص القرآني الكامل، ~3.3MB) لا يتغيّر أبدًا إلا مع إصدار
  // جديد كامل للتطبيق (نفس ضمان الخطوط بالظبط) — ونظام التحديث هنا أصلًا
  // مبني على تغيير اسم CACHE نفسه (من version.js) + مسح كل الكاش القديم
  // في activate، مش على استراتيجية fetch لكل ملف على حدة. فمفيش داعي
  // نستنى fetch شبكة لملف بالحجم ده (يضيف تأخير حقيقي، لحد 4 ثوانٍ عند
  // ضعف الشبكة) طالما أي تحديث فعلي هيتكشف من تغيّر CACHE beforehand.
  './data.js'
];

// Assets that change whenever the app is updated: must always be fetched
// fresh from the network first, falling back to cache only when offline.
const DYNAMIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './surah-meta.js',
  './surah-names-vocalized.js',
  './juz-info.js',
  './version.js',
  './constants.js',
  './storage-manager.js',
  './gestures.js',
  './searchManager.js',
  './audioManager.js',
  './readerManager.js',
  './ui.js',
  './dialogs.js',
  './reader-favorites.js',
  './reader-bookmark.js',
  './reader-reminders.js',
  './reader-guide.js',
  './reader-tafsir.js',
  './home.js',
  './settings.js',
  './navigation.js',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS.concat(DYNAMIC_ASSETS)))
      .then(() => {
        // Only replace the currently-active (working) service worker once
        // every file has actually been cached successfully. cache.addAll()
        // is all-or-nothing — if the device is offline right when an
        // update check happens, it rejects and NOTHING gets cached under
        // the new version. Calling skipWaiting() unconditionally (the
        // previous bug here) would still activate that empty new cache,
        // and activate() below deletes every *other* cache — wiping out
        // the old, fully-populated one that was keeping the app usable
        // offline. Skipping skipWaiting() on failure instead leaves the
        // old service worker (and its complete cache) fully in control;
        // the update simply retries the next time the app is opened with
        // a connection.
        self.skipWaiting();
      })
      .catch(() => { /* offline or a fetch failed — stay on the current, working version */ })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
      // One-time cleanup: earlier versions had no same-origin check in the
      // fetch handler, so recitation audio and tafsir JSON from other
      // origins may have already been written into CACHE during past
      // sessions. Evict any such leaked entries now so upgrading actually
      // reclaims that storage instead of just stopping it from growing further.
      caches.open(CACHE).then((cache) =>
        cache.keys().then((requests) =>
          Promise.all(
            requests
              .filter((req) => new URL(req.url).origin !== self.location.origin)
              .map((req) => cache.delete(req))
          )
        )
      )
    ])
  );
  self.clients.claim();
});

function isStaticAsset(url){
  return STATIC_ASSETS.some((a) => url.endsWith(a.replace('./', '/')) || url.endsWith(a));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Only this app's own origin goes through the caching logic below.
  // Cross-origin requests — recitation audio from everyayah.com
  // (audioManager.js) and tafsir JSON from raw.githubusercontent.com
  // (reader-tafsir.js) — are left completely untouched (no e.respondWith),
  // so the browser handles them as a normal, un-intercepted fetch and
  // nothing gets added to this app's Cache Storage. Without this check
  // every ayah played or tafsir opened was silently being written into
  // CACHE via the network-first path below, contradicting audioManager's
  // own "Audio is never bundled or cached" comment and growing Cache
  // Storage without bound over a session.
  if (new URL(url).origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    // Cache-first for fonts/icons: they never change between releases.
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            // e.waitUntil() (not a bare, un-awaited .then()) — respondWith's
            // own promise only keeps the worker alive until `res` is
            // returned below; the cache write is a separate promise chain
            // that the browser is otherwise free to cut short the instant
            // it terminates this worker instance right after, silently
            // dropping the write. waitUntil() explicitly extends the
            // event's lifetime until this write has actually finished too.
            e.waitUntil(caches.open(CACHE).then((cache) => cache.put(e.request, resClone)));
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
  //
  // NETWORK_TIMEOUT_MS races the fetch against a plain timer so a
  // *stalled* connection (weak signal, cell-tower handoff, captive
  // portal — a request that never actually errors, just never resolves)
  // falls back to the cached copy after a bounded wait instead of leaving
  // the app looking frozen indefinitely. A real network error already
  // falls back immediately via .catch() below; this only bounds the
  // "still waiting" case. The network attempt itself is not cancelled —
  // it's left to finish in the background so a same-URL cache.put() from
  // a slow-but-eventually-successful response still lands — this only
  // changes what gets shown to the page right now.
  const NETWORK_TIMEOUT_MS = 4000;
  function timeoutPromise(ms){
    return new Promise((_, reject) => setTimeout(() => reject(new Error('sw-network-timeout')), ms));
  }
  // The network fetch is kept as its OWN promise chain, separate from the
  // race below — this is what actually delivers on the comment above
  // ("the network attempt itself is not cancelled — it's left to finish
  // in the background so a same-URL cache.put() from a slow-but-
  // eventually-successful response still lands"). The previous version
  // only ever attached cache.put() inside Promise.race(...).then(...);
  // Promise.race() only calls .then() with the WINNING promise's result,
  // so whenever the timeout won (any request slower than 4s on a flaky
  // connection), the network fetch's eventual successful response was
  // simply discarded once it did arrive — never cached, and never shown
  // to the page either. That silently defeated the offline cache refresh
  // this branch exists for, specifically for the slow-connection case it
  // was written to handle. See tests/sw-regression.js for the regression
  // case this guards.
  const networkFetch = fetch(e.request).then((res) => {
    if (res && res.status === 200) {
      const resClone = res.clone();
      // Same e.waitUntil() reasoning as the cache-first branch above —
      // without it this write races the worker's own shutdown and can
      // be silently dropped, which here would mean an update fetched
      // successfully over the network never actually lands in the
      // offline cache.
      e.waitUntil(caches.open(CACHE).then((cache) => cache.put(e.request, resClone)));
    }
    return res;
  });
  e.respondWith(
    Promise.race([networkFetch, timeoutPromise(NETWORK_TIMEOUT_MS)])
      .catch(() => caches.match(e.request))
  );
});
