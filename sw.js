// Cache name is derived from the app's single version number (version.js)
// so it's impossible for the Service Worker to drift out of sync with the
// version shown in Settings/About. Bump the version in version.js on every
// release — old, previously-cached HTML/JS/data files are then guaranteed
// to be replaced instead of silently kept forever.
importScripts('./version.js');
const CACHE = 'juzamma-v' + self.APP_VERSION;

// Resolve a same-origin absolute URL from a path relative to the SW script.
// Using absolute URLs as cache keys avoids "/" vs "/index.html" mismatches
// that are common on Cloudflare Workers (workers.dev) vs GitHub Pages.
function assetUrl(path){
  var p = String(path || '').replace(/^\.\//, '');
  return new URL(p, self.location.href).href;
}

// Assets whose CONTENT rarely/never changes once shipped: safe to serve
// cache-first for speed and offline use.
const STATIC_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/UthmanicHafs.woff2',
  './fonts/cairo-arabic-400-normal.woff2',
  './fonts/cairo-arabic-500-normal.woff2',
  './fonts/cairo-arabic-600-normal.woff2',
  './fonts/cairo-arabic-700-normal.woff2',
  './fonts/amiri-quran-arabic-400-normal.woff2',
  './fonts/qcf-merged.woff2',
  './data.js'
];

// Assets that change whenever the app is updated: network-first while online,
// cache fallback when offline.
const DYNAMIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './surah-meta.js',
  './surah-names-vocalized.js',
  './juz-info.js',
  './rub-info.js',
  './version.js',
  './constants.js',
  './storage-manager.js',
  './gestures.js',
  './searchManager.js',
  './audioManager.js',
  './mark-placement-engine.js',
  './readerManager.js',
  './madinah-sajawandi.js',
  './madinah-circle-heads.js',
  './ui.js',
  './dialogs.js',
  './reader-favorites.js',
  './reader-bookmark.js',
  './reader-reminders.js',
  './reader-guide.js',
  './prayer.js',
  './reader-tafsir.js',
  './radio-player.js',
  './settings.js',
  './non-kufi-heads.js',
  // Required by index.html — without these the shell loads offline but the
  // reader cannot boot. Explicitly listed (were missing before 1.0.674).
  './home.js',
  './navigation.js',
  './lazy-loader.js',
  './app.js',
  './qcf-override.css',
  './qcf-override.js',
  './manifest.json',
  './ahkam-altajweed.html'
];

const CORE_ASSETS = [
  './index.html',
  './app.js',
  './data.js',
  './readerManager.js',
  './version.js',
  './style.css',
  // Prayer/Qibla must be offline-capable on first open after install
  // (see e2e/prayer-offline.spec.js + tests/prayer-offline-precache-regression.js).
  './prayer.js',
  // The guide's Tajweed tab loads this document in a same-origin iframe.
  './ahkam-altajweed.html'
];

// Store the app shell under every URL the browser may request for a
// document navigation on GitHub Pages and on Cloudflare Workers.
function isAppShellUrl(url){
  try {
    var target = new URL(url, self.location.href);
    var scopePath = new URL(self.registration.scope).pathname;
    if(scopePath.charAt(scopePath.length - 1) !== '/') scopePath += '/';
    return target.origin === self.location.origin &&
      (target.pathname === scopePath || target.pathname === scopePath + 'index.html');
  } catch(e) { return false; }
}

// Only the actual app shell may be mirrored to the root navigation keys.
// Never allow an iframe/document such as ahkam-altajweed.html to overwrite it.
function mirrorAppShell(cache, response, sourceUrl){
  if(!response || !response.ok || !isAppShellUrl(sourceUrl || assetUrl('index.html'))) return Promise.resolve();
  var base = self.location.href.replace(/sw\.js(?:\?.*)?$/, '');
  var keys = [
    assetUrl('index.html'),
    assetUrl('./'),
    base,
    base + 'index.html',
    base.replace(/\/$/, ''),
    self.registration && self.registration.scope
  ].filter(Boolean);
  // de-dupe
  var seen = Object.create(null);
  var puts = [];
  keys.forEach(function(k){
    if(seen[k]) return;
    seen[k] = true;
    puts.push(cache.put(k, response.clone()));
  });
  return Promise.all(puts);
}

function fetchAndCache(cache, path){
  var url = assetUrl(path);
  return fetch(url, { cache: 'no-cache' }).then(function(res){
    if(!res || !res.ok) return { path: path, ok: false, url: url };
    return cache.put(url, res.clone()).then(function(){
      return { path: path, ok: true, url: url, res: res };
    });
  }).catch(function(){
    return { path: path, ok: false, url: url };
  });
}

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      // 1) CORE first (sequential) — guarantees prayer.js / shell offline
      //    before the large parallel pass can starve connections.
      var byPath = Object.create(null);
      var coreChain = Promise.resolve();
      CORE_ASSETS.forEach(function(path){
        coreChain = coreChain.then(function(){
          return fetchAndCache(cache, path).then(function(r){
            byPath[r.path] = r;
            if(!r.ok){
              // one immediate retry per core asset
              return fetchAndCache(cache, path).then(function(r2){
                byPath[r2.path] = r2;
                return r2;
              });
            }
            return r;
          });
        });
      });
      return coreChain.then(function(){
        var coreOk = CORE_ASSETS.every(function(c){
          return byPath[c] && byPath[c].ok;
        });
        if(!coreOk){
          return Promise.reject(new Error('sw-install-core-incomplete'));
        }
        // 2) Remaining assets in parallel (best-effort; not install-blocking)
        var rest = STATIC_ASSETS.concat(DYNAMIC_ASSETS).filter(function(path){
          return CORE_ASSETS.indexOf(path) === -1;
        });
        return Promise.all(rest.map(function(path){
          return fetchAndCache(cache, path).then(function(r){
            byPath[r.path] = r;
            return r;
          });
        })).then(function(){
          var indexEntry = byPath['./index.html'] || byPath['./'];
          if(indexEntry && indexEntry.ok){
            return cache.match(assetUrl('index.html')).then(function(hit){
              return mirrorAppShell(cache, hit || null);
            });
          }
          return undefined;
        });
      });
    }).then(function(){
      return self.skipWaiting();
    }).catch(function(){
      /* keep previous SW + cache */
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    Promise.all([
      caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){
          return caches.delete(k);
        }));
      }),
      caches.open(CACHE).then(function(cache){
        return cache.keys().then(function(requests){
          return Promise.all(
            requests
              .filter(function(req){ return new URL(req.url).origin !== self.location.origin; })
              .map(function(req){ return cache.delete(req); })
          );
        });
      })
    ]).then(function(){
      return self.clients.claim();
    })
  );
});

function isStaticAsset(url){
  return STATIC_ASSETS.some(function(a){
    var abs = assetUrl(a);
    return url === abs || url.endsWith(a.replace('./', '/')) || url.endsWith(a);
  });
}

function isNavigateRequest(request){
  if(request.mode === 'navigate') return true;
  if(request.destination === 'document') return true;
  var accept = request.headers && request.headers.get('accept');
  return !!(accept && accept.indexOf('text/html') !== -1);
}

// Never resolve to undefined — that produces ERR_FAILED in Chrome when
// offline on workers.dev if no cache entry matched the navigation URL.
function matchAppShell(){
  var base = self.location.href.replace(/sw\.js(?:\?.*)?$/, '');
  var candidates = [
    assetUrl('index.html'),
    assetUrl('./'),
    base + 'index.html',
    base,
    base.replace(/\/$/, ''),
    self.registration && self.registration.scope
  ].filter(Boolean);
  var chain = Promise.resolve(undefined);
  candidates.forEach(function(key){
    chain = chain.then(function(hit){
      if(hit) return hit;
      return caches.match(key);
    });
  });
  return chain.then(function(hit){
    if(hit) return hit;
    return caches.match(assetUrl('index.html'), { ignoreSearch: true });
  }).then(function(hit){
    if(hit) return hit;
    // Last resort: explicit Response so respondWith never gets undefined.
    return new Response(
      '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>مصحف الركوع</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center">' +
      '<h1>لا يمكن فتح المصحف دون اتصال</h1>' +
      '<p>افتح التطبيق مرة واحدة وأنت متصل بالإنترنت حتى يتم حفظ الملفات على الجهاز، ثم أعد المحاولة.</p>' +
      '</body></html>',
      {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  });
}

function isTajweedDocument(request){
  try {
    var path = new URL(request.url).pathname;
    // Match any scope depth: /ahkam-altajweed.html or /foo/ahkam-altajweed.html
    return /(?:^|\/)ahkam-altajweed\.html$/.test(path);
  } catch(e) { return false; }
}

// Resolve the precached Tajweed document even when the iframe request URL
// does not byte-match the key used at install time (scope, trailing slash,
// ignoreSearch, or relative vs absolute differences on Android WebView).
function matchTajweedCached(request){
  var canonical = assetUrl('./ahkam-altajweed.html');
  return caches.match(request).then(function(hit){
    if(hit) return hit;
    return caches.match(request, { ignoreSearch: true }).then(function(hit2){
      if(hit2) return hit2;
      return caches.match(canonical).then(function(hit3){
        if(hit3) return hit3;
        return caches.match(canonical, { ignoreSearch: true });
      });
    });
  });
}

function tajweedUnavailableResponse(){
  return new Response(
    '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تعذر تحميل صفحة التجويد</title></head>' +
    '<body style="font-family:sans-serif;padding:2rem;text-align:center;background:#F6F1E4;color:#16493A">' +
    '<h2>تعذر تحميل صفحة التجويد</h2>' +
    '<p>تحقق من اتصالك أو أعد فتح التطبيق لتحديث الملفات، ثم حاول مرة أخرى.</p>' +
    '</body></html>',
    { status: 503, statusText: 'Tajweed document unavailable', headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function offlineFallback(request){
  if(isTajweedDocument(request)){
    return matchTajweedCached(request).then(function(hit){
      return hit || tajweedUnavailableResponse();
    });
  }
  return caches.match(request).then(function(hit){
    if(hit) return hit;
    return caches.match(request, { ignoreSearch: true }).then(function(hit2){
      if(hit2) return hit2;
      if(isNavigateRequest(request)) return matchAppShell();
      return undefined;
    });
  });
}

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var url = e.request.url;
  if(new URL(url).origin !== self.location.origin) return;

  // ---- Tajweed document: always cache-first (iframe OR top-level) ----
  // Iframe loads often use destination:"iframe", not mode:"navigate".
  // Always fetch by the canonical absolute URL string — re-fetching the
  // original Request object can net::ERR_FAILED on Android WebView.
  if(isTajweedDocument(e.request)){
    var tajweedUrl = assetUrl('./ahkam-altajweed.html');
    e.respondWith(
      matchTajweedCached(e.request).then(function(cached){
        if(cached){
          e.waitUntil(
            fetch(tajweedUrl, { cache: 'no-cache', credentials: 'same-origin' }).then(function(res){
              if(res && res.status === 200){
                return caches.open(CACHE).then(function(cache){
                  return cache.put(tajweedUrl, res.clone())
                    .then(function(){ return cache.put(e.request, res.clone()); });
                });
              }
            }).catch(function(){})
          );
          return cached;
        }
        return fetch(tajweedUrl, { cache: 'no-cache', credentials: 'same-origin' }).then(function(res){
          if(res && res.status === 200){
            var clone = res.clone();
            e.waitUntil(
              caches.open(CACHE).then(function(cache){
                return cache.put(tajweedUrl, clone.clone())
                  .then(function(){ return cache.put(e.request, clone); });
              })
            );
            return res;
          }
          return tajweedUnavailableResponse();
        }).catch(function(){ return tajweedUnavailableResponse(); });
      })
    );
    return;
  }

  // ---- Document navigations: explicit offline path (Cloudflare Workers) ----
  // cache:'no-cache' bypasses HTTP/CDN stale copies so network-first is real.
  if(isNavigateRequest(e.request)){
    var navNetwork = fetch(e.request, { cache: 'no-cache' }).then(function(res){
      if(res && res.status === 200){
        var clone = res.clone();
        e.waitUntil(
          caches.open(CACHE).then(function(cache){
            return cache.put(e.request, clone.clone()).then(function(){
              if(isAppShellUrl(e.request.url)) return mirrorAppShell(cache, clone, e.request.url);
            });
          })
        );
      }
      return res;
    });
    e.respondWith(
      Promise.race([
        navNetwork,
        new Promise(function(_, reject){
          setTimeout(function(){ reject(new Error('sw-network-timeout')); }, 4000);
        })
      ]).catch(function(){
        if(isTajweedDocument(e.request)){
          return matchTajweedCached(e.request).then(function(hit){
            return hit || tajweedUnavailableResponse();
          });
        }
        return offlineFallback(e.request).then(function(hit){
          // offlineFallback for navigations always yields a Response.
          return hit || matchAppShell();
        });
      })
    );
    return;
  }

  if(isStaticAsset(url)){
    // Cache-first: fonts/icons/data.js. HTTP long-cache (see _headers) is OK.
    e.respondWith(
      caches.match(e.request).then(function(cached){
        if(cached) return cached;
        return fetch(e.request).then(function(res){
          if(res && res.status === 200){
            var resClone = res.clone();
            e.waitUntil(caches.open(CACHE).then(function(cache){
              return cache.put(e.request, resClone);
            }));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for JS/CSS/JSON; cache fallback when offline.
  // cache:'no-cache' ensures "network" is not a stale HTTP/CDN hit.
  var NETWORK_TIMEOUT_MS = 4000;
  function timeoutPromise(ms){
    return new Promise(function(_, reject){
      setTimeout(function(){ reject(new Error('sw-network-timeout')); }, ms);
    });
  }
  var networkFetch = fetch(e.request, { cache: 'no-cache' }).then(function(res){
    if(res && res.status === 200){
      var resClone = res.clone();
      e.waitUntil(caches.open(CACHE).then(function(cache){
        return cache.put(e.request, resClone);
      }));
    }
    return res;
  });
  e.respondWith(
    Promise.race([networkFetch, timeoutPromise(NETWORK_TIMEOUT_MS)])
      .catch(function(){ return offlineFallback(e.request); })
  );
});
