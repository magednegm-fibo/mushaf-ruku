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
  './fonts/PDMS-Saleem-QuranFont.woff2',
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
  './no-sajawandi-heads.js',
  './non-kufi-heads.js',
  // Required by index.html — without these the shell loads offline but the
  // reader cannot boot. Explicitly listed (were missing before 1.0.674).
  './waqf-positions.js',
  './sila-positions.js',
  './data/no-sajawandi-heads.json',
  './home.js',
  './navigation.js',
  './lazy-loader.js',
  './app.js',
  './qcf-override.css',
  './qcf-override.js',
  './manifest.json'
];

const CORE_ASSETS = [
  './index.html',
  './app.js',
  './data.js',
  './readerManager.js',
  './version.js',
  './style.css'
];

// Store the app shell under every URL the browser may request for a
// document navigation on GitHub Pages and on Cloudflare Workers.
function mirrorAppShell(cache, response){
  if(!response || !response.ok) return Promise.resolve();
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
      var all = STATIC_ASSETS.concat(DYNAMIC_ASSETS);
      return Promise.all(all.map(function(path){
        return fetchAndCache(cache, path);
      })).then(function(results){
        var byPath = Object.create(null);
        results.forEach(function(r){ byPath[r.path] = r; });
        var coreOk = CORE_ASSETS.every(function(c){
          return byPath[c] && byPath[c].ok;
        });
        if(!coreOk){
          return Promise.reject(new Error('sw-install-core-incomplete'));
        }
        // Prefer a fresh index.html body for shell mirrors.
        var indexEntry = byPath['./index.html'] || byPath['./'];
        if(indexEntry && indexEntry.ok){
          return cache.match(assetUrl('index.html')).then(function(hit){
            return mirrorAppShell(cache, hit || null);
          });
        }
        return undefined;
      });
    }).then(function(){
      // Only skipWaiting after a complete core cache — preserves previous
      // offline-capable worker if this install failed.
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

function offlineFallback(request){
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

  // ---- Document navigations: explicit offline path (Cloudflare Workers) ----
  if(isNavigateRequest(e.request)){
    var navNetwork = fetch(e.request).then(function(res){
      if(res && res.status === 200){
        var clone = res.clone();
        e.waitUntil(
          caches.open(CACHE).then(function(cache){
            return cache.put(e.request, clone.clone()).then(function(){
              return mirrorAppShell(cache, clone);
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
        return offlineFallback(e.request).then(function(hit){
          // offlineFallback for navigations always yields a Response.
          return hit || matchAppShell();
        });
      })
    );
    return;
  }

  if(isStaticAsset(url)){
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
  var NETWORK_TIMEOUT_MS = 4000;
  function timeoutPromise(ms){
    return new Promise(function(_, reject){
      setTimeout(function(){ reject(new Error('sw-network-timeout')); }, ms);
    });
  }
  var networkFetch = fetch(e.request).then(function(res){
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
