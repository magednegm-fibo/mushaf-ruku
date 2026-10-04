'use strict';
/**
 * Regression: startup watchdog for Web Speech TTS (reader-tafsir.js).
 * Policy (v1.0.473+):
 *   - Do NOT hard-gate on getVoices()/Arabic voice listing.
 *   - Prefer listed Arabic voice when present; else lang=ar-SA.
 *   - If onstart never fires within watchdog → abort + short message.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var code = fs.readFileSync(path.join(root, 'reader-tafsir.js'), 'utf8');

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.error('FAIL:', name); }
}

// --- Structural ---
check('ensureArabicVoiceReady REMOVED', !/function ensureArabicVoiceReady\(/.test(code));
check('abortTtsSession present', /function abortTtsSession\(/.test(code));
check('TTS_STARTUP_WATCHDOG_MS present', /TTS_STARTUP_WATCHDOG_MS\s*=\s*\d+/.test(code));
check('short silent-fail message', /لا يتوفر صوت بالعربي/.test(code));
check('long no-arabic message REMOVED', !/لا يتوفر صوت عربي للنطق على هذا الجهاز/.test(code));
check('onstart handler present', /u\.onstart\s*=\s*function/.test(code));
check('failSilentStart present', /function failSilentStart\(/.test(code));
check('startTtsForRuku does not call ensureArabicVoiceReady',
  !/function startTtsForRuku\([\s\S]*?ensureArabicVoiceReady/.test(code));
check('speakSingleAyah does not call ensureArabicVoiceReady',
  !/function speakSingleAyah\([\s\S]*?ensureArabicVoiceReady/.test(code));
check('playQueue does not hard-reject missing preferredVoice',
  !/function playQueue\([\s\S]*?if\s*\(\s*!preferredVoice\s*\)\s*\{[\s\S]*?TTS_NO_ARABIC/.test(code));
check('lang=ar-SA fallback present', /u\.lang\s*=\s*'ar-SA'/.test(code));

function makeSandbox(opts) {
  opts = opts || {};
  var voices = opts.voices || [];
  var speakBehavior = opts.speakBehavior || 'silent';
  var toasts = [];
  var cancelled = 0;
  var speakCalls = 0;
  var lastUtterance = null;
  var timers = [];
  var now = 0;

  function FakeUtterance(text) {
    this.text = text;
    this.lang = '';
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }

  var speechSynthesis = {
    getVoices: function () { return voices.slice(); },
    speak: function (u) {
      speakCalls++;
      lastUtterance = u;
      if (speakBehavior === 'throw') throw new Error('speak failed');
      if (speakBehavior === 'normal') {
        timers.push({ at: now + 10, fn: function () { if (u.onstart) u.onstart(); } });
        timers.push({ at: now + 50, fn: function () { if (u.onend) u.onend(); } });
      }
    },
    cancel: function () { cancelled++; },
    addEventListener: function () {}
  };

  function fakeSetTimeout(fn, ms) {
    var id = timers.length;
    timers.push({ at: now + (ms || 0), fn: fn, id: id });
    return id;
  }
  function fakeClearTimeout(id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i] && timers[i].id === id) timers[i] = null;
    }
  }
  function advance(ms) {
    now += ms;
    var due = timers.filter(function (t) { return t && t.at <= now; });
    due.sort(function (a, b) { return a.at - b.at; });
    due.forEach(function (t) {
      var idx = timers.indexOf(t);
      if (idx >= 0) timers[idx] = null;
      try { t.fn(); } catch (e) { console.error(e); }
    });
  }
  function flushMicrotasks() {
    return Promise.resolve().then(function () { return Promise.resolve(); });
  }

  var ctx = { console: console, speechSynthesis: speechSynthesis, window: {} };
  function extract(re, label) {
    var m = code.match(re);
    if (!m) throw new Error('extract failed: ' + label);
    return m[0];
  }
  var isArabicVoice = extract(/function isArabicVoice\(v\)\{[\s\S]*?\n  \}/, 'isArabicVoice');
  var scoreArabicVoice = extract(/function scoreArabicVoice\(v\)\{[\s\S]*?\n  \}/, 'scoreArabicVoice');
  var maleRe = extract(/var MALE_AR_NAME_RE = [^;]+;/, 'MALE');
  var femaleRe = extract(/var FEMALE_AR_NAME_RE = [^;]+;/, 'FEMALE');
  var pickArabicVoice = extract(/function pickArabicVoice\(\)\{[\s\S]*?\n  \}/, 'pickArabicVoice');
  vm.createContext(ctx);
  vm.runInContext(
    maleRe + '\n' + femaleRe + '\n' + isArabicVoice + '\n' + scoreArabicVoice + '\n' +
    pickArabicVoice + '\nthis.pickArabicVoice = pickArabicVoice;',
    ctx
  );

  var ttsSpeaking = false;
  var ttsQueue = [];
  var ttsCurrentKey = null;
  var ttsGeneration = 0;
  var preferredVoice = null;
  var TTS_SILENT_FAIL_MSG = 'لا يتوفر صوت بالعربي';
  var TTS_STARTUP_WATCHDOG_MS = 3500;

  function clearTtsHighlight() { ttsCurrentKey = null; }
  function setTtsHighlight(s, a) { ttsCurrentKey = String(s) + ':' + String(a); }

  function abortTtsSession(message) {
    ttsGeneration++;
    ttsQueue = [];
    ttsSpeaking = false;
    clearTtsHighlight();
    try { speechSynthesis.cancel(); } catch (e) {}
    if (message) toasts.push(message);
  }

  function doSpeak(text, meta, gen) {
    return new Promise(function (resolve) {
      if (gen !== ttsGeneration) { resolve(); return; }
      var u = new FakeUtterance(text);
      if (preferredVoice) {
        u.voice = preferredVoice;
        u.lang = preferredVoice.lang || 'ar-SA';
      } else {
        u.lang = 'ar-SA';
      }
      var settled = false;
      var started = false;
      var watchdogTimer = null;

      function settle() {
        if (settled) return;
        settled = true;
        if (watchdogTimer != null) { fakeClearTimeout(watchdogTimer); watchdogTimer = null; }
        resolve();
      }
      function failSilentStart() {
        if (settled) return;
        settled = true;
        if (watchdogTimer != null) { fakeClearTimeout(watchdogTimer); watchdogTimer = null; }
        if (gen === ttsGeneration) abortTtsSession(TTS_SILENT_FAIL_MSG);
        resolve();
      }

      u.onstart = function () {
        if (settled || gen !== ttsGeneration) return;
        started = true;
        if (watchdogTimer != null) { fakeClearTimeout(watchdogTimer); watchdogTimer = null; }
      };
      u.onend = function () {
        if (gen !== ttsGeneration) { settle(); return; }
        settle();
      };
      u.onerror = function () {
        if (gen !== ttsGeneration) { settle(); return; }
        settle();
      };

      if (meta && meta.surah != null) setTtsHighlight(meta.surah, meta.ayah);
      watchdogTimer = fakeSetTimeout(function () {
        if (settled || started) return;
        if (gen !== ttsGeneration) { settle(); return; }
        failSilentStart();
      }, TTS_STARTUP_WATCHDOG_MS);

      try { speechSynthesis.speak(u); } catch (e) { failSilentStart(); }
    });
  }

  function playQueue() {
    var gen = ttsGeneration;
    if (!ttsQueue.length) {
      if (gen !== ttsGeneration) return;
      ttsSpeaking = false;
      clearTtsHighlight();
      return;
    }
    if (!preferredVoice) preferredVoice = ctx.pickArabicVoice();
    ttsSpeaking = true;
    var item = ttsQueue.shift();
    doSpeak(item.text, item, gen).then(function () {
      if (gen !== ttsGeneration || !ttsSpeaking) return;
      playQueue();
    });
  }

  function startPlayback(items) {
    ttsQueue = items.slice();
    playQueue();
    return true;
  }

  return {
    startPlayback: startPlayback,
    advance: advance,
    flushMicrotasks: flushMicrotasks,
    get state() {
      return {
        ttsSpeaking: ttsSpeaking,
        ttsQueueLen: ttsQueue.length,
        ttsCurrentKey: ttsCurrentKey,
        ttsGeneration: ttsGeneration,
        preferredVoice: preferredVoice,
        toasts: toasts.slice(),
        cancelled: cancelled,
        speakCalls: speakCalls,
        lastUtterance: lastUtterance
      };
    },
    fireLateOnEnd: function () {
      if (lastUtterance && lastUtterance.onend) lastUtterance.onend();
    },
    pickArabicVoice: function () { return ctx.pickArabicVoice(); }
  };
}

function runCaseA() {
  // Arabic voice listed + normal engine
  var arVoice = { lang: 'ar-SA', name: 'Arabic Male Maged', localService: true };
  var sb = makeSandbox({ voices: [arVoice], speakBehavior: 'normal' });
  sb.startPlayback([{ text: 'بسم الله', surah: 1, ayah: 1 }]);
  check('A: speaking after start', sb.state.ttsSpeaking === true);
  check('A: highlight set', sb.state.ttsCurrentKey === '1:1');
  check('A: voice attached', !!(sb.state.lastUtterance && sb.state.lastUtterance.voice));
  sb.advance(20);
  check('A: still speaking after onstart', sb.state.ttsSpeaking === true);
  sb.advance(50);
  return sb.flushMicrotasks().then(function () {
    check('A: not speaking after onend', sb.state.ttsSpeaking === false);
    check('A: no silent-fail toast', sb.state.toasts.length === 0);
    check('A: queue drained', sb.state.ttsQueueLen === 0);
  });
}

function runSyncCases() {
  // B: no listed Arabic voice, but engine works with lang=ar-SA (S25 Ultra case)
  (function () {
    var sb = makeSandbox({
      voices: [{ lang: 'en-US', name: 'English' }],
      speakBehavior: 'normal'
    });
    sb.startPlayback([{ text: 'نص', surah: 2, ayah: 1 }]);
    check('B: still starts without listed Arabic voice', sb.state.ttsSpeaking === true);
    check('B: speak() called', sb.state.speakCalls === 1);
    check('B: lang is ar-SA', sb.state.lastUtterance && sb.state.lastUtterance.lang === 'ar-SA');
    check('B: no voice object attached', sb.state.lastUtterance && sb.state.lastUtterance.voice == null);
    sb.advance(20);
    sb.advance(50);
  })();

  // C: silent engine (C9 Pro case) → watchdog
  (function () {
    var sb = makeSandbox({
      voices: [{ lang: 'en-US', name: 'English' }],
      speakBehavior: 'silent'
    });
    var genBefore = sb.state.ttsGeneration;
    sb.startPlayback([
      { text: 'آية أولى', surah: 1, ayah: 1 },
      { text: 'آية ثانية', surah: 1, ayah: 2 }
    ]);
    check('C: speaking before watchdog', sb.state.ttsSpeaking === true);
    check('C: speak called', sb.state.speakCalls === 1);
    sb.advance(3600);
    check('C: not speaking after watchdog', sb.state.ttsSpeaking === false);
    check('C: highlight cleared', sb.state.ttsCurrentKey === null);
    check('C: queue cleared (no advance)', sb.state.ttsQueueLen === 0);
    check('C: cancel invoked', sb.state.cancelled >= 1);
    check('C: short silent-fail toast', sb.state.toasts.some(function (t) {
      return t === 'لا يتوفر صوت بالعربي';
    }));
    check('C: generation bumped', sb.state.ttsGeneration > genBefore);
  })();

  // D: late onend after timeout
  (function () {
    var sb = makeSandbox({ voices: [], speakBehavior: 'silent' });
    sb.startPlayback([
      { text: 'أ', surah: 3, ayah: 1 },
      { text: 'ب', surah: 3, ayah: 2 }
    ]);
    var genAtStart = sb.state.ttsGeneration;
    sb.advance(3600);
    check('D: aborted generation > start', sb.state.ttsGeneration > genAtStart);
    sb.fireLateOnEnd();
    check('D: still not speaking after late onend', sb.state.ttsSpeaking === false);
    check('D: queue still empty', sb.state.ttsQueueLen === 0);
    check('D: no second speak from late callback', sb.state.speakCalls === 1);
  })();

  // E: voice scoring still prefers ar-SA when listed
  (function () {
    var sb = makeSandbox({
      voices: [
        { lang: 'en-US', name: 'English' },
        { lang: 'ar-EG', name: 'Arabic Egypt' },
        { lang: 'ar-SA', name: 'Maged Arabic Male', localService: true }
      ]
    });
    var v = sb.pickArabicVoice();
    check('E: picks Arabic voice', !!v && /^ar/i.test(v.lang));
    check('E: prefers ar-SA', v && /^ar-SA/i.test(v.lang));
  })();
}

runCaseA()
  .then(function () {
    return Promise.resolve().then(function () { return Promise.resolve(); });
  })
  .then(function () {
    runSyncCases();
    console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
    process.exit(fail ? 1 : 0);
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
