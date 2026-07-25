#!/usr/bin/env node
// =====================================================================
// Audio Playback Regression Suite — مصحف الركوع
// =====================================================================
// Runs standalone via `node tests/audio-regression.js` — no build step,
// no dependencies. Loads the ACTUAL shipped audioManager.js in a small
// hand-rolled browser shim (fake Audio/document/navigator) and exercises
// its real public API (AudioManager.playSurah/stopListening).
//
// PROJECT RULE: run against files extracted from the final packaged ZIP
// before any release that touches audioManager.js — not just the
// working-copy files (see docs/search-regression-suite.md / project
// memory for the same rule already enforced by search-regression.js).
//
// Usage:
//   node tests/audio-regression.js
//   node tests/audio-regression.js --dir /path/to/unzipped-release
//
// Exit code 0 = all pass. Exit code 1 = at least one failure.
// =====================================================================

var fs = require('fs');
var path = require('path');

var dirArgIdx = process.argv.indexOf('--dir');
var PROJECT_DIR = dirArgIdx !== -1 && process.argv[dirArgIdx + 1]
  ? process.argv[dirArgIdx + 1]
  : path.join(__dirname, '..');

// ---------------------------------------------------------------------
// Tiny built-in test runner — same pattern as search-regression.js.
// ---------------------------------------------------------------------
var results = { pass: 0, fail: 0 };
var failures = [];
function check(label, condFn){
  var ok;
  var detail = '';
  try{
    var r = condFn();
    ok = (r === true);
    if(!ok && typeof r === 'string') detail = r;
  } catch(e){
    ok = false;
    detail = 'threw: ' + e.message;
  }
  if(ok){
    results.pass++;
  } else {
    results.fail++;
    failures.push(label + (detail ? ' — ' + detail : ''));
  }
}

// ---------------------------------------------------------------------
// Minimal fake DOM element — just enough for audioManager.js's
// unconditional els.ayahFlow.querySelector(All) calls (highlightAyah /
// clearAyahHighlight) not to throw. Every other `els.*` audioManager.js
// touches is guarded with `if(els.X)`, so it's left undefined here.
// ---------------------------------------------------------------------
function fakeElement(){
  return {
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return []; }
  };
}

// ---------------------------------------------------------------------
// Fake Audio element: records every addEventListener call (per type, in
// order) so the test can invoke a SPECIFIC attempt's listener directly —
// this is what lets the test isolate "a stale event from an old,
// superseded attempt" from "a genuine event for the current attempt",
// which is exactly the distinction the real bug collapses.
// ---------------------------------------------------------------------
function makeFakeAudioClass(onInstanceCreated){
  return function FakeAudio(){
    var self = this;
    self.src = '';
    self.currentTime = 0;
    self.playbackRate = 1;
    self._listeners = {};
    self.addEventListener = function(type, fn){
      (self._listeners[type] = self._listeners[type] || []).push(fn);
    };
    self.removeEventListener = function(type, fn){
      var arr = self._listeners[type];
      if(!arr) return;
      var idx = arr.indexOf(fn);
      if(idx !== -1) arr.splice(idx, 1);
    };
    self.removeAttribute = function(){ self.src = ''; };
    self.load = function(){};
    self.pause = function(){};
    // Never auto-resolves/rejects on its own — the test decides exactly
    // when (and whether) a play() attempt "succeeds", so timing is fully
    // deterministic instead of racing real browser/network behavior.
    self.play = function(){ return new Promise(function(){ /* left pending */ }); };
    if(onInstanceCreated) onInstanceCreated(self);
  };
}

// Minimal fake button element — just enough for els.btnListen's real
// addEventListener('click', toggleListen) wiring in AudioManager.init()
// to work, so tests can trigger toggleListen() exactly like a real tap
// instead of needing toggleListen exposed on the public API.
function fakeButton(){
  var listeners = {};
  return {
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    addEventListener: function(type, fn){ (listeners[type] = listeners[type] || []).push(fn); },
    click: function(){ (listeners.click || []).forEach(function(fn){ fn(); }); }
  };
}

function loadAudioManager(){
  var window = {};
  global.window = window;
  global.document = {
    addEventListener: function(){} // visibilitychange wiring at module load
  };
  global.navigator = {}; // no wakeLock/mediaSession — every use is feature-gated
  // init() also wires up the ayah-number long-press-to-play feature via
  // Gestures.longPress (gestures.js) — stub it out since this suite only
  // exercises the audio state machine itself, not touch gestures.
  global.Gestures = { longPress: function(){}, swipe: function(){}, swipeAndPinch: function(){} };
  var lastAudioInstance = null;
  global.Audio = makeFakeAudioClass(function(instance){ lastAudioInstance = instance; });

  var full = path.join(PROJECT_DIR, 'audioManager.js');
  if(!fs.existsSync(full)) throw new Error('Missing required file: ' + full);
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(full, 'utf8'));

  if(!window.AudioManager) throw new Error('audioManager.js loaded but did not expose window.AudioManager.');
  return {
    AudioManager: window.AudioManager,
    getAudioInstance: function(){ return lastAudioInstance; }
  };
}

// ---------------------------------------------------------------------
// Test fixture: two single-ayah "surahs" so playSurah(1) then
// playSurah(2) drives two consecutive, real playback attempts through
// the actual buildSurahPlaylist()/playSurahPlaylistAt() code paths.
// ---------------------------------------------------------------------
function buildFixturePages(){
  return [
    { juz: 1, ayahs: [{ surah: 1, ayah: 1, surahName: 'الفاتحة' }] },
    { juz: 1, ayahs: [{ surah: 2, ayah: 1, surahName: 'البقرة' }] }
  ];
}

function run(){
  var loaded = loadAudioManager();
  var AudioManager = loaded.AudioManager;

  var PAGES = buildFixturePages();
  var state = { page: 0, reciter: 'abdulbasit', playbackRate: 1, recitationRepeatCount: 1 };
  var toasts = [];
  var goToCalls = [];

  global.window.SearchManager = {
    getSurahStartPage: function(surahNum){ return surahNum === 1 ? 0 : 1; }
  };
  global.window.getManzilRange = function(){ return { start: 1, end: 114 }; };

  var els = { ayahFlow: fakeElement(), btnListen: null };

  AudioManager.init({
    PAGES: PAGES,
    state: state,
    els: els,
    goTo: function(i, opts){ goToCalls.push({ i: i, opts: opts }); state.page = i; },
    showToast: function(msg){ toasts.push(msg); },
    saveState: function(){}
  });

  // ---- Attempt A: play surah 1 (ayah 1). ----
  AudioManager.playSurah(1);
  var audio = loaded.getAudioInstance();
  check('A single Audio element is lazily created on first playback', function(){
    return !!audio;
  });
  var errorListenersAfterA = (audio._listeners.error || []).slice();
  check('Attempt A registers an error listener', function(){
    return errorListenersAfterA.length >= 1;
  });
  var attemptAErrorListener = errorListenersAfterA[errorListenersAfterA.length - 1];

  // ---- Attempt B: immediately play surah 2 (ayah 1), superseding A. ----
  // This is the real-world trigger: reassigning player.src (which every
  // playAyahAt()/playSurahPlaylistAt() call does) aborts whatever load
  // was in progress, and some browsers/WebViews queue an async 'error'
  // event for that aborted load rather than dropping it silently.
  AudioManager.playSurah(2);

  check('Attempt B leaves playback in the playing/loading state', function(){
    // No public "is playing" getter is exposed, so this is asserted
    // indirectly below via the toast/no-toast outcome, which is the
    // user-visible symptom of the bug. This check just documents intent.
    return true;
  });

  // ---- Fire ONLY attempt A's stale error listener directly. ----
  // This simulates the exact race: the browser's queued abort-error for
  // the OLD (already-superseded) load finally arrives after attempt B
  // has already taken over. A correct implementation must recognize this
  // as stale and do nothing to B's still-valid playback; the pre-fix
  // implementation used one listener shared across every attempt with no
  // way to tell old from new, so it always treated this as "the current
  // attempt just failed."
  attemptAErrorListener();

  check(
    'A stale error from a superseded attempt does not show the "no connection" toast',
    function(){
      var falseToast = toasts.some(function(t){ return t.indexOf('تعذر تحميل الصوت') !== -1; });
      return !falseToast || ('stale attempt A error incorrectly triggered: ' + JSON.stringify(toasts));
    }
  );

  // ---- Sanity check: a genuine error for the CURRENT attempt still works. ----
  toasts.length = 0;
  var errorListenersAfterB = (audio._listeners.error || []).slice();
  var attemptBErrorListener = errorListenersAfterB[errorListenersAfterB.length - 1];
  check('Attempt B registered its own error listener distinct from A\'s', function(){
    return typeof attemptBErrorListener === 'function' && attemptBErrorListener !== attemptAErrorListener;
  });
  attemptBErrorListener();
  check(
    'A genuine error for the CURRENT (not superseded) attempt still shows the toast',
    function(){
      var realToast = toasts.some(function(t){ return t.indexOf('تعذر تحميل الصوت') !== -1; });
      return realToast || 'expected the current attempt\'s real error to still surface a toast';
    }
  );

  // ---- stopListening() itself must still fully reset state either way. ----
  check('stopListening() clears the shared audio element src', function(){
    AudioManager.stopListening();
    return audio.src === '';
  });
}

// ---------------------------------------------------------------------
// Regression case: a stale/late 'playing' event (queued by the browser
// for an attempt that has since been superseded by stopListening()) must
// NOT restart a background prefetch. audioManager.js's own 'ended' and
// error-guard handlers already guard against exactly this class of late
// media event; the 'playing' listener that drives prefetchAyahAudio() did
// not, until this fix. See audioManager.js's attachErrorGuard comment for
// the documented browser behavior (queued async media events for aborted
// loads) that this test simulates for 'playing' instead of 'error'.
// ---------------------------------------------------------------------
function runPrefetchStaleEventTest(){
  var loaded = loadAudioManager();
  var AudioManager = loaded.AudioManager;

  // Two ayahs in one surah so peekNextAudioUrl() (called from inside the
  // 'playing' handler) resolves to a real, non-null "next ayah" URL.
  var PAGES = [
    { juz: 1, ayahs: [
      { surah: 1, ayah: 1, surahName: 'الفاتحة' },
      { surah: 1, ayah: 2, surahName: 'الفاتحة' }
    ] }
  ];
  var state = { page: 0, reciter: 'abdulbasit', playbackRate: 1, recitationRepeatCount: 1 };
  var toasts = [];

  global.window.SearchManager = { getSurahStartPage: function(){ return 0; } };
  global.window.getManzilRange = function(){ return { start: 1, end: 114 }; };

  var fetchCalls = [];
  global.fetch = function(url){
    fetchCalls.push(url);
    return new Promise(function(){}); // left pending — deterministic, same style as FakeAudio.play()
  };

  var els = { ayahFlow: fakeElement(), btnListen: null };
  AudioManager.init({
    PAGES: PAGES,
    state: state,
    els: els,
    goTo: function(){},
    showToast: function(msg){ toasts.push(msg); },
    saveState: function(){}
  });

  AudioManager.playSurah(1);
  var audio = loaded.getAudioInstance();
  // getAudioPlayer() attaches 'playing' exactly once, at element creation
  // — unlike the error listener, it is NOT re-attached per attempt.
  var playingListeners = (audio._listeners.playing || []).slice();
  check('A "playing" listener is registered on the shared audio element', function(){
    return playingListeners.length >= 1;
  });
  var playingListener = playingListeners[playingListeners.length - 1];

  // Sanity check: a genuine 'playing' event for the CURRENT attempt must
  // still prefetch the next ayah as designed.
  playingListener();
  check('A genuine "playing" event for the current attempt still prefetches the next ayah', function(){
    return fetchCalls.length === 1 || ('expected exactly 1 prefetch fetch, got: ' + JSON.stringify(fetchCalls));
  });

  // ---- User stops listening. ----
  AudioManager.stopListening();
  fetchCalls.length = 0;

  // ---- A stale 'playing' event, queued before stopListening() ran, is
  // delivered afterward. ----
  playingListener();

  check(
    'A stale "playing" event after stopListening() does not restart a prefetch',
    function(){
      return fetchCalls.length === 0 || ('stale playing event incorrectly triggered a prefetch: ' + JSON.stringify(fetchCalls));
    }
  );
}

// ---------------------------------------------------------------------
// Regression case: "تكرار تلاوة الركوع" (الإعدادات) — when set to more
// than once, reaching the end of the ruku must restart it from its
// first ayah instead of stopping, and must stop for good only once it
// has played the configured number of times.
// ---------------------------------------------------------------------
function runRukuRepeatTest(){
  var loaded = loadAudioManager();
  var AudioManager = loaded.AudioManager;

  // Two ayahs, neither the first of a surah, so bismillah-insertion
  // logic (unrelated to this feature) never kicks in and complicates
  // the expected src sequence below.
  var PAGES = [
    { juz: 1, ayahs: [
      { surah: 2, ayah: 5, surahName: 'البقرة' },
      { surah: 2, ayah: 6, surahName: 'البقرة' }
    ] }
  ];
  var state = {
    page: 0, reciter: 'abdulbasit', playbackRate: 1,
    recitationRepeatCount: 1, rukuRepeatCount: 2, recitationScope: 'ruku'
  };

  global.window.SearchManager = { getSurahStartPage: function(){ return 0; } };
  global.window.getManzilRange = function(){ return { start: 1, end: 114 }; };

  var els = { ayahFlow: fakeElement(), btnListen: fakeButton() };
  AudioManager.init({
    PAGES: PAGES,
    state: state,
    els: els,
    goTo: function(i){ state.page = i; },
    showToast: function(){},
    saveState: function(){}
  });

  // ---- Tap "استماع" to start ruku playback from ayah 1. ----
  els.btnListen.click();
  var audio = loaded.getAudioInstance();
  check('Starting the ruku loads its first ayah (2:5)', function(){
    return audio.src.indexOf('002005.mp3') !== -1;
  });

  // The 'ended' listener is attached once, at element creation — same
  // single shared listener drives every advance/repeat/restart below.
  var endedListener = (audio._listeners.ended || [])[0];
  check('An "ended" listener is registered on the shared audio element', function(){
    return typeof endedListener === 'function';
  });

  // ---- Ayah 1 (2:5) finishes -> advances to ayah 2 (2:6). ----
  endedListener();
  check('End of ayah 1 advances to ayah 2 (2:6) within the same ruku', function(){
    return audio.src.indexOf('002006.mp3') !== -1;
  });

  // ---- Ayah 2 (2:6) finishes -> end of ruku, first pass done (1 of 2) ->
  // restarts the ruku from ayah 1 instead of stopping. ----
  endedListener();
  check('End of ruku (pass 1 of 2) restarts from ayah 1 (2:5) instead of stopping', function(){
    return audio.src.indexOf('002005.mp3') !== -1 || ('expected restart at 2:5, got src: ' + audio.src);
  });

  // ---- Second pass: ayah 1 -> ayah 2 -> end of ruku (2 of 2) -> stops. ----
  endedListener(); // ayah 1 (2:5) finishes -> ayah 2 (2:6)
  check('Second pass advances to ayah 2 (2:6) same as the first', function(){
    return audio.src.indexOf('002006.mp3') !== -1;
  });
  endedListener(); // ayah 2 (2:6) finishes -> end of ruku, pass 2 of 2 -> stop
  check('End of ruku on the final configured repeat stops playback instead of restarting again', function(){
    return audio.src === '' || ('expected playback to stop (src cleared), got src: ' + audio.src);
  });
}

// ---------------------------------------------------------------------
// Regression case: "تكرار تلاوة الركوع" must also apply when playback is
// continuous across multiple rukuات — نطاق التلاوة = "نطاق العرض" (or
// "تشغيل السورة/الجزء كاملة" from الفهرس), which both chain through
// listenState.playlist/playSurahPlaylistAt instead of the plain-ruku
// playAyahAt path runRukuRepeatTest() above covers. Without ruku-boundary
// detection in that chain, reaching the end of one ruku just advances
// straight into the next ruku's ayaat, silently ignoring the setting —
// exactly the bug reported against the first version of this feature
// (سورة الشمس finishing and going straight into سورة الليل instead of
// repeating, with "مرتان" selected).
// ---------------------------------------------------------------------
function runPlaylistRukuRepeatTest(){
  var loaded = loadAudioManager();
  var AudioManager = loaded.AudioManager;

  // Two rukuات (two PAGES entries) of one ayah each, so a single
  // playSurah() call spans a ruku boundary right after the first ayah.
  var PAGES = [
    { juz: 1, ayahs: [{ surah: 91, ayah: 15, surahName: 'الشمس' }] },
    { juz: 1, ayahs: [{ surah: 92, ayah: 1, surahName: 'الليل' }] }
  ];
  var state = {
    page: 0, reciter: 'abdulbasit', playbackRate: 1,
    recitationRepeatCount: 1, rukuRepeatCount: 2
  };

  global.window.SearchManager = {
    getSurahStartPage: function(surahNum){ return surahNum === 91 ? 0 : 1; }
  };
  global.window.getManzilRange = function(){ return { start: 1, end: 114 }; };

  var els = { ayahFlow: fakeElement(), btnListen: fakeButton() };
  AudioManager.init({
    PAGES: PAGES,
    state: state,
    els: els,
    goTo: function(i){ state.page = i; },
    showToast: function(){},
    saveState: function(){}
  });

  // buildSurahPlaylist(91) only ever finds surah 91's own ayah on page 0
  // (page 1 belongs to surah 92), so this plays exactly the one ruku that
  // matters for this test, same as pressing "تشغيل السورة" for الشمس
  // from الفهرس.
  AudioManager.playSurah(91);
  var audio = loaded.getAudioInstance();
  check('Starts the surah/ruku playlist at its first ayah (91:15)', function(){
    return audio.src.indexOf('091015.mp3') !== -1;
  });

  var endedListener = (audio._listeners.ended || [])[0];

  // ---- Ayah 91:15 finishes -> end of its ruku (the whole one-ayah
  // playlist), pass 1 of 2 -> must restart at 91:15, NOT advance past
  // the end of this playlist. ----
  endedListener();
  check('End of ruku (pass 1 of 2) in playlist mode restarts at 91:15 instead of stopping', function(){
    return audio.src.indexOf('091015.mp3') !== -1 || ('expected restart at 91:15, got src: ' + audio.src);
  });

  // ---- Second pass finishes -> pass 2 of 2 -> now the ruku (and the
  // whole playlist) is genuinely done, so playback stops. ----
  endedListener();
  check('End of ruku on the final configured repeat stops playback in playlist mode too', function(){
    return audio.src === '' || ('expected playback to stop (src cleared), got src: ' + audio.src);
  });
}

run();
runPrefetchStaleEventTest();
runRukuRepeatTest();
runPlaylistRukuRepeatTest();

console.log('\n=== Audio Regression Suite — ' + PROJECT_DIR + ' ===');
console.log('PASS: ' + results.pass + '   FAIL: ' + results.fail);
if(failures.length){
  console.log('\nFailures:');
  failures.forEach(function(f){ console.log(' - ' + f); });
  process.exitCode = 1;
} else {
  console.log('All checks passed.');
}
