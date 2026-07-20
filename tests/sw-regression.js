#!/usr/bin/env node
// =====================================================================
// Service Worker Cache-Strategy Regression Suite — مصحف الركوع
// =====================================================================
// Runs standalone via `node tests/sw-regression.js` — no build step, no
// dependencies. Loads the ACTUAL shipped sw.js in a small hand-rolled
// Service-Worker shim (fake self/caches/fetch) and drives its real
// 'fetch' event listener directly.
//
// PROJECT RULE: run against files extracted from the final packaged ZIP
// before any release that touches sw.js (same rule already enforced for
// searchManager.js/readerManager.js by search-regression.js).
//
// NOTE: the real sw.js races the network fetch against a 4000ms timer
// (NETWORK_TIMEOUT_MS) before falling back to cache. Waiting out a real
// 4+ seconds per test run would make this suite slow to the point nobody
// runs it — so this loader substitutes a much shorter timeout (see
// loadServiceWorker() below) purely for test speed. The substitution
// only changes the NUMBER, never the logic being tested.
//
// Usage:
//   node tests/sw-regression.js
//   node tests/sw-regression.js --dir /path/to/unzipped-release
//
// Exit code 0 = all pass. Exit code 1 = at least one failure.
// =====================================================================

var fs = require('fs');
var path = require('path');

var dirArgIdx = process.argv.indexOf('--dir');
var PROJECT_DIR = dirArgIdx !== -1 && process.argv[dirArgIdx + 1]
  ? process.argv[dirArgIdx + 1]
  : path.join(__dirname, '..');

var results = { pass: 0, fail: 0 };
var failures = [];
function check(label, cond, detail){
  var ok = (cond === true);
  if(ok){
    results.pass++;
  } else {
    results.fail++;
    failures.push(label + (detail ? ' — ' + detail : ''));
  }
}
function sleep(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }

// ---------------------------------------------------------------------
// Minimal fake Cache Storage — enough for sw.js's fetch handler (open,
// put, match). install/activate aren't exercised by this suite.
// ---------------------------------------------------------------------
function makeFakeCaches(){
  var store = {}; // url -> response
  var putCalls = [];
  var fakeCache = {
    put: function(req, res){
      var url = typeof req === 'string' ? req : req.url;
      store[url] = res;
      putCalls.push({ url: url, status: res && res.status });
      return Promise.resolve();
    },
    match: function(req){
      var url = typeof req === 'string' ? req : req.url;
      return Promise.resolve(store[url]);
    },
    addAll: function(){ return Promise.resolve(); },
    keys: function(){ return Promise.resolve(Object.keys(store).map(function(u){ return { url: u }; })); },
    delete: function(){ return Promise.resolve(true); }
  };
  var fakeCaches = {
    open: function(){ return Promise.resolve(fakeCache); },
    match: function(req){ return fakeCache.match(req); }, // caches.match(...) fallback used by sw.js's fetch handler
    keys: function(){ return Promise.resolve([]); },
    delete: function(){ return Promise.resolve(true); }
  };
  return { caches: fakeCaches, cache: fakeCache, putCalls: putCalls, store: store };
}

function fakeResponse(status){
  return {
    status: status,
    clone: function(){ return fakeResponse(status); }
  };
}

// ---------------------------------------------------------------------
// Loads sw.js with a fake `self`/`caches`/`fetch`/`importScripts`, and
// returns the registered 'fetch' listener so the test can call it
// directly with a synthetic FetchEvent-like object.
// ---------------------------------------------------------------------
function loadServiceWorker(fetchImpl){
  var listeners = {};
  var fakeCachesEnv = makeFakeCaches();

  global.self = {
    addEventListener: function(type, fn){ listeners[type] = fn; },
    skipWaiting: function(){},
    clients: { claim: function(){} },
    location: { origin: 'http://127.0.0.1' }
  };
  global.caches = fakeCachesEnv.caches;
  global.fetch = fetchImpl;
  global.importScripts = function(){
    var verSrc = fs.readFileSync(path.join(PROJECT_DIR, 'version.js'), 'utf8');
    // eslint-disable-next-line no-eval
    eval(verSrc); // assigns self.APP_VERSION, same as a real importScripts('./version.js')
  };

  var full = path.join(PROJECT_DIR, 'sw.js');
  if(!fs.existsSync(full)) throw new Error('Missing required file: ' + full);
  var src = fs.readFileSync(full, 'utf8');
  // Test-only substitution — see file header note above.
  var patched = src.replace('const NETWORK_TIMEOUT_MS = 4000;', 'const NETWORK_TIMEOUT_MS = 25;');
  check('sw.js still contains the expected NETWORK_TIMEOUT_MS declaration to patch',
    patched !== src, 'NETWORK_TIMEOUT_MS constant not found — sw.js structure changed, update this test');
  // eslint-disable-next-line no-eval
  eval(patched);

  if(!listeners.fetch) throw new Error('sw.js loaded but did not register a fetch listener.');
  return { fetchListener: listeners.fetch, env: fakeCachesEnv };
}

function makeEvent(url){
  var respondWithPromise = null;
  var waitUntilPromises = [];
  return {
    request: { method: 'GET', url: url },
    respondWith: function(p){ respondWithPromise = p; },
    waitUntil: function(p){ waitUntilPromises.push(p); },
    getRespondWithPromise: function(){ return respondWithPromise; },
    getWaitUntilPromises: function(){ return waitUntilPromises; }
  };
}

async function run(){
  // -------------------------------------------------------------
  // Case: a same-origin HTML/JS request whose network fetch is SLOWER
  // than the timeout but still eventually SUCCEEDS. The timeout should
  // still make respondWith() fall back to cache promptly (unchanged
  // behavior) — but the slow-yet-successful response must still get
  // written to cache once it lands, per sw.js's own documented intent
  // ("left to finish in the background so a same-URL cache.put() from a
  // slow-but-eventually-successful response still lands").
  // -------------------------------------------------------------
  var sw = loadServiceWorker(function(request){
    return sleep(60).then(function(){ return fakeResponse(200); }); // slower than the 25ms test timeout
  });

  var url = 'http://127.0.0.1/app.js';
  var event = makeEvent(url);
  sw.fetchListener(event);

  var respondPromise = event.getRespondWithPromise();
  check('fetch handler calls respondWith() synchronously', !!respondPromise);
  await respondPromise; // timeout should win the race quickly (~25ms)

  // Give the slow-but-successful network fetch time to actually resolve
  // (60ms fetch + a little slack) and its own .then()/cache.put() to run.
  await sleep(120);
  await Promise.all(sw.env.putCalls.map(function(){ return Promise.resolve(); }));

  var cached = await sw.env.cache.match(url);
  check(
    'a slow-but-successful network response still gets written to cache after losing the timeout race',
    !!cached && cached.status === 200,
    'cache.put() was never called for ' + url + ' — putCalls=' + JSON.stringify(sw.env.putCalls)
  );

  // -------------------------------------------------------------
  // Case: cross-origin requests (recitation audio / tafsir JSON) must
  // never be intercepted at all — no respondWith() call.
  // -------------------------------------------------------------
  delete global.self;
  delete global.caches;
  delete global.fetch;
  delete global.importScripts;
  var sw2 = loadServiceWorker(function(){ return Promise.resolve(fakeResponse(200)); });
  var crossOriginEvent = makeEvent('https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001001.mp3');
  sw2.fetchListener(crossOriginEvent);
  check(
    'cross-origin requests are left completely untouched (no respondWith)',
    crossOriginEvent.getRespondWithPromise() === null
  );
}

run().then(function(){
  console.log('\n=== Service Worker Regression Suite — ' + PROJECT_DIR + ' ===');
  console.log('PASS: ' + results.pass + '   FAIL: ' + results.fail);
  if(failures.length){
    console.log('\nFailures:');
    failures.forEach(function(f){ console.log(' - ' + f); });
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}).catch(function(err){
  console.error('Test suite crashed:', err);
  process.exitCode = 1;
});
