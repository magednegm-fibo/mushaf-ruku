#!/usr/bin/env node
// =====================================================================
// Basmala (البسملة) Regression Suite — مصحف الركوع
// =====================================================================
// Runs standalone via `node tests/bismillah-regression.js` — no build
// step, no dependencies. Loads the ACTUAL shipped audioManager.js in a
// small hand-rolled browser shim and drives it through its real public
// button-click wiring (AudioManager.init() attaches the click listener
// on els.btnListen; this suite captures and fires it directly, the same
// technique tests/audio-regression.js uses for the audio element's own
// listeners).
//
// BUG THIS GUARDS: playlist-driven playback (تشغيل السورة/الجزء من
// الفهرس, أو "نطاق التلاوة = نطاق العرض") already inserts a بسملة clip
// before every surah's first ayah (except الفاتحة, which already IS the
// بسملة, and التوبة, which is never preceded by one) — see
// insertBismillahBeforeSurahs() in audioManager.js. But the DEFAULT
// "استماع" button (نطاق التلاوة = "الركوع", the out-of-the-box setting —
// see storage-manager.js DEFAULTS.recitationScope) calls playAyahAt()
// directly by ayah index, completely bypassing that logic. So pressing
// "استماع" on a ruku that happens to open a new surah played straight
// into the surah's first ayah with no بسملة at all — the common case
// most readers hit by default.
//
// PROJECT RULE: run against files extracted from the final packaged ZIP
// before any release that touches audioManager.js (same rule already
// enforced for searchManager.js/readerManager.js by
// search-regression.js).
//
// Usage:
//   node tests/bismillah-regression.js
//   node tests/bismillah-regression.js --dir /path/to/unzipped-release
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

// ---------------------------------------------------------------------
// Fake DOM element that also supports capturing click listeners (for
// els.btnListen) in addition to the no-op query methods audioManager.js
// unconditionally calls on els.ayahFlow.
// ---------------------------------------------------------------------
function fakeElement(){
  var listeners = {};
  return {
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return []; },
    addEventListener: function(type, fn){ (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: function(){},
    _fire: function(type){ (listeners[type] || []).forEach(function(fn){ fn(); }); }
  };
}

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
    self.play = function(){ return new Promise(function(){ /* left pending — tests fire events manually */ }); };
    self._fire = function(type){ (self._listeners[type] || []).forEach(function(fn){ fn(); }); };
    if(onInstanceCreated) onInstanceCreated(self);
  };
}

function loadAudioManager(){
  var window = {};
  global.window = window;
  global.document = { addEventListener: function(){} };
  global.navigator = {};
  var capturedLongPress = null;
  global.Gestures = {
    longPress: function(options){ capturedLongPress = options; },
    swipe: function(){},
    swipeAndPinch: function(){}
  };
  var lastAudioInstance = null;
  global.Audio = makeFakeAudioClass(function(instance){ lastAudioInstance = instance; });

  var full = path.join(PROJECT_DIR, 'audioManager.js');
  if(!fs.existsSync(full)) throw new Error('Missing required file: ' + full);
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(full, 'utf8'));

  if(!window.AudioManager) throw new Error('audioManager.js loaded but did not expose window.AudioManager.');
  return {
    AudioManager: window.AudioManager,
    getAudioInstance: function(){ return lastAudioInstance; },
    // Simulates long-pressing the ayah-number badge for a given surah:ayah —
    // fires the exact onFire callback wired via setupAyahNumberLongPress()
    // in audioManager.js, the same code path a real long-press gesture
    // (gestures.js) triggers.
    longPressAyahNumber: function(surah, ayah){
      if(!capturedLongPress || !capturedLongPress.onFire) throw new Error('Gestures.longPress was never registered by audioManager.js init()');
      var fakeNumEl = { getAttribute: function(name){
        if(name === 'data-surah') return String(surah);
        if(name === 'data-ayah') return String(ayah);
        return null;
      }};
      capturedLongPress.onFire(fakeNumEl);
    }
  };
}

function setupScenario(pages, pageIdx){
  var loaded = loadAudioManager();
  var state = { page: pageIdx, reciter: 'abdulbasit', playbackRate: 1, recitationRepeatCount: 1, recitationScope: 'ruku' };
  var els = { ayahFlow: fakeElement(), btnListen: fakeElement() };
  loaded.AudioManager.init({
    PAGES: pages,
    state: state,
    els: els,
    goTo: function(){},
    showToast: function(){},
    saveState: function(){}
  });
  return { AudioManager: loaded.AudioManager, getAudio: loaded.getAudioInstance, els: els, state: state, longPressAyahNumber: loaded.longPressAyahNumber };
}

function surahUrlFragment(surah, ayah){
  function pad3(n){ n = String(n); while(n.length < 3) n = '0' + n; return n; }
  return pad3(surah) + pad3(ayah) + '.mp3';
}

function run(){
  // -------------------------------------------------------------
  // Case 1 (the reported bug): default "استماع" press on a ruku whose
  // FIRST ayah opens a new surah (2:1) must play the بسملة clip first,
  // then transition to the real ayah once it finishes.
  // -------------------------------------------------------------
  var pages1 = [{ juz: 1, ayahs: [{ surah: 2, ayah: 1, surahName: 'البقرة' }] }];
  var s1 = setupScenario(pages1, 0);
  s1.els.btnListen._fire('click'); // press "استماع"
  var audio1 = s1.getAudio();
  check('Case 1: pressing "استماع" on a ruku starting a new surah plays البسملة (001001.mp3) first, not the surah\'s own ayah audio',
    !!audio1 && audio1.src.indexOf(surahUrlFragment(1, 1)) !== -1,
    'expected src to contain 001001.mp3, got: ' + (audio1 && audio1.src));

  audio1._fire('ended'); // بسملة clip finishes
  check('Case 1: after البسملة finishes, playback moves on to the real ayah (002001.mp3)',
    audio1.src.indexOf(surahUrlFragment(2, 1)) !== -1,
    'expected src to contain 002001.mp3 after بسملة ended, got: ' + audio1.src);

  // -------------------------------------------------------------
  // Case 2: a ruku starting mid-surah (not the surah's first ayah) must
  // NOT play a بسملة — straight into the ayah's own audio.
  // -------------------------------------------------------------
  var pages2 = [{ juz: 1, ayahs: [{ surah: 2, ayah: 5, surahName: 'البقرة' }] }];
  var s2 = setupScenario(pages2, 0);
  s2.els.btnListen._fire('click');
  var audio2 = s2.getAudio();
  check('Case 2: a ruku NOT starting a surah plays straight into the ayah, no بسملة',
    !!audio2 && audio2.src.indexOf(surahUrlFragment(2, 5)) !== -1 && audio2.src.indexOf(surahUrlFragment(1, 1)) === -1,
    'got: ' + (audio2 && audio2.src));

  // -------------------------------------------------------------
  // Case 3: التوبة (surah 9) is never preceded by a بسملة, even though
  // its ruku starts at ayah 1.
  // -------------------------------------------------------------
  var pages3 = [{ juz: 1, ayahs: [{ surah: 9, ayah: 1, surahName: 'التوبة' }] }];
  var s3 = setupScenario(pages3, 0);
  s3.els.btnListen._fire('click');
  var audio3 = s3.getAudio();
  check('Case 3: التوبة\'s ruku plays straight into 9:1, no بسملة prefix',
    !!audio3 && audio3.src.indexOf(surahUrlFragment(9, 1)) !== -1,
    'got: ' + (audio3 && audio3.src));

  // -------------------------------------------------------------
  // Case 4: الفاتحة's own ayah 1 IS the بسملة — must not double it.
  // -------------------------------------------------------------
  var pages4 = [{ juz: 1, ayahs: [{ surah: 1, ayah: 1, surahName: 'الفاتحة' }] }];
  var s4 = setupScenario(pages4, 0);
  s4.els.btnListen._fire('click');
  var audio4 = s4.getAudio();
  check('Case 4: الفاتحة 1:1 plays once, not doubled as its own بسملة intro',
    !!audio4 && audio4.src.indexOf(surahUrlFragment(1, 1)) !== -1,
    'got: ' + (audio4 && audio4.src));
  // Firing 'ended' here should advance/stop normally (single-ayah ruku),
  // not loop back into another بسملة playback of the same ayah.
  audio4._fire('ended');
  check('Case 4: after 1:1 ends, playback does not re-trigger a بسملة for the same ayah',
    audio4.src.indexOf(surahUrlFragment(1, 1)) !== -1 || audio4.src === '',
    'unexpected src after ended: ' + audio4.src);

  // -------------------------------------------------------------
  // Case 5: "تكرار تلاوة الآية" (repeat count) must apply to the real
  // ayah, but the بسملة intro itself must always play exactly once
  // regardless of the setting — matching how the playlist path already
  // treats its own بسملة marker items.
  // -------------------------------------------------------------
  var pages5 = [{ juz: 1, ayahs: [{ surah: 2, ayah: 1, surahName: 'البقرة' }] }];
  var s5 = setupScenario(pages5, 0);
  s5.state.recitationRepeatCount = 2;
  s5.els.btnListen._fire('click');
  var audio5 = s5.getAudio();
  check('Case 5: بسملة plays first regardless of repeat count',
    !!audio5 && audio5.src.indexOf(surahUrlFragment(1, 1)) !== -1,
    'got: ' + (audio5 && audio5.src));
  audio5._fire('ended'); // بسملة finishes -> real ayah starts (1st play)
  check('Case 5: real ayah starts after بسملة (1st play)',
    audio5.src.indexOf(surahUrlFragment(2, 1)) !== -1,
    'got: ' + audio5.src);
  var srcAfterFirstPlay = audio5.src;
  audio5.currentTime = 999; // so the repeat branch's reset is meaningfully observable below
  audio5._fire('ended'); // real ayah 1st play finishes -> should repeat (2nd play), not advance/stop
  check('Case 5: real ayah repeats a 2nd time (repeat count = 2), not a 2nd بسملة and not stopped',
    audio5.src === srcAfterFirstPlay && audio5.currentTime === 0,
    'got src=' + audio5.src + ' currentTime=' + audio5.currentTime);

  // -------------------------------------------------------------
  // Case 6: long-pressing an ayah-number badge to play JUST that one
  // ayah (mode:'single') must NEVER prepend a بسملة, even when the
  // pressed ayah happens to be a surah's first ayah — per direct user
  // request: بسملة is only for "استماع" (ruku playback, including a
  // surah boundary crossed mid-ruku), not for reviewing one specific
  // ayah on demand.
  // -------------------------------------------------------------
  var pages6 = [{ juz: 1, ayahs: [{ surah: 2, ayah: 1, surahName: 'البقرة' }] }];
  var s6 = setupScenario(pages6, 0);
  s6.longPressAyahNumber(2, 1);
  var audio6 = s6.getAudio();
  check('Case 6: long-pressing a surah\'s first ayah plays the ayah directly, no بسملة',
    !!audio6 && audio6.src.indexOf(surahUrlFragment(2, 1)) !== -1 && audio6.src.indexOf(surahUrlFragment(1, 1)) === -1,
    'got: ' + (audio6 && audio6.src));
}

run();

console.log('\n=== Basmala Regression Suite — ' + PROJECT_DIR + ' ===');
console.log('PASS: ' + results.pass + '   FAIL: ' + results.fail);
if(failures.length){
  console.log('\nFailures:');
  failures.forEach(function(f){ console.log(' - ' + f); });
  process.exitCode = 1;
} else {
  console.log('All checks passed.');
}
