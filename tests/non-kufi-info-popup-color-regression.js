// Regression test: long-pressing a رأس آية لغير الكوفيين (non-Kufi
// ayah-head star) whose own .non-kufi-mark carries no color (the case
// where the paired Sajawandi stop-mark is drawn on the SAME word via
// .waqf-mark / has-default-* — see the long Arabic comment above
// nonKufiColor in readerManager.js) must show the info popup in the
// SAME color as that Sajawandi mark, not the plain mushaf-ink fallback.
//
// Node script, no build step:
//   node tests/non-kufi-info-popup-color-regression.js
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
// Any DOM ref wireReminderMarkMenus() touches gets a permissive stub
// element on first access — this test only exercises
// resolveNonKufiMarkInfo(), not the wiring itself.
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
const resolve = sandbox.window.ReaderReminders._resolveNonKufiMarkInfo;

let pass = 0, fail = 0;
function check(label, cond, extra){
  if(cond){ pass++; console.log('  PASS  ' + label); }
  else{ fail++; console.log('  FAIL  ' + label + (extra ? '\n        ' + extra : '')); }
}

// Fake classList: a Set with a .contains() method, matching the subset
// of DOM API resolveNonKufiMarkInfo()/resolveDefaultMarkInfo() use.
function makeEl(classes, child){
  const set = new Set(classes);
  return {
    classList: { contains: function(c){ return set.has(c); } },
    querySelector: function(sel){
      if(sel === '.non-kufi-mark') return child || null;
      return null;
    },
    // No mapped key in window.NON_KUFI_HEADS_SYM_* here, so
    // resolveNonKufiWaqfSymbol() safely returns null — only the color
    // logic is under test.
    getAttribute: function(){ return null; }
  };
}

// 1) Reported bug shape: رأس آية لغير الكوفيين with a paired وقف لازم
//    (م) Sajawandi mark drawn on the same word (has-default-waqf-lazim),
//    and .non-kufi-mark itself has no mark-* class (mushaf-ink head).
{
  const nkMark = makeEl(['non-kufi-mark']); // no mark-* class
  const wordEl = makeEl(['quran-word', 'has-non-kufi-head', 'has-default-waqf-lazim'], nkMark);
  const info = resolve(wordEl);
  check(
    'رأس + وقف لازم (م) على نفس الكلمة → popup أحمر (لون وقف لازم)',
    !!info && info.color === 'red',
    'got: ' + JSON.stringify(info)
  );
}

// 2) Same shape but with وقف مطلق (ط) — should come out blue, not plain.
{
  const nkMark = makeEl(['non-kufi-mark']);
  const wordEl = makeEl(['quran-word', 'has-non-kufi-head', 'has-default-waqf'], nkMark);
  const info = resolve(wordEl);
  check(
    'رأس + وقف مطلق (ط) على نفس الكلمة → popup أزرق',
    !!info && info.color === 'blue',
    'got: ' + JSON.stringify(info)
  );
}

// 3) «لا» heads stay green via their own .non-kufi-mark.mark-green, with
//    no Sajawandi star on the same word at all — must be unaffected.
{
  const nkMark = makeEl(['non-kufi-mark', 'mark-green']);
  const wordEl = makeEl(['quran-word', 'has-non-kufi-head', 'has-non-kufi-la'], nkMark);
  const info = resolve(wordEl);
  check(
    'رأس «لا» يبقى أخضر عبر .non-kufi-mark نفسه',
    !!info && info.color === 'green',
    'got: ' + JSON.stringify(info)
  );
}

// 4) A genuinely bare ayah-head (no waqf mark at all anywhere on this
//    word) must still fall back to plain mushaf ink, unchanged.
{
  const nkMark = makeEl(['non-kufi-mark']);
  const wordEl = makeEl(['quran-word', 'has-non-kufi-head'], nkMark);
  const info = resolve(wordEl);
  check(
    'رأس عارٍ بلا علامة وقف على الإطلاق → يبقى بحبر النص (plain)',
    !!info && info.color === 'plain',
    'got: ' + JSON.stringify(info)
  );
}

// 5) Non-ayah-head word (default Sajawandi mark elsewhere, unrelated to
//    this feature) must return null, same as before this fix.
{
  const wordEl = makeEl(['quran-word', 'has-default-jeem']);
  const info = resolve(wordEl);
  check('كلمة بلا رأس آية لغير الكوفيين → null', info === null, 'got: ' + JSON.stringify(info));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
