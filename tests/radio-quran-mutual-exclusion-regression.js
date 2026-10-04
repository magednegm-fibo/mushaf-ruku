'use strict';
/**
 * Regression: Mutual Exclusion between RadioPlayer (radio-player.js) and
 * AudioManager (Quran recitation).
 * Policy (v1.0.510+):
 *   - Starting the radio stops any playing Quran recitation.
 *   - Starting Quran recitation (single ayah / bismillah+ayah / playlist
 *     modes) stops the radio if it is playing.
 *   - No recursion: RadioPlayer.stop() never calls back into AudioManager,
 *     and AudioManager.stopListening() never calls back into RadioPlayer.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var radioCode = fs.readFileSync(path.join(root, 'radio-player.js'), 'utf8');
var audioCode = fs.readFileSync(path.join(root, 'audioManager.js'), 'utf8');

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.error('FAIL:', name); }
}

// ---------------------------------------------------------------------
// Part A — structural checks on audioManager.js (too heavy to fully
// sandbox: depends on PAGES/state/els/SearchManager/etc.), mirroring the
// same style already used for the existing ReaderTafsir.stopTts guard.
// ---------------------------------------------------------------------
function fnBody(code, name) {
  var m = code.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}'));
  return m ? m[0] : null;
}

var playAyahAt = fnBody(audioCode, 'playAyahAt');
var playSurahPlaylistAt = fnBody(audioCode, 'playSurahPlaylistAt');
var stopListening = fnBody(audioCode, 'stopListening');

check('playAyahAt extracted', !!playAyahAt);
check('playSurahPlaylistAt extracted', !!playSurahPlaylistAt);
check('stopListening extracted', !!stopListening);

var radioStopGuard = /if\(window\.RadioPlayer\s*&&\s*typeof RadioPlayer\.stop\s*===\s*'function'\)\{\s*RadioPlayer\.stop\(\);\s*\}/;

check('playAyahAt calls RadioPlayer.stop() (guarded)', radioStopGuard.test(playAyahAt || ''));
check('playSurahPlaylistAt calls RadioPlayer.stop() (guarded)', radioStopGuard.test(playSurahPlaylistAt || ''));

// Ordering: the RadioPlayer.stop() guard must run before the actual
// player.play() call in each function (same position as the existing
// ReaderTafsir.stopTts mutual-exclusion guard).
function indexOfPlayCall(body) {
  var i = body.indexOf('.play()');
  return i;
}
check('playAyahAt: RadioPlayer.stop() precedes player.play()',
  playAyahAt.search(radioStopGuard) > -1 && playAyahAt.search(radioStopGuard) < indexOfPlayCall(playAyahAt));
check('playSurahPlaylistAt: RadioPlayer.stop() precedes player.play()',
  playSurahPlaylistAt.search(radioStopGuard) > -1 && playSurahPlaylistAt.search(radioStopGuard) < indexOfPlayCall(playSurahPlaylistAt));

// No recursion: stopListening() itself must never reference RadioPlayer.
check('stopListening() does NOT reference RadioPlayer (no recursion)',
  !/RadioPlayer/.test(stopListening || ''));

// playBismillahThenAyah must NOT need its own guard — it's only reachable
// via playAyahAt, after playAyahAt's guard already ran.
var bismillahCallSites = (audioCode.match(/playBismillahThenAyah\(/g) || []).length;
check('playBismillahThenAyah has exactly one call site (inside playAyahAt, already covered)',
  bismillahCallSites === 2 /* 1 definition + 1 call site */);

check('AudioManager still exposes stopListening publicly',
  /window\.AudioManager\s*=\s*\{[\s\S]*?stopListening:\s*stopListening/.test(audioCode));

// ---------------------------------------------------------------------
// Part B — functional sandbox test of radio-player.js in isolation,
// mocking Audio + DOM + a fake window.AudioManager to observe calls.
// ---------------------------------------------------------------------
function FakeAudio() {
  this._src = '';
  this.preload = '';
  this.paused = true;
  this._listeners = {};
}
FakeAudio.prototype.addEventListener = function (type, fn) {
  this._listeners[type] = this._listeners[type] || [];
  this._listeners[type].push(fn);
};
FakeAudio.prototype._emit = function (type) {
  (this._listeners[type] || []).forEach(function (fn) { fn(); });
};
Object.defineProperty(FakeAudio.prototype, 'src', {
  get: function () { return this._src; },
  set: function (v) { this._src = v; }
});
FakeAudio.prototype.removeAttribute = function (attr) { if (attr === 'src') this._src = ''; };
FakeAudio.prototype.load = function () {};
FakeAudio.prototype.pause = function () {
  this.paused = true;
  this._emit('pause');
};
FakeAudio.prototype.play = function () {
  var self = this;
  self.paused = false;
  // Synchronous "playing" event, mirroring how the real element fires it
  // once playback actually starts — good enough for this test's needs.
  setTimeout(function () { self._emit('playing'); }, 0);
  return { catch: function () { return this; } };
};

function fakeEl() {
  return {
    classList: { toggle: function () {}, add: function () {}, contains: function () { return false; } },
    setAttribute: function () {},
    addEventListener: function (type, fn) { this['_' + type] = fn; },
    textContent: ''
  };
}

function makeSandbox() {
  var els = {
    radioPlayPauseBtn: fakeEl(),
    radioStationSelect: Object.assign(fakeEl(), { value: 'mustafa_ismail' }),
    radioStatusText: fakeEl(),
    radioStatusDot: fakeEl(),
    radioIconPlay: fakeEl(),
    radioIconPause: fakeEl(),
    radioPlayPauseLabel: fakeEl()
  };
  var stopListeningCalls = 0;
  var fakeAudioManager = {
    stopListening: function () { stopListeningCalls++; }
  };
  var ctx = {
    console: console,
    Audio: FakeAudio,
    setTimeout: setTimeout,
    // Exposed both as a bare global and as window.AudioManager: in a real
    // browser these are the same reference (globals ARE window
    // properties), which is exactly what radio-player.js relies on when
    // it reads `window.AudioManager` then calls bare `AudioManager.*`.
    AudioManager: fakeAudioManager,
    window: { AudioManager: fakeAudioManager }
  };
  ctx.window.window = ctx.window; // self-reference so `window.X` works inside the IIFE
  vm.createContext(ctx);
  vm.runInContext(radioCode, ctx);
  ctx.window.RadioPlayer.init({ els: els });
  return {
    RadioPlayer: ctx.window.RadioPlayer,
    els: els,
    getStopListeningCalls: function () { return stopListeningCalls; }
  };
}

function flush() {
  return new Promise(function (resolve) { setTimeout(resolve, 0); });
}

async function runFunctionalScenarios() {
  // Scenario: Radio فقط (radio-only playback, no Quran involved)
  var s1 = makeSandbox();
  s1.els.radioPlayPauseBtn._click();
  await flush();
  check('Radio-only: AudioManager.stopListening() called once on radio start',
    s1.getStopListeningCalls() === 1);
  check('Radio-only: radio label shows إيقاف (i.e. playing)',
    s1.els.radioPlayPauseLabel.textContent === 'إيقاف');

  // Scenario: Quran → Radio (radio starts while "Quran" is conceptually
  // playing) — verified by confirming the start path always calls
  // AudioManager.stopListening() unconditionally before playing.
  var s2 = makeSandbox();
  s2.els.radioPlayPauseBtn._click();
  await flush();
  check('Quran→Radio: starting radio invokes AudioManager.stopListening()',
    s2.getStopListeningCalls() === 1);

  // Scenario: Radio → Quran, simulated via RadioPlayer.stop() (the exact
  // method AudioManager calls) while radio is playing.
  var s3 = makeSandbox();
  s3.els.radioPlayPauseBtn._click();
  await flush();
  check('Radio→Quran setup: radio is actually playing before stop()',
    s3.els.radioPlayPauseLabel.textContent === 'إيقاف');
  s3.RadioPlayer.stop();
  check('Radio→Quran: RadioPlayer.stop() stops the radio (label back to تشغيل)',
    s3.els.radioPlayPauseLabel.textContent === 'تشغيل');
  check('Radio→Quran: RadioPlayer.stop() did not call AudioManager back (no recursion)',
    s3.getStopListeningCalls() === 1 /* only the original start call, nothing extra */);

  // Scenario: Quran فقط (Quran-only) — RadioPlayer.stop() must be a safe
  // no-op when the radio was never playing (idempotent / no crash).
  var s4 = makeSandbox();
  s4.RadioPlayer.stop();
  check('Quran-only: RadioPlayer.stop() on idle radio is a harmless no-op',
    s4.els.radioPlayPauseLabel.textContent === 'تشغيل');

  // Idempotency: calling stop() twice in a row is also safe.
  var s5 = makeSandbox();
  s5.els.radioPlayPauseBtn._click();
  await flush();
  s5.RadioPlayer.stop();
  s5.RadioPlayer.stop();
  check('stop() called twice in a row does not throw / stays stopped',
    s5.els.radioPlayPauseLabel.textContent === 'تشغيل');
}

runFunctionalScenarios().then(function () {
  console.log('\n==== radio-quran-mutual-exclusion-regression: ' + pass + ' passed, ' + fail + ' failed ====');
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.error('FATAL:', e);
  process.exit(1);
});
