#!/usr/bin/env node
// =====================================================================
// Navigation Regression Suite — مصحف الركوع
// =====================================================================
// Runs entirely standalone via `node tests/navigation-regression.js`
// from the project root — no build step, no dependencies. Loads the
// ACTUAL shipped files (data.js, searchManager.js, readerManager.js)
// exactly as a browser would, then asserts against
// ReaderManager.findPageIndexForAyah() — the core lookup behind
// "الانتقال إلى آية" (go-to-ayah, opened from فهرس السور rows). The
// dialog UI itself (dialogs.js) and the DOM-scrolling/highlight half of
// ReaderManager.openAyahByNumber() are not covered here since they need
// a real DOM/rAF — this suite only certifies the page-resolution logic,
// which is the part that can silently point at the wrong ruku if
// data.js or the ruku/page split ever changes shape.
//
// PROJECT RULE: same as search-regression.js — the ZIP is the source of
// truth, so re-run with --dir against an unzipped release candidate
// before certifying a release that touches this lookup.
//
// Usage:
//   node tests/navigation-regression.js
//   node tests/navigation-regression.js --dir /path/to/unzipped-release
//
// Exit code 0 = all pass. Exit code 1 = at least one failure.
// =====================================================================

var fs = require('fs');
var path = require('path');

var dirArgIdx = process.argv.indexOf('--dir');
var PROJECT_DIR = dirArgIdx !== -1 && process.argv[dirArgIdx + 1]
  ? process.argv[dirArgIdx + 1]
  : path.join(__dirname, '..');

function loadProject(){
  var window = {};
  global.window = window;
  ['data.js', 'searchManager.js', 'readerManager.js', 'surah-meta.js'].forEach(function(f){
    var full = path.join(PROJECT_DIR, f);
    if(!fs.existsSync(full)){
      throw new Error('Missing required file: ' + full);
    }
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(full, 'utf8'));
  });
  if(!window.ReaderManager || !window.JUZ_PAGES){
    throw new Error('Project files loaded but did not expose the expected globals.');
  }
  // findPageIndexForAyah only needs PAGES — the rest of init()'s deps
  // (state, showReaderFn, ...) are for the DOM-driven half of
  // ReaderManager this suite doesn't exercise. init() itself still calls
  // setupNavControls(), which registers a document 'keydown' listener
  // (never fires here) and optionally wires els.btnPrev/btnNext (left
  // undefined, guarded with `if` in the source) — a no-op
  // document.addEventListener stub is enough to get through init()
  // without a real DOM.
  global.document = global.document || { addEventListener: function(){} };
  window.ReaderManager.init({PAGES: window.JUZ_PAGES, els: {}});
  return window;
}

var window = loadProject();
var ReaderManager = window.ReaderManager;
var JUZ_PAGES = window.JUZ_PAGES;
var SURAH_META = window.SURAH_META || {};

// ---------------------------------------------------------------------
// Tiny built-in test runner — same shape as search-regression.js.
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

function pageContainsAyah(pageIdx, surah, ayah){
  var p = JUZ_PAGES[pageIdx];
  if(!p) return false;
  return p.ayahs.some(function(a){ return a.surah === surah && a.ayah === ayah; });
}

// N1. First and last ayah of a spread of surahs (short, long, first,
// last in the mushaf) — boundary ayahs are exactly where an off-by-one
// in a page/ruku split would surface first.
var BOUNDARY_CASES = [
  { surah: 1, ayah: 1, label: 'الفاتحة first ayah' },
  { surah: 1, ayah: 7, label: 'الفاتحة last ayah (7)' },
  { surah: 2, ayah: 1, label: 'البقرة first ayah' },
  { surah: 2, ayah: 286, label: 'البقرة last ayah (286)' },
  { surah: 18, ayah: 1, label: 'الكهف first ayah' },
  { surah: 18, ayah: 110, label: 'الكهف last ayah (110)' },
  { surah: 112, ayah: 1, label: 'الإخلاص first ayah' },
  { surah: 112, ayah: 4, label: 'الإخلاص last ayah (4)' },
  { surah: 114, ayah: 1, label: 'الناس first ayah' },
  { surah: 114, ayah: 6, label: 'الناس last ayah (6, last ayah of the mushaf)' }
];
BOUNDARY_CASES.forEach(function(c){
  check('N1 ' + c.label + ': resolves to a page that actually contains it', function(){
    var idx = ReaderManager.findPageIndexForAyah(c.surah, c.ayah);
    if(idx === -1) return 'findPageIndexForAyah returned -1 (not found)';
    return pageContainsAyah(idx, c.surah, c.ayah) ||
      ('page ' + idx + ' does not contain ' + c.surah + ':' + c.ayah);
  });
});

// N2. A few interior (non-boundary) ayahs, as a sanity check that the
// lookup isn't only correct at the edges of a page/ruku.
var INTERIOR_CASES = [
  { surah: 2, ayah: 150, label: 'البقرة:150 (interior)' },
  { surah: 16, ayah: 75, label: 'النحل:75 (interior — same ayah used in the alif/hamza split fix)' },
  { surah: 36, ayah: 40, label: 'يس:40 (interior)' }
];
INTERIOR_CASES.forEach(function(c){
  check('N2 ' + c.label + ': resolves to a page that actually contains it', function(){
    var idx = ReaderManager.findPageIndexForAyah(c.surah, c.ayah);
    if(idx === -1) return 'findPageIndexForAyah returned -1 (not found)';
    return pageContainsAyah(idx, c.surah, c.ayah) ||
      ('page ' + idx + ' does not contain ' + c.surah + ':' + c.ayah);
  });
});

// N3. Out-of-range ayah numbers (one past the real last ayah, and ayah 0)
// must resolve to -1, not silently match some other ayah. The dialog's
// own min/max validation (dialogs.js) is what's actually supposed to stop
// these from ever reaching this function in the app, but this function
// itself should still fail closed if it's ever called directly with a
// bad value, rather than falling through to an unrelated result.
var OUT_OF_RANGE_CASES = [
  { surah: 1, ayah: 8, label: 'الفاتحة:8 (one past the real last ayah, 7)' },
  { surah: 1, ayah: 0, label: 'الفاتحة:0 (below the valid range)' },
  { surah: 2, ayah: 287, label: 'البقرة:287 (one past the real last ayah, 286)' },
  { surah: 114, ayah: 7, label: 'الناس:7 (one past the real last ayah, 6)' }
];
OUT_OF_RANGE_CASES.forEach(function(c){
  check('N3 ' + c.label + ': returns -1 (not found)', function(){
    var idx = ReaderManager.findPageIndexForAyah(c.surah, c.ayah);
    return idx === -1 || ('expected -1, got page index ' + idx);
  });
});

// N4. A nonexistent surah number must also resolve to -1 rather than
// throwing or matching by coincidence.
check('N4 surah 115 (does not exist): returns -1', function(){
  var idx = ReaderManager.findPageIndexForAyah(115, 1);
  return idx === -1 || ('expected -1, got page index ' + idx);
});
check('N4 surah 0 (does not exist): returns -1', function(){
  var idx = ReaderManager.findPageIndexForAyah(0, 1);
  return idx === -1 || ('expected -1, got page index ' + idx);
});

// N5. Cross-check against SURAH_META's own ayah counts (loaded
// separately, same as the dialog does) for every surah's last ayah —
// broader coverage than the hand-picked BOUNDARY_CASES above, catching
// any single surah whose last-ayah lookup might be wrong without
// hand-listing all 114.
(function(){
  var keys = Object.keys(SURAH_META);
  check('N5 SURAH_META loaded', function(){ return keys.length > 0 || 'SURAH_META is empty'; });
  keys.forEach(function(surahKey){
    var surah = parseInt(surahKey, 10);
    var lastAyah = parseInt(SURAH_META[surahKey].ayahs, 10);
    if(!lastAyah) return;
    check('N5 surah ' + surah + ' last ayah (' + lastAyah + ') resolves correctly', function(){
      var idx = ReaderManager.findPageIndexForAyah(surah, lastAyah);
      if(idx === -1) return 'findPageIndexForAyah returned -1 (not found)';
      return pageContainsAyah(idx, surah, lastAyah) ||
        ('page ' + idx + ' does not contain ' + surah + ':' + lastAyah);
    });
    check('N5 surah ' + surah + ' ayah ' + (lastAyah + 1) + ' (one past last) returns -1', function(){
      var idx = ReaderManager.findPageIndexForAyah(surah, lastAyah + 1);
      return idx === -1 || ('expected -1, got page index ' + idx);
    });
  });
})();

// =====================================================================
// Report
// =====================================================================
console.log('');
console.log('=== Navigation Regression Suite — ' + PROJECT_DIR + ' ===');
console.log('PASS: ' + results.pass + '   FAIL: ' + results.fail);
if(failures.length){
  console.log('');
  console.log('Failures:');
  failures.forEach(function(f){ console.log('  ✗ ' + f); });
  console.log('');
  process.exitCode = 1;
} else {
  console.log('All checks passed.');
  console.log('');
}
