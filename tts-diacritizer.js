/*
 * Online Arabic diacritization for Tafsir TTS — v1.0.463+
 *
 * Uses the public Hugging Face Gradio Space:
 * MohamedRashad/arabic-auto-tashkeel (CATT)
 *
 * This is intentionally an OPTIONAL preprocessing layer. Any network,
 * API, model, CORS, quota, sleeping-space, or parsing failure falls back
 * to the existing local TTS pipeline without affecting playback.
 *
 * Display text is never changed. Only the text handed to TTS is affected.
 *
 * Cache layers:
 *   1. In-memory (session) — sync, instant
 *   2. IndexedDB (persistent) — survives refresh; never blocks CATT
 *   3. CATT online inference
 *
 * IndexedDB keeps up to MAX_IDB_ENTRIES results (oldest pruned).
 */
(function(global){
  'use strict';

  var SPACE = 'MohamedRashad/arabic-auto-tashkeel';
  var MODEL = 'Encoder-Decoder';
  var MAX_CHARS = 5000;
  var TIMEOUT_MS = 12000;
  var MAX_IDB_ENTRIES = 400;
  var IDB_NAME = 'mushaf-catt-cache';
  var IDB_STORE = 'results';
  var IDB_VERSION = 1;
  // Never let IDB delay the start of a CATT request by more than this.
  var IDB_LOOKUP_BUDGET_MS = 120;

  var clientPromise = null;
  var cattAppPromise = null;
  var cache = Object.create(null);
  var pending = Object.create(null);
  var idb = null;
  var idbReady = null;

  // ------------------------------------------------------------------
  // IndexedDB (side channel — must never block CATT)
  // ------------------------------------------------------------------

  function openIDB(){
    if(idbReady) return idbReady;
    if(typeof indexedDB === 'undefined'){
      idbReady = Promise.resolve(null);
      return idbReady;
    }
    idbReady = new Promise(function(resolve){
      try{
        var req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = function(ev){
          var db = ev.target.result;
          if(!db.objectStoreNames.contains(IDB_STORE)){
            var store = db.createObjectStore(IDB_STORE, { keyPath: 'key' });
            store.createIndex('ts', 'ts', { unique: false });
          }
        };
        req.onsuccess = function(ev){
          idb = ev.target.result;
          resolve(idb);
        };
        req.onerror = function(){ idb = null; resolve(null); };
        req.onblocked = function(){ resolve(idb); };
      }catch(e){
        idb = null;
        resolve(null);
      }
    });
    return idbReady;
  }

  function idbGet(key){
    return openIDB().then(function(db){
      if(!db) return null;
      return new Promise(function(resolve){
        try{
          var tx = db.transaction(IDB_STORE, 'readonly');
          var req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = function(){
            var row = req.result;
            resolve(row && typeof row.value === 'string' ? row.value : null);
          };
          req.onerror = function(){ resolve(null); };
        }catch(e){
          resolve(null);
        }
      });
    });
  }

  function idbPut(key, value){
    openIDB().then(function(db){
      if(!db || !key || !value) return;
      try{
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        store.put({ key: key, value: value, ts: Date.now() });
        tx.oncomplete = function(){ pruneIDB(db); };
      }catch(e){}
    });
  }

  function pruneIDB(db){
    try{
      var tx = db.transaction(IDB_STORE, 'readonly');
      var countReq = tx.objectStore(IDB_STORE).count();
      countReq.onsuccess = function(){
        var count = countReq.result || 0;
        if(count <= MAX_IDB_ENTRIES) return;
        var excess = count - MAX_IDB_ENTRIES;
        try{
          var delTx = db.transaction(IDB_STORE, 'readwrite');
          var delStore = delTx.objectStore(IDB_STORE);
          var idx = delStore.index('ts');
          var deleted = 0;
          idx.openCursor().onsuccess = function(ev){
            var cursor = ev.target.result;
            if(!cursor || deleted >= excess) return;
            delStore.delete(cursor.primaryKey);
            deleted++;
            cursor.continue();
          };
        }catch(e){}
      };
    }catch(e){}
  }

  function idbClear(){
    return openIDB().then(function(db){
      if(!db) return;
      return new Promise(function(resolve){
        try{
          var tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).clear();
          tx.oncomplete = function(){ resolve(); };
          tx.onerror = function(){ resolve(); };
        }catch(e){ resolve(); }
      });
    });
  }

  // Open early, non-blocking
  openIDB();

  // ------------------------------------------------------------------
  // Core (same as working smart-wait version)
  // ------------------------------------------------------------------

  function loadClient(){
    if(clientPromise) return clientPromise;
    clientPromise = import('https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js')
      .then(function(mod){
        var Client = mod && (mod.Client || (mod.default && mod.default.Client));
        if(!Client) throw new Error('Gradio Client export not found');
        return Client;
      });
    return clientPromise;
  }

  function stripArabicMarks(text){
    return String(text || '')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
      .replace(/\u0671/g, '\u0627');
  }

  // Word = base Arabic letter + optional continuation (letters / tatweel / diacritics).
  // Diacritics must NOT break the word, otherwise buildInput sends "م ح ي"
  // and CATT sees separate tokens. Same RE is used by restoreSkeleton so
  // input word count always matches restore unit count.
  var AR_WORD_RE = /[\u0621-\u063A\u0641-\u064A\u0671][\u0621-\u063A\u0641-\u064A\u0671\u0640\u064B-\u065F\u0670]*/g;

  function buildInput(text){
    var words = [];
    String(text || '').replace(AR_WORD_RE, function(word){
      words.push(stripArabicMarks(word));
      return word;
    });
    return { input: words.join(' '), count: words.length };
  }

  // True if the word carries linguistic tashkeel worth preserving from SOURCE.
  // Tatweel alone is not tashkeel. Quranic annotation marks (06D6–06ED) are
  // intentionally excluded from this gate.
  function wordHasTashkeel(w){
    return /[\u064B-\u065F\u0670]/.test(String(w || ''));
  }

  // Map CATT (or cached) vocalized words back onto SOURCE word slots.
  // Policy: if SOURCE word already has tashkeel, keep SOURCE; otherwise take CATT.
  // Same AR_WORD_RE as buildInput → input/restore word-count invariant holds.
  function restoreSkeleton(original, vocalized){
    var outWords = String(vocalized || '').trim().split(/\s+/).filter(Boolean);
    var source = String(original || '');
    var index = 0;
    var ok = true;
    var out = source.replace(AR_WORD_RE, function(origWord){
      if(index >= outWords.length){ ok = false; return origWord; }
      var cattWord = outWords[index++];
      if(wordHasTashkeel(origWord)) return origWord;
      return cattWord;
    });
    if(index !== outWords.length) ok = false;
    return ok ? out : null;
  }

  // Re-apply preserve against SOURCE for any cached/CATT string.
  // Used on memory + IDB hits so old bad cache cannot overwrite marked words.
  function preserveSourceTashkeel(source, candidate){
    if(!source || !candidate) return candidate || source;
    var fixed = restoreSkeleton(source, candidate);
    return fixed != null ? fixed : candidate;
  }

  function withTimeout(promise){
    return Promise.race([
      promise,
      new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, TIMEOUT_MS); })
    ]);
  }

  function connectCATT(){
    if(cattAppPromise) return cattAppPromise;
    cattAppPromise = loadClient().then(function(Client){
      return Client.connect(SPACE);
    }).catch(function(err){
      cattAppPromise = null;
      throw err;
    });
    return cattAppPromise;
  }

  function getCached(text){
    if(!text || typeof text !== 'string') return null;
    var built = buildInput(text);
    if(!built.input) return null;
    if(!Object.prototype.hasOwnProperty.call(cache, built.input)) return null;
    // Always re-apply preserve so stale cache cannot override SOURCE tashkeel
    var fixed = preserveSourceTashkeel(text, cache[built.input]);
    cache[built.input] = fixed;
    return fixed;
  }

  // Fast IDB probe with hard budget so it never delays CATT start.
  function probeIdb(key){
    return Promise.race([
      idbGet(key),
      new Promise(function(resolve){
        setTimeout(function(){ resolve(null); }, IDB_LOOKUP_BUDGET_MS);
      })
    ]);
  }

  // ------------------------------------------------------------------
  // Page cache (session-only)
  // ------------------------------------------------------------------

  var PAGE_CACHE = Object.create(null);
  var PAGE_ORDER = [];

  function pageCacheKey(pageKey){
    return String(pageKey == null ? '' : pageKey);
  }

  function rememberPage(pageKey, textMap){
    var key = pageCacheKey(pageKey);
    if(!key || !textMap) return;
    PAGE_CACHE[key] = textMap;
    PAGE_ORDER = PAGE_ORDER.filter(function(k){ return k !== key; });
    PAGE_ORDER.push(key);
    while(PAGE_ORDER.length > 3){
      var old = PAGE_ORDER.shift();
      delete PAGE_CACHE[old];
    }
  }

  function getPageCached(pageKey){
    return PAGE_CACHE[pageCacheKey(pageKey)] || null;
  }

  function clearPageCache(){
    PAGE_CACHE = Object.create(null);
    PAGE_ORDER = [];
  }

  // ------------------------------------------------------------------
  // Diacritize — same control flow as working version, plus IDB side-channel
  // ------------------------------------------------------------------

  function warm(text){
    return diacritize(text);
  }

  function diacritize(text){
    if(!text || typeof text !== 'string') return Promise.resolve(text);
    if(typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(text);
    if(text.length > MAX_CHARS) return Promise.resolve(text);

    var built = buildInput(text);
    if(!built.input || built.count === 0) return Promise.resolve(text);

    var key = built.input;
    if(Object.prototype.hasOwnProperty.call(cache, key)){
      var fixedMem = preserveSourceTashkeel(text, cache[key]);
      cache[key] = fixedMem;
      return Promise.resolve(fixedMem);
    }

    // Share in-flight request for the same text
    if(pending[key]) return pending[key];

    // 1) Quick IDB probe (≤120ms). If hit → use it, never call CATT.
    // 2) Otherwise start CATT immediately (same path as smart-wait).
    pending[key] = probeIdb(key).then(function(fromIdb){
      if(fromIdb){
        // Heal old cache against current SOURCE tashkeel
        var fixedIdb = preserveSourceTashkeel(text, fromIdb);
        cache[key] = fixedIdb;
        idbPut(key, fixedIdb);
        return fixedIdb;
      }

      // Identical to the known-good smart-wait path
      return withTimeout(connectCATT().then(function(app){
        return app.predict('/infer_catt', [built.input, MODEL]);
      }).then(function(result){
        var data = result && result.data;
        var vocalized = Array.isArray(data) ? data[0] : data;
        if(typeof vocalized !== 'string' || !vocalized.trim()) return text;
        var restored = restoreSkeleton(text, vocalized);
        if(!restored) return text;
        cache[key] = restored;
        // Persist for next session / refresh
        idbPut(key, restored);
        try{ console.debug('[TTS][CATT] online diacritization applied + persisted'); }catch(e){}
        return cache[key];
      }).catch(function(err){
        try{ console.debug('[TTS][CATT] unavailable; using local pipeline', err); }catch(e){}
        return text;
      }));
    }).then(function(result){
      delete pending[key];
      // withTimeout may yield null on hard timeout — normalize to original text
      return (result != null && typeof result === 'string') ? result : text;
    }, function(err){
      delete pending[key];
      return text;
    });

    return pending[key];
  }

  function getReadyOrWarm(text){
    var cached = getCached(text);
    if(cached) return Promise.resolve(cached);
    return diacritize(text);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  global.diacritizeTtsOnline = diacritize;
  global.TTS_CATT_ONLINE = {
    initialize: function(){
      openIDB();
      return connectCATT();
    },
    cachePage: function(pageKey, textMap){
      rememberPage(pageKey, textMap);
    },
    getPageCached: getPageCached,
    clearPageCache: clearPageCache,
    clearCache: function(){
      cache = Object.create(null);
      pending = Object.create(null);
      return idbClear();
    },
    warmConnection: function(){
      if(typeof navigator !== 'undefined' && navigator.onLine === false){
        return Promise.resolve(null);
      }
      openIDB();
      return connectCATT().catch(function(){ return null; });
    },
    getCached: getCached,
    getReadyOrWarm: getReadyOrWarm,
    warm: warm,
    enabled: true,
    space: SPACE,
    model: MODEL,
    maxIdbEntries: MAX_IDB_ENTRIES
  };
})(typeof window !== 'undefined' ? window : self);
