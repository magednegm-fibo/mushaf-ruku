#!/usr/bin/env node
// =============================================================================
// radio-default-station-regression.js
// بعد Factory Reset يجب أن تعود محطة الإذاعة إلى «القرآن الكريم من القاهرة».
// تشغيل: node tests/radio-default-station-regression.js
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const store = Object.create(null);
const localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
  clear() { Object.keys(store).forEach(k => delete store[k]); }
};

function fakeEl(extra) {
  const el = {
    _listeners: {},
    value: '',
    textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    addEventListener(type, fn) {
      (this._listeners[type] || (this._listeners[type] = [])).push(fn);
    },
    dispatchEvent() {}
  };
  return Object.assign(el, extra || {});
}

const ctx = {
  console,
  localStorage,
  MUSHAF_KEYS: { RADIO_KEY: 'quranRuku_radio_v1' },
  Audio: function () {
    return {
      preload: 'none',
      src: '',
      pause() {},
      load() {},
      play() { return Promise.resolve(); },
      addEventListener() {},
      removeAttribute() {}
    };
  },
  window: null,
  document: { createElement() { return {}; } },
  navigator: {},
  MediaMetadata: function () {}
};
ctx.window = ctx;
ctx.self = ctx;

vm.runInNewContext(fs.readFileSync(path.join(root, 'radio-player.js'), 'utf8'), ctx);

const select = Object.assign(fakeEl(), { value: 'mustafa_ismail' });
const els = {
  radioPlayPauseBtn: fakeEl(),
  radioStationSelect: select,
  radioStatusText: fakeEl(),
  radioStatusDot: fakeEl(),
  radioIconPlay: fakeEl(),
  radioIconPause: fakeEl(),
  radioPlayPauseLabel: fakeEl()
};

console.log('radio-default-station-regression\n');

check('RadioPlayer exported', !!(ctx.RadioPlayer && ctx.RadioPlayer.init));
check('default station id is quran_cairo', ctx.RadioPlayer.getDefaultStationId() === 'quran_cairo');

ctx.RadioPlayer.init({ els: els });
// مستخدم غيّر المحطة
select.value = 'mustafa_ismail';
select._listeners.change.forEach(fn => fn());
check('station saved after change', localStorage.getItem('quranRuku_radio_v1').indexOf('mustafa_ismail') !== -1);
check('getStationId reflects change', ctx.RadioPlayer.getStationId() === 'mustafa_ismail');

// محاكاة Factory Reset: مسح مفتاح الإذاعة ثم reloadFromStorage
localStorage.removeItem('quranRuku_radio_v1');
ctx.RadioPlayer.reloadFromStorage();
check('after reset storage empty → quran_cairo', ctx.RadioPlayer.getStationId() === 'quran_cairo');
check('select UI shows quran_cairo', select.value === 'quran_cairo');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
