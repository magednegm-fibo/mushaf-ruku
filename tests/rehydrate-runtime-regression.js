#!/usr/bin/env node
// =============================================================================
// rehydrate-runtime-regression.js
// فحوصات lifecycle لإعادة إماهة الـruntime بعد Restore / Factory Reset.
//   node tests/rehydrate-runtime-regression.js
// لا تختبر Storage بمفرده — تركّز على ترتيب applyFontChrome / font wait /
// renderPage مرة واحدة / skipQcfFit.
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- Static: CSS @font-face names must match what Settings will load ----
console.log('Section R0 — CSS @font-face names');
{
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  check("CSS defines 'Uthmanic Hafs'", /font-family:\s*'Uthmanic Hafs'/.test(css));
  check("CSS defines 'PDMS Saleem QuranFont'", /font-family:\s*'PDMS Saleem QuranFont'/.test(css));

  const settingsSrc = fs.readFileSync(path.join(root, 'settings.js'), 'utf8');
  check('settings uses Uthmanic Hafs for uthmani load', settingsSrc.indexOf("'Uthmanic Hafs'") !== -1);
  check('settings uses PDMS Saleem QuranFont for indopak load', settingsSrc.indexOf("'PDMS Saleem QuranFont'") !== -1);
  check('rehydrateFromStorage exists', settingsSrc.indexOf('function rehydrateFromStorage') !== -1);
  check('applyFontChrome exists', settingsSrc.indexOf('function applyFontChrome') !== -1);
  check('waitForCurrentQuranFont exists', settingsSrc.indexOf('function waitForCurrentQuranFont') !== -1);
  check('rehydrate does not call applyAll()', (function(){
    const m = settingsSrc.match(/function rehydrateFromStorage\([\s\S]*?\n  \}/);
    if(!m) return false;
    return m[0].indexOf('applyAll(') === -1;
  })());
  check('rehydrate does not call applyFontStyle()', (function(){
    const m = settingsSrc.match(/function rehydrateFromStorage\([\s\S]*?\n  \}/);
    if(!m) return false;
    return m[0].indexOf('applyFontStyle(') === -1;
  })());
  check('no location.reload() call in settings', !settingsSrc.split('\n').some(function(line){
    return /location\.reload\s*\(/.test(line) && !/^\s*\/\//.test(line);
  }));
  check('btnFactoryReset wired (no btnClearAllReminders in settings)', settingsSrc.indexOf('btnFactoryReset') !== -1 && settingsSrc.indexOf('btnClearAllReminders') === -1);
}

// ---- Runtime mock ----
console.log('Section R1 — rehydrate render count + skipQcfFit + font family');
{
  const store = Object.create(null);
  global.localStorage = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    clear(){ Object.keys(store).forEach(k => delete store[k]); }
  };

  const classList = {
    _set: new Set(),
    toggle(name, on){ if(on) this._set.add(name); else this._set.delete(name); },
    contains(name){ return this._set.has(name); }
  };
  const cssProps = {};
  let renderCount = 0;
  let scheduleFitCount = 0;
  let fontsLoadCalls = [];

  global.document = {
    documentElement: {
      style: { setProperty(k, v){ cssProps[k] = v; } }
    },
    body: { classList: classList },
    fonts: {
      load(spec){
        fontsLoadCalls.push(spec);
        return Promise.resolve([]);
      }
    },
    createElement(){ return { style:{}, click(){}, appendChild(){}, removeChild(){} }; },
    addEventListener(){},
    getElementById(){ return null; }
  };
  global.window = global;
  try {
    Object.defineProperty(global, 'navigator', { value: {}, configurable: true, writable: true });
  } catch(e) { /* ignore */ }
  global.UI = { showToast(){}, haptic(){}, openPanel(){}, closePanel(){}, registerOverlayPanels(){} };
  global.StorageManager = {
    loadSettings(){
      return {
        page: 3, fontStyle: 'amiri', fontSizeUthmani: 28, fontSizeIndopak: 30,
        night: false, pinchZoomEnabled: true, keepScreenAwake: false,
        reciter: 'abdulbasit', autoScrollEnabled: true, playbackRate: 1,
        recitationRepeatCount: 1, rukuRepeatCount: 1, displayScope: 'all',
        recitationScope: 'ruku', showWaqfMarksUthmani: false, showWaqfMarksIndopak: false,
        lastPageShared: 0, furthestUthmani: 0, furthestIndopak: 0,
        lastPageUthmani: 0, lastPageIndopak: 0, colorCodingEnabled: true
      };
    }
  };
  global.QCFOverride = {
    scheduleFitAllGlyphs(){ scheduleFitCount++; }
  };

  // Minimal eval of settings.js needs Dialogs etc. only at init — we call
  // exported helpers after assigning deps via Settings.init.
  const settingsCode = fs.readFileSync(path.join(root, 'settings.js'), 'utf8');
  eval(settingsCode);

  const state = { page: 0, fontStyle: 'uthmani', fontSizeUthmani: 28, fontSizeIndopak: 28, night: false };
  function stubEl(){ return { textContent: '', value: '', checked: false, classList: { toggle(){}, add(){}, remove(){} }, addEventListener(){}, style: {} }; }
  const els = {
    fontSizeLabel: stubEl(),
    btnFontAmiri: stubEl(),
    btnFontUthmani: stubEl(),
    nightToggle: stubEl(),
    pinchZoomToggle: stubEl(),
    wakeLockToggle: stubEl(),
    wakeLockRow: stubEl(),
    reciterSelect: stubEl(),
    autoScrollToggle: stubEl(),
    recitationScopeSelect: stubEl(),
    playbackSpeedSelect: stubEl(),
    recitationRepeatSelect: stubEl(),
    rukuRepeatSelect: stubEl(),
    displayScopeSelect: stubEl(),
    fontMinus: stubEl(),
    fontPlus: stubEl(),
    waqfToggle: stubEl(),
    btnFactoryReset: stubEl(),
    btnExportWaqf: stubEl(),
    importWaqfInput: stubEl(),
    btnSettings: stubEl(),
    btnCloseSettings: stubEl(),
    tileSettings: stubEl(),
    settingsPanel: stubEl(),
    ayahFlow: null
  };
  global.Dialogs = { openClearRemindersModal(){} };

  const PAGES = [{}, {}, {}, {}]; // index 3 valid
  const ReaderManager = { renderPage(){ renderCount++; } };
  const ReaderReminders = { reloadWaqfMarksForCurrentStyle(){} };
  const ReaderFavorites = { reloadFromStorage(){}, updateFavButton(){} };
  const ReaderBookmark = { reloadFromStorage(){}, updateBookmarkButton(){} };
  const Home = { updateProgressUI(){}, updateBookmarkCard(){} };
  const AudioManager = { stopListening(){} };
  const UI = global.UI;

  global.Settings.init({
    els: els, state: state, UI: UI, PAGES: PAGES,
    AudioManager: AudioManager, ReaderManager: ReaderManager,
    ReaderBookmark: ReaderBookmark, ReaderReminders: ReaderReminders,
    ReaderFavorites: ReaderFavorites, Home: Home, saveState(){}
  });

  // --- applyFontSize skipQcfFit ---
  scheduleFitCount = 0;
  global.Settings.applyFontSize({ skipQcfFit: true });
  check('applyFontSize({skipQcfFit:true}) does not schedule QCF fit', scheduleFitCount === 0);

  scheduleFitCount = 0;
  global.Settings.applyFontSize();
  check('applyFontSize() default still schedules QCF fit', scheduleFitCount === 1);

  // --- font family name helper ---
  state.fontStyle = 'uthmani';
  check('uthmani family name is Uthmanic Hafs', global.Settings.currentQuranFontFamilyName() === 'Uthmanic Hafs');
  state.fontStyle = 'amiri';
  check('indopak family name is PDMS Saleem QuranFont', global.Settings.currentQuranFontFamilyName() === 'PDMS Saleem QuranFont');

  // --- applyFontChrome does not render ---
  renderCount = 0;
  state.fontStyle = 'amiri';
  global.Settings.applyFontChrome({ skipQcfFit: true });
  check('applyFontChrome does not call renderPage', renderCount === 0);
  check('applyFontChrome sets indopak-font class', classList.contains('indopak-font') && !classList.contains('uthmani-font'));
  check('applyFontChrome sets --font-quran to PDMS', (cssProps['--font-quran'] || '').indexOf('PDMS Saleem QuranFont') !== -1);

  // --- rehydrate: single render + fonts.load with correct name ---
  renderCount = 0;
  fontsLoadCalls = [];
  scheduleFitCount = 0;
  return global.Settings.rehydrateFromStorage().then(function(){
    check('rehydrate calls renderPage exactly once', renderCount === 1, 'count=' + renderCount);
    check('rehydrate requested PDMS Saleem QuranFont', fontsLoadCalls.some(function(s){ return s.indexOf('PDMS Saleem QuranFont') !== -1; }), JSON.stringify(fontsLoadCalls));
    check('rehydrate skipQcfFit left scheduleFit at 0 before/during chrome', scheduleFitCount === 0);
    check('state.fontStyle updated from storage to amiri', state.fontStyle === 'amiri');
    check('state.page updated from storage to 3', state.page === 3);

    // Uthmani path
    global.StorageManager.loadSettings = function(){
      return {
        page: 1, fontStyle: 'uthmani', fontSizeUthmani: 28, fontSizeIndopak: 30,
        night: true, pinchZoomEnabled: true, keepScreenAwake: false,
        reciter: 'husary', autoScrollEnabled: true, playbackRate: 1,
        recitationRepeatCount: 1, rukuRepeatCount: 1, displayScope: 'all',
        recitationScope: 'ruku', showWaqfMarksUthmani: true, showWaqfMarksIndopak: false,
        lastPageShared: 1, furthestUthmani: 1, furthestIndopak: 0,
        lastPageUthmani: 1, lastPageIndopak: 0, colorCodingEnabled: true
      };
    };
    renderCount = 0;
    fontsLoadCalls = [];
    return global.Settings.rehydrateFromStorage().then(function(){
      check('second rehydrate still one render', renderCount === 1, 'count=' + renderCount);
      check('rehydrate requested Uthmanic Hafs', fontsLoadCalls.some(function(s){ return s.indexOf('Uthmanic Hafs') !== -1; }), JSON.stringify(fontsLoadCalls));
      check('body class uthmani after second rehydrate', classList.contains('uthmani-font') && !classList.contains('indopak-font'));
      finish();
    });
  }).catch(function(err){
    check('rehydrate promise rejected unexpectedly', false, String(err));
    finish();
  });
}

function finish(){
  console.log('\n==== rehydrate-runtime-regression: ' + pass + ' passed, ' + fail + ' failed ====');
  process.exit(fail ? 1 : 0);
}
