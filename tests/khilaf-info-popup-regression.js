// Regression test: long-pressing a purple khilaf-word (موضع خلاف بين
// طريق الشاطبية وطريق روضة الحفاظ — راجع docs/khilaf-munfasil-words.md)
// must show a dedicated purple info popup ("خلاف مع روضة الحفاظ"),
// instead of falling through to the plain default-Sajawandi popup or the
// personal reminder add/delete menu. For the two words that also carry a
// native default Sajawandi mark on the same word (36:52 مرقدنا → وقف
// لازم, 2:245 ويبصط → وقف مرخص), the label must additionally show that
// mark's symbol in brackets, colored with that mark's OWN color (red for
// م, green for ص — direct user request 2026-08-01, reversing an earlier
// decision that kept the whole popup purple with no exception) — while
// the surrounding "خلاف مع روضة الحفاظ" text stays purple. The colored
// symbol is a nested <span> inside the label HTML (see
// resolveKhilafMarkInfo / .khilaf-inline-symbol-* in style.css), not a
// full-popup color change.
//
// Node script, no build step:
//   node tests/khilaf-info-popup-regression.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(rootDir, 'reader-reminders.js'), 'utf8');

const sandbox = {
  console: console,
  document: { addEventListener: function(){} },
  StorageManager: { loadReminder: function(){ return {}; }, saveReminder: function(){} },
  Gestures: { longPress: function(){} }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'reader-reminders.js' });
function stubEl(){
  const el = {
    classList: { add: function(){}, remove: function(){}, contains: function(){ return false; } },
    addEventListener: function(){},
    querySelectorAll: function(){ return []; },
    querySelector: function(){ return null; }
  };
  return el;
}
const elsProxy = new Proxy({}, { get: function(){ return stubEl(); } });

sandbox.window.ReaderReminders.init({
  els: elsProxy,
  state: {}, UI: { showToast: function(){} }, AudioManager: {},
  currentWaqfVisibilityKey: function(){ return 'x'; }
});
const resolve = sandbox.window.ReaderReminders._resolveKhilafMarkInfo;

let pass = 0, fail = 0;
function check(label, cond, extra){
  if(cond){ pass++; console.log('  PASS  ' + label); }
  else{ fail++; console.log('  FAIL  ' + label + (extra ? '\n        ' + extra : '')); }
}

function makeEl(classes){
  const set = new Set(classes);
  return {
    classList: { contains: function(c){ return set.has(c); } },
    querySelector: function(){ return null; },
    getAttribute: function(){ return null; }
  };
}

// 1) Plain khilaf word, no default Sajawandi mark on the same word
//    (the common case — 27 of the 29 positions, e.g. 19:1 كٓهيعٓصٓ).
{
  const wordEl = makeEl(['quran-word', 'khilaf-word']);
  const info = resolve(wordEl);
  check(
    'كلمة بنفسجية عادية → التسمية الأساسية بلا أي رمز إضافي، ولون خلاف (بنفسجي)',
    !!info && info.label === 'خلاف مع روضة الحفاظ' && info.color === 'khilaf' && info.symbol === '',
    'got: ' + JSON.stringify(info)
  );
}

// 2) 36:52 مرقدنا shape: khilaf-word + has-default-waqf-lazim (م) on the
//    same word — label must append the م symbol, color stays purple
//    (NOT red, unlike the non-Kufi popup's color-inheritance rule).
{
  const wordEl = makeEl(['quran-word', 'sakta-word', 'khilaf-word', 'has-default-waqf-lazim']);
  const info = resolve(wordEl);
  check(
    'مرقدنا (خلاف + وقف لازم) → [ م ] بالكامل (القوسان + الرمز) بلون أحمر داخل span مضمَّن، والنص المحيط يبقى بنفسجي',
    !!info && info.label === 'خلاف مع روضة الحفاظ\u00A0<span class="khilaf-inline-symbol khilaf-inline-symbol-red">[ \u0645 ]</span>' && info.color === 'khilaf',
    'got: ' + JSON.stringify(info)
  );
}

// 3) 2:245 ويبصط shape: khilaf-word + has-default-sad-rukhsa (ص) on the
//    same word — label must append the ص symbol, color stays purple
//    (NOT green).
{
  const wordEl = makeEl(['quran-word', 'seen-as-sad-word', 'khilaf-word', 'has-default-sad-rukhsa']);
  const info = resolve(wordEl);
  check(
    'ويبصط (خلاف + وقف مرخص) → [ ص ] بالكامل (القوسان + الرمز) بلون أخضر داخل span مضمَّن، والنص المحيط يبقى بنفسجي',
    !!info && info.label === 'خلاف مع روضة الحفاظ\u00A0<span class="khilaf-inline-symbol khilaf-inline-symbol-green">[ \u0635 ]</span>' && info.color === 'khilaf',
    'got: ' + JSON.stringify(info)
  );
}

// 4) Non-khilaf word (ordinary default-Sajawandi word, unrelated to this
//    feature) must return null, unchanged — falls through to
//    resolveDefaultMarkInfo() as before this feature existed.
{
  const wordEl = makeEl(['quran-word', 'has-default-jeem']);
  const info = resolve(wordEl);
  check('كلمة عادية بلا خلاف → null (تسقط لفحص العلامة الافتراضية كالمعتاد)', info === null, 'got: ' + JSON.stringify(info));
}

// 5) A completely plain word (neither khilaf nor any default mark) →
//    null, unchanged.
{
  const wordEl = makeEl(['quran-word']);
  const info = resolve(wordEl);
  check('كلمة عادية تمامًا → null', info === null, 'got: ' + JSON.stringify(info));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
