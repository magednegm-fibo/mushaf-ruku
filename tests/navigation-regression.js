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
  // navigation.js and juz-info.js added for N6 (computeIndexRows) below —
  // navigation.js's module body only touches `window` at load time (the
  // IIFE doesn't reach for a real DOM until init() runs, which this suite
  // never calls), so it's safe to eval alongside the others.
  ['data.js', 'searchManager.js', 'readerManager.js', 'surah-meta.js', 'juz-info.js', 'rub-info.js', 'constants.js', 'ui.js', 'navigation.js'].forEach(function(f){
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
if(window.SearchManager) window.SearchManager.init(JUZ_PAGES);

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
// N6. الفهرس (full-mushaf/الكل scope): a juz that contains several rukus
// of the same surah back-to-back (e.g. البقرة spans rukus across juz 1-3)
// must collapse those into ONE row per surah-per-juz, not repeat the
// surah name for every ruku. Bug: before this fix, every one of
// البقرة's ~16 rukus in juz 1 got its own identical "البقرة" row.
// =====================================================================
var Navigation = window.Navigation;
var JUZ_INFO = window.JUZ_INFO;
(function(){
  check('N6 Navigation.computeIndexRows is exposed', function(){
    return typeof Navigation !== 'undefined' && typeof Navigation.computeIndexRows === 'function'
      || 'Navigation.computeIndexRows missing — was it wired into window.Navigation?';
  });
  if(!Navigation || typeof Navigation.computeIndexRows !== 'function') return;

  var state = {displayScope: 'all', page: 0};
  var rows = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, state);
  var items = rows.filter(function(r){ return r.type === 'item'; });
  var headers = rows.filter(function(r){ return r.type === 'header'; });

  check('N6 at least one header and one item row produced', function(){
    return (headers.length > 0 && items.length > 0) || 'rows came back empty';
  });

  // البقرة (surah 2) crosses juz 1, 2, and 3 — exactly one collapsed row
  // per juz it appears in, so exactly 3 rows total, never one per ruku.
  check('N6 البقرة (surah 2) collapses to exactly 3 rows (one per juz it spans)', function(){
    var baqarahRows = items.filter(function(r){ return r.name === JUZ_PAGES[r.startIdx].ayahs[0].surahName && JUZ_PAGES[r.startIdx].ayahs[0].surah === 2; });
    return baqarahRows.length === 3 || ('expected 3 rows, got ' + baqarahRows.length);
  });

  // Two item rows back-to-back with NO juz-header between them may never
  // share the same surah (that's the un-collapsed duplication bug this
  // fix addresses). The same surah legitimately reappears in the very
  // next row when a juz-header sits between them (surah spans the juz
  // boundary, e.g. البقرة continuing from juz 1 into juz 2) — that case
  // is intentional and excluded here.
  check('N6 no two item rows share the same surah without a juz-header between them', function(){
    for(var i = 1; i < rows.length; i++){
      if(rows[i].type !== 'item' || rows[i-1].type !== 'item') continue;
      var prevSurah = JUZ_PAGES[rows[i-1].startIdx].ayahs[0].surah;
      var curSurah = JUZ_PAGES[rows[i].startIdx].ayahs[0].surah;
      if(prevSurah === curSurah){
        return 'rows ' + (i-1) + ' and ' + i + ' both show surah ' + curSurah + ' back-to-back with no juz-header between them';
      }
    }
    return true;
  });

  // Collapsing must not drop or duplicate any ruku: the item ranges,
  // laid end-to-end, must cover every page index exactly once.
  check('N6 collapsed ranges cover all 556 rukus exactly once, no gaps or overlaps', function(){
    var covered = 0;
    for(var i = 0; i < items.length; i++){
      var r = items[i];
      if(r.endIdx < r.startIdx) return 'row ' + i + ' has endIdx < startIdx';
      if(i > 0 && r.startIdx !== items[i-1].endIdx + 1){
        return 'row ' + i + ' starts at ' + r.startIdx + ' but previous row ended at ' + items[i-1].endIdx;
      }
      covered += (r.endIdx - r.startIdx + 1);
    }
    return covered === JUZ_PAGES.length || ('covered ' + covered + ' of ' + JUZ_PAGES.length + ' rukus');
  });

  // Header count must equal the number of distinct juz values actually
  // present in JUZ_PAGES (30 for a standard full mushaf).
  check('N6 one juz-header per distinct juz value', function(){
    var distinctJuz = {};
    JUZ_PAGES.forEach(function(p){ distinctJuz[p.juz] = true; });
    var expected = Object.keys(distinctJuz).length;
    return headers.length === expected || ('expected ' + expected + ' headers, got ' + headers.length);
  });

  // Scope other than 'all' (e.g. per-surah) must NOT collapse — that
  // filtered view is already small and every ruku row should still show.
  check('N6 non-"all" scope (surah) is unaffected by collapsing', function(){
    var surahPageIdx = JUZ_PAGES.findIndex(function(p){ return p.ayahs[0].surah === 2; });
    var surahState = {displayScope: 'surah', page: surahPageIdx};
    var surahRows = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, surahState).filter(function(r){ return r.type === 'item'; });
    var expectedCount = JUZ_PAGES.filter(function(p){ return p.ayahs[0].surah === 2; }).length;
    return surahRows.length === expectedCount || ('expected ' + expectedCount + ' rows (one per ruku), got ' + surahRows.length);
  });
  // NEW: نطاق المنزل (منزل واحد) بيحتوي أحيانًا على سورة طويلة بعشرات
  // الأركان (مثلاً المنزل الأول: الفاتحة-النساء). لازم يتجمّع اسم السورة
  // في صف واحد هنا كمان، مش يتكرر لكل ركوع.
  check('N7 منزل scope: no two item rows share the same surah (all consecutive rukus collapsed)', function(){
    // المنزل الأول: يبدأ من سورة الفاتحة (1) لآخر النساء (4) — انظر
    // MANZIL_INFO subtitle في navigation.js. البقرة (2) وحدها فيه عشرات
    // الأركان، فهي أوضح حالة اختبار للتجميع.
    var manzilFirstPageIdx = JUZ_PAGES.findIndex(function(p){ return p.ayahs[0].surah === 1; });
    var manzilState = {displayScope: 'manzil', page: manzilFirstPageIdx};
    var manzilRows = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, manzilState);
    var manzilItems = manzilRows.filter(function(r){ return r.type === 'item'; });
    if(manzilItems.length < 2) return 'expected multiple surah rows in the first منزل, got ' + manzilItems.length;
    for(var i = 1; i < manzilItems.length; i++){
      var prevSurah = JUZ_PAGES[manzilItems[i-1].startIdx].ayahs[0].surah;
      var curSurah = JUZ_PAGES[manzilItems[i].startIdx].ayahs[0].surah;
      if(prevSurah === curSurah){
        return 'rows ' + (i-1) + ' and ' + i + ' both show surah ' + curSurah + ' — not collapsed';
      }
    }
    return true;
  });
  check('N7 منزل scope: البقرة collapses to exactly 1 row (single long surah in the first منزل)', function(){
    var manzilFirstPageIdx = JUZ_PAGES.findIndex(function(p){ return p.ayahs[0].surah === 1; });
    var manzilState = {displayScope: 'manzil', page: manzilFirstPageIdx};
    var manzilRows = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, manzilState).filter(function(r){ return r.type === 'item'; });
    var baqarahRows = manzilRows.filter(function(r){ return JUZ_PAGES[r.startIdx].ayahs[0].surah === 2; });
    return baqarahRows.length === 1 || ('expected 1 row, got ' + baqarahRows.length);
  });
  check('N7 منزل scope: collapsed ranges cover every ruku in the منزل exactly once', function(){
    var manzilFirstPageIdx = JUZ_PAGES.findIndex(function(p){ return p.ayahs[0].surah === 1; });
    var manzilState = {displayScope: 'manzil', page: manzilFirstPageIdx};
    var manzilRows = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, manzilState).filter(function(r){ return r.type === 'item'; });
    var manzilRange = window.getManzilRange(1);
    var expectedTotal = JUZ_PAGES.filter(function(p){
      var s = p.ayahs[0].surah;
      return s >= manzilRange.start && s <= manzilRange.end;
    }).length;
    var covered = 0;
    for(var i = 0; i < manzilRows.length; i++){
      var r = manzilRows[i];
      if(r.endIdx < r.startIdx) return 'row ' + i + ' has endIdx < startIdx';
      if(i > 0 && r.startIdx !== manzilRows[i-1].endIdx + 1){
        return 'row ' + i + ' starts at ' + r.startIdx + ' but previous row ended at ' + manzilRows[i-1].endIdx;
      }
      covered += (r.endIdx - r.startIdx + 1);
    }
    return covered === expectedTotal || ('covered ' + covered + ' of ' + expectedTotal + ' rukus');
  });
})();

// =====================================================================
// N8. الفهرس caching: opening the index while نطاق العرض is restricted
// (surah/juz/manzil) always rebuilds fresh — but that build overwrites
// the SAME shared els.indexList DOM node the 'all'-scope index also
// renders into. Bug: if the 'all'-scope index had already been built
// and cached once, switching to a restricted scope, opening the index
// (which overwrites the DOM with the restricted list), then switching
// back to 'all' and reopening skipped rebuilding — because the stale
// "already built" flag was never invalidated — leaving the restricted
// list's stale HTML on screen instead of the full index.
// =====================================================================
(function(){
  var decideIndexRebuild = Navigation && Navigation.decideIndexRebuild;
  check('N8 Navigation.decideIndexRebuild is exposed', function(){
    return typeof decideIndexRebuild === 'function' || 'Navigation.decideIndexRebuild missing';
  });
  if(typeof decideIndexRebuild !== 'function') return;

  // Simulates the exact user-reported sequence: open index while
  // scope='all' (builds + caches), switch to scope='manzil' and open
  // again (rebuilds fresh, must invalidate the 'all' cache), then switch
  // back to scope='all' and open once more — this MUST rebuild, not
  // reuse the stale cached flag from the first 'all' open.
  check('N8 reopening الفهرس in "all" scope after a restricted-scope open rebuilds (does not reuse stale cache)', function(){
    var indexBuilt = false;

    // 1) First open while scope='all': should build and cache.
    var d1 = decideIndexRebuild('all', indexBuilt);
    if(!d1.rebuild) return 'step 1: expected a rebuild on the very first "all" open';
    indexBuilt = d1.nextIndexBuilt;
    if(indexBuilt !== true) return 'step 1: expected indexBuilt to become true after the first "all" build';

    // 2) Switch to scope='manzil' and open: always rebuilds (restricted
    // scopes are never cached), and this must invalidate the 'all' cache
    // since it just overwrote the same shared DOM node.
    var d2 = decideIndexRebuild('manzil', indexBuilt);
    if(!d2.rebuild) return 'step 2: restricted scope (منزل) must always rebuild';
    indexBuilt = d2.nextIndexBuilt;
    if(indexBuilt !== false) return 'step 2: expected indexBuilt to be invalidated (false) after a restricted-scope build';

    // 3) Switch back to scope='all' and open again: THIS is the bug —
    // it must rebuild the real full index, not silently reuse the (now
    // stale, منزل-filtered) DOM content.
    var d3 = decideIndexRebuild('all', indexBuilt);
    if(!d3.rebuild) return 'step 3 (the reported bug): expected a rebuild when returning to "all" scope after a restricted-scope open, but decideIndexRebuild said no rebuild — the stale منزل list would stay on screen';
    return true;
  });

  check('N8 repeated "all"-scope opens with no restricted-scope open in between still reuse the cache (no needless rebuilds)', function(){
    var indexBuilt = false;
    var d1 = decideIndexRebuild('all', indexBuilt);
    indexBuilt = d1.nextIndexBuilt;
    var d2 = decideIndexRebuild('all', indexBuilt);
    return d2.rebuild === false || 'expected the second consecutive "all"-scope open to reuse the cache';
  });

  check('N8 restricted scopes (surah/juz/manzil) always rebuild regardless of indexBuilt state', function(){
    var scopes = ['surah', 'juz', 'manzil'];
    for(var i = 0; i < scopes.length; i++){
      var dTrue = decideIndexRebuild(scopes[i], true);
      var dFalse = decideIndexRebuild(scopes[i], false);
      if(!dTrue.rebuild || !dFalse.rebuild){
        return 'scope "' + scopes[i] + '" did not always rebuild';
      }
    }
    return true;
  });
})();

// =====================================================================
// N9. الفهرس panel title reflects نطاق العرض: "فهرس المصحف" when the
// scope is الكل, "فهرس المنزل الأول"/"الثاني"/... when the scope is
// منزل (matching whichever منزل the reader is currently in), and the
// old generic "الفهرس" for any other scope (unchanged).
// =====================================================================
(function(){
  var indexPanelTitleFor = Navigation && Navigation.indexPanelTitleFor;
  var UI = window.UI;
  check('N9 Navigation.indexPanelTitleFor is exposed', function(){
    return typeof indexPanelTitleFor === 'function' || 'Navigation.indexPanelTitleFor missing';
  });
  if(typeof indexPanelTitleFor !== 'function') return;

  check('N9 scope "all" → "فهرس المصحف"', function(){
    var title = indexPanelTitleFor('all', 1);
    return title === 'فهرس المصحف' || ('got "' + title + '"');
  });

  // منزل ١ starts at سورة الفاتحة (1); منزل ٢ starts at سورة المائدة (5).
  check('N9 منزل scope, current surah in the 1st منزل (الفاتحة) → "فهرس المنزل الأول"', function(){
    var title = indexPanelTitleFor('manzil', 1);
    return title === 'فهرس المنزل الأول' || ('got "' + title + '"');
  });
  check('N9 منزل scope, current surah in the 2nd منزل (المائدة) → "فهرس المنزل الثاني"', function(){
    var title = indexPanelTitleFor('manzil', 5);
    return title === 'فهرس المنزل الثاني' || ('got "' + title + '"');
  });
  // المنزل السابع (الأخير) يبدأ من سورة ق (50) لحد الناس (114) — يغطي
  // أطول مدى أرقام سور، وهو الحد الأقصى لمصفوفة MANZIL_ORDINALS.
  check('N9 منزل scope, current surah in the 7th (last) منزل (سورة ق) → "فهرس المنزل السابع"', function(){
    var title = indexPanelTitleFor('manzil', 50);
    return title === 'فهرس المنزل السابع' || ('got "' + title + '"');
  });
  check('N9 منزل scope, current surah mid-way through a منزل (not its first surah) still resolves correctly', function(){
    // سورة النساء (4) لسه جوه المنزل الأول (الفاتحة..النساء)، مش أول
    // سورة فيه — لازم يتحل بنفس الشكل عشان الفلترة بتبقى على نطاق كامل
    // مش أول سورة بس.
    var title = indexPanelTitleFor('manzil', 4);
    return title === 'فهرس المنزل الأول' || ('got "' + title + '"');
  });

  // سورة scope → "فهرس السورة N" بنفس رقم السورة (مش اسمها ولا ترتيب
  // لفظي)، زي أسلوب رقم الجزء — انظر تعليق indexPanelTitleFor.
  check('N9 سورة scope, curSurah=2 (البقرة) → "فهرس السورة ٢" (with digitsFn)', function(){
    var title = indexPanelTitleFor('surah', 2, null, UI.toArabicDigits);
    return title === 'فهرس السورة ٢' || ('got "' + title + '"');
  });
  check('N9 سورة scope without a digitsFn falls back to plain digits', function(){
    var title = indexPanelTitleFor('surah', 2);
    return title === 'فهرس السورة 2' || ('got "' + title + '"');
  });
  check('N9 سورة scope with curSurah == null falls back to the generic "الفهرس" title', function(){
    var title = indexPanelTitleFor('surah', null);
    return title === 'الفهرس' || ('got "' + title + '"');
  });

  // Other scopes must keep the old generic title unchanged.
  ['juz', undefined, null].forEach(function(scope){
    check('N9 scope ' + JSON.stringify(scope) + ' keeps the generic "الفهرس" title', function(){
      var title = indexPanelTitleFor(scope, 2);
      return title === 'الفهرس' || ('got "' + title + '"');
    });
  });
})();

// =====================================================================
// N10. نطاق العرض = الجزء الحالي: الفهرس بيتقسم لثمانية أرباع بحدودهم
// الحقيقية (من window.RUB_STARTS، لا علاقة لها بحدود الركوعات)، وعنوان
// اللوحة بيبقى "فهرس الجزء N".
// =====================================================================
(function(){
  var UI = window.UI;
  check('N10 window.RUB_STARTS is loaded with 240 quarter-start points', function(){
    return (window.RUB_STARTS && window.RUB_STARTS.length === 240) || 'RUB_STARTS missing or wrong length';
  });
  if(!window.RUB_STARTS || window.RUB_STARTS.length !== 240) return;

  // Known, independently-verifiable Rub' boundaries (they double as the
  // FIRST rub' of a juz, i.e. traditional juz-start ayahs — widely
  // documented, unlike interior quarter boundaries):
  //   rub 1   (juz 1 start)  = 1:1
  //   rub 9   (juz 2 start)  = 2:142
  //   rub 17  (juz 3 start)  = 2:253
  //   rub 25  (juz 4 start)  = 3:93
  //   rub 233 (juz 30 start) = 78:1
  var KNOWN_JUZ_START_RUBS = [
    {rub: 1, surah: 1, ayah: 1},
    {rub: 9, surah: 2, ayah: 142},
    {rub: 17, surah: 2, ayah: 253},
    {rub: 25, surah: 3, ayah: 93},
    {rub: 233, surah: 78, ayah: 1}
  ];
  KNOWN_JUZ_START_RUBS.forEach(function(k){
    check('N10 rub ' + k.rub + ' (a known juz-start boundary) = ' + k.surah + ':' + k.ayah, function(){
      var pair = window.RUB_STARTS[k.rub - 1];
      return (pair && pair[0] === k.surah && pair[1] === k.ayah) ||
        ('got ' + JSON.stringify(pair));
    });
  });

  // تصحيح مؤكد على الجهاز (device-verified، مش مجرد اتساق داخلي زي الفحص
  // اللي فوق): رُبع الجزء ١٤ الثاني (رقمه العالمي ١٠٦) لازم يبدأ عند
  // الحجر ٤٩ "نَبِّئْ عِبَادِي" مش ٥٠ — كان المصدر الأصلي (malekverse)
  // غلط هنا (نفس نوع عيب الجودة اللي لقيناه قبل كده في نفس المصدر).
  check('N10 rub 106 (juz 14, quarter 2) is corrected to الحجر 49 ("نَبِّئْ عِبَادِي"), not 50', function(){
    var pair = window.RUB_STARTS[105];
    return (pair && pair[0] === 15 && pair[1] === 49) || ('got ' + JSON.stringify(pair));
  });

  check('N10 each juz has exactly 8 quarters, sequential and non-overlapping across the whole Quran', function(){
    // rub numbers (juz-1)*8+1 .. juz*8 must be strictly increasing in
    // (surah, ayah) order and never repeat/skip a juz.
    for(var i = 1; i < 240; i++){
      var prev = window.RUB_STARTS[i - 1];
      var cur = window.RUB_STARTS[i];
      var prevKey = prev[0] * 1000 + prev[1];
      var curKey = cur[0] * 1000 + cur[1];
      if(curKey <= prevKey) return 'rub ' + (i+1) + ' (' + cur + ') does not come after rub ' + i + ' (' + prev + ')';
    }
    return true;
  });

  var Navigation = window.Navigation;
  check('N10 نطاق الجزء: computeIndexRows returns exactly 8 "quarter" rows for the current juz', function(){
    var pageIdx = JUZ_PAGES.findIndex(function(p){ return p.juz === 16; });
    if(pageIdx === -1) return 'no page found in juz 16 — check test fixture';
    var state = {displayScope: 'juz', page: pageIdx};
    var rows = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, state);
    var quarters = rows.filter(function(r){ return r.type === 'quarter'; });
    if(rows.some(function(r){ return r.type !== 'quarter'; })) return 'رجعت صفوف مش من نوع quarter';
    return quarters.length === 8 || ('expected 8 quarter rows, got ' + quarters.length);
  });

  check('N10 نطاق الجزء: quarter ordinals are 1..8 in order, each with a valid ayah/ruku/startIdx/surahName', function(){
    var pageIdx = JUZ_PAGES.findIndex(function(p){ return p.juz === 16; });
    var state = {displayScope: 'juz', page: pageIdx};
    var quarters = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, state);
    for(var i = 0; i < quarters.length; i++){
      var q = quarters[i];
      if(q.ordinal !== i + 1) return 'row ' + i + ' has ordinal ' + q.ordinal + ', expected ' + (i + 1);
      if(!(q.ayah > 0)) return 'row ' + i + ' has an invalid ayah: ' + q.ayah;
      if(!(q.ruku > 0)) return 'row ' + i + ' has an invalid ruku: ' + q.ruku;
      if(q.startIdx < 0 || q.startIdx >= JUZ_PAGES.length) return 'row ' + i + ' has an out-of-range startIdx: ' + q.startIdx;
      if(!q.surahName) return 'row ' + i + ' is missing a surahName';
    }
    return true;
  });

  // فحص معروف مباشر: الجزء ٣ رُبعه الأول يبدأ ٢:٢٥٣ (سورة البقرة) —
  // نفس المثال اللي طلبه المستخدم بالظبط ("يبدأ من البقرة ١٤٢ - الركوع ١٨"
  // بالنسبة للجزء ٢).
  check('N10 نطاق الجزء: quarter surahName matches the surah its boundary ayah actually falls in (juz 3 → البقرة)', function(){
    var pageIdx = JUZ_PAGES.findIndex(function(p){ return p.juz === 3; });
    var quarters = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, {displayScope: 'juz', page: pageIdx});
    var q1 = quarters[0];
    return (q1.surah === 2 && q1.surahName === JUZ_PAGES.find(function(p){ return p.ayahs.some(function(a){ return a.surah === 2 && a.ayah === 253; }); }).ayahs.find(function(a){ return a.surah === 2 && a.ayah === 253; }).surahName) ||
      ('got surah ' + q1.surah + ' name "' + q1.surahName + '"');
  });

  // NOTE: this deliberately checks against the authoritative RUB_STARTS
  // boundary itself, NOT against "the first PAGES entry whose own p.juz
  // field equals 16" — 17 rukus in this project straddle a juz boundary
  // (documented/verified elsewhere in this project's own history), so a
  // ruku's single p.juz label can legitimately differ from the true
  // ayah-precise juz of its later ayahs. Juz 16 is exactly such a case:
  // it traditionally starts at 18:75 (سورة الكهف, "قَالَ..."), which
  // falls inside a ruku whose p.juz is still labeled 15.
  check('N10 نطاق الجزء: quarter #1 of juz 16 matches the authoritative rub\' boundary (١٨:٧٥)', function(){
    var pageIdx = JUZ_PAGES.findIndex(function(p){ return p.juz === 16; });
    var state = {displayScope: 'juz', page: pageIdx};
    var quarters = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, state);
    var q1 = quarters[0];
    var expected = window.RUB_STARTS[(16 - 1) * 8]; // [surah, ayah]
    return (q1.ayah === expected[1]) || ('q1.ayah = ' + q1.ayah + ', expected ' + expected[1] + ' (from rub-info.js)');
  });

  check('N10 نطاق الجزء: different juz values produce different, correctly-scoped quarter sets', function(){
    var page17 = JUZ_PAGES.findIndex(function(p){ return p.juz === 17; });
    var quarters17 = Navigation.computeIndexRows(JUZ_PAGES, JUZ_INFO, {displayScope: 'juz', page: page17});
    if(quarters17.length !== 8) return 'expected 8 quarters for juz 17, got ' + quarters17.length;
    // Quarters 2-8 (ordinal index 1+) never straddle the juz's OWN
    // opening boundary, so their startIdx ruku is reliably tagged with
    // p.juz===17 in JUZ_PAGES (only the very first quarter of a juz can
    // land on a straddling ruku still labeled with the previous juz —
    // see the quarter #1 caveat above).
    var mismatched = quarters17.slice(1).filter(function(q){ return JUZ_PAGES[q.startIdx].juz !== 17; });
    return mismatched.length === 0 || ('quarters at indices ' + mismatched.map(function(q){ return q.ordinal; }).join(',') + ' point outside juz 17');
  });

  // Panel title: "فهرس الجزء N" (with Arabic-Indic digits, matching every
  // other numeral in the app's UI).
  check('N10 indexPanelTitleFor("juz", ..., 16, UI.toArabicDigits) → "فهرس الجزء ١٦"', function(){
    if(!Navigation || typeof Navigation.indexPanelTitleFor !== 'function') return 'Navigation.indexPanelTitleFor missing';
    if(!UI || typeof UI.toArabicDigits !== 'function') return 'UI.toArabicDigits missing — was ui.js loaded?';
    var title = Navigation.indexPanelTitleFor('juz', 2, 16, UI.toArabicDigits);
    return title === 'فهرس الجزء ١٦' || ('got "' + title + '"');
  });
  check('N10 indexPanelTitleFor("juz", ..., 17, UI.toArabicDigits) → "فهرس الجزء ١٧"', function(){
    var title = Navigation.indexPanelTitleFor('juz', 24, 17, UI.toArabicDigits);
    return title === 'فهرس الجزء ١٧' || ('got "' + title + '"');
  });
  check('N10 indexPanelTitleFor without a digitsFn falls back to plain digits (still testable without DOM)', function(){
    var title = Navigation.indexPanelTitleFor('juz', 2, 16);
    return title === 'فهرس الجزء 16' || ('got "' + title + '"');
  });
})();

// =====================================================================
// N11. تحقق كامل ٢٤٠/٢٤٠ لـ RUB_STARTS مقابل كتاب "فتح الرحمن في جداول
// أرباع القرآن" (د. محمد بكر محمد عبدالهادي، شبكة الألوكة، ١٤٣٩هـ) —
// المصدر المرجعي اللي زوّدنا بيه المستخدم. المصفوفة تحت مستخرجة آليًا
// (pdfplumber) من جداول الكتاب نفسها، سورة وآية معًا لكل ربع، مش رؤوس
// الأجزاء الثلاثين بس زي فحوصات N10 أعلاه. أي انحراف مستقبلي عن هذا
// الكتاب — حتى لو نقطة واحدة — المفروض يفشّل هنا فورًا.
// =====================================================================
(function(){
  check('N11 window.RUB_STARTS matches the published book exactly at all 240 points', function(){
    if(!window.RUB_STARTS || window.RUB_STARTS.length !== 240) return 'RUB_STARTS missing or wrong length';
    var BOOK = [[1,1],[2,26],[2,44],[2,60],[2,75],[2,92],[2,106],[2,124],[2,142],[2,158],[2,177],[2,189],[2,203],[2,219],[2,233],[2,243],[2,253],[2,263],[2,272],[2,283],[3,15],[3,33],[3,52],[3,75],[3,93],[3,113],[3,133],[3,153],[3,171],[3,186],[4,1],[4,12],[4,24],[4,36],[4,58],[4,74],[4,88],[4,100],[4,114],[4,135],[4,148],[4,163],[5,1],[5,12],[5,27],[5,41],[5,51],[5,67],[5,82],[5,97],[5,109],[6,13],[6,36],[6,59],[6,74],[6,95],[6,111],[6,127],[6,141],[6,151],[7,1],[7,31],[7,47],[7,65],[7,88],[7,117],[7,142],[7,156],[7,171],[7,189],[8,1],[8,22],[8,41],[8,61],[9,1],[9,19],[9,34],[9,46],[9,60],[9,75],[9,93],[9,111],[9,122],[10,11],[10,26],[10,53],[10,71],[10,90],[11,6],[11,24],[11,41],[11,61],[11,84],[11,108],[12,7],[12,30],[12,53],[12,77],[12,101],[13,5],[13,19],[13,35],[14,10],[14,28],[15,1],[15,49],[16,1],[16,30],[16,51],[16,75],[16,90],[16,111],[17,1],[17,23],[17,50],[17,70],[17,99],[18,17],[18,32],[18,51],[18,75],[18,99],[19,22],[19,59],[20,1],[20,55],[20,83],[20,111],[21,1],[21,29],[21,51],[21,83],[22,1],[22,19],[22,38],[22,60],[23,1],[23,36],[23,75],[24,1],[24,21],[24,35],[24,53],[25,1],[25,21],[25,53],[26,1],[26,52],[26,111],[26,181],[27,1],[27,27],[27,56],[27,82],[28,12],[28,29],[28,51],[28,76],[29,1],[29,26],[29,46],[30,1],[30,31],[30,54],[31,22],[32,11],[33,1],[33,18],[33,31],[33,51],[33,60],[34,10],[34,24],[34,46],[35,15],[35,41],[36,28],[36,60],[37,22],[37,83],[37,145],[38,21],[38,52],[39,8],[39,32],[39,53],[40,1],[40,21],[40,41],[40,66],[41,9],[41,25],[41,47],[42,13],[42,27],[42,51],[43,24],[43,57],[44,17],[45,12],[46,1],[46,21],[47,10],[47,33],[48,18],[49,1],[49,14],[50,27],[51,31],[52,24],[53,26],[54,9],[55,1],[56,1],[56,75],[57,16],[58,1],[58,14],[59,11],[60,7],[62,1],[63,4],[65,1],[66,1],[67,1],[68,1],[69,1],[70,19],[72,1],[73,20],[75,1],[76,19],[78,1],[80,1],[82,1],[84,1],[87,1],[90,1],[94,1],[100,9]];
    for(var i = 0; i < 240; i++){
      var a = window.RUB_STARTS[i], b = BOOK[i];
      if(!a || a[0] !== b[0] || a[1] !== b[1]){
        return 'rub ' + (i+1) + ': RUB_STARTS has ' + JSON.stringify(a) + ', book has ' + JSON.stringify(b);
      }
    }
    return true;
  });
})();

// =====================================================================
// N12. زر "الذهاب إلى ركوع رقم" (btnGoto) في نطاق العرض = المنزل يتحول
// للذهاب إلى منزل رقم (١-٧) بدل رقم ركوع مطلق — يذهب لأول ركوع في أول
// سورة من ذلك المنزل. Navigation.findPageIndexForManzil/currentManzilNumber
// هما الدالتان الصرفتان (pure) خلف السلوك ده، بدون أي DOM.
// =====================================================================
(function(){
  check('N12 Navigation.findPageIndexForManzil / currentManzilNumber are exposed', function(){
    return (Navigation && typeof Navigation.findPageIndexForManzil === 'function' && typeof Navigation.currentManzilNumber === 'function')
      || 'Navigation.findPageIndexForManzil/currentManzilNumber missing — were they wired into window.Navigation?';
  });
  if(!Navigation || typeof Navigation.findPageIndexForManzil !== 'function') return;

  // كل رقم منزل (١-٧) لازم يوصل لأول ركوع في أول سورة من ذلك المنزل —
  // نفس (سورة، آية ١) المتوقعة من window.MANZIL_STARTS مباشرة.
  window.MANZIL_STARTS.forEach(function(startSurah, i){
    var manzilNum = i + 1;
    check('N12 findPageIndexForManzil(' + manzilNum + ') lands on surah ' + startSurah + ' ayah 1', function(){
      var idx = Navigation.findPageIndexForManzil(JUZ_PAGES, manzilNum);
      if(idx === -1) return 'returned -1';
      var first = JUZ_PAGES[idx].ayahs[0];
      return (first.surah === startSurah && first.ayah === 1)
        || ('expected surah ' + startSurah + ' ayah 1, got surah ' + first.surah + ' ayah ' + first.ayah);
    });
  });

  check('N12 findPageIndexForManzil(0) (out of range, below ١) returns -1', function(){
    var idx = Navigation.findPageIndexForManzil(JUZ_PAGES, 0);
    return idx === -1 || ('expected -1, got ' + idx);
  });
  check('N12 findPageIndexForManzil(8) (out of range, above ٧) returns -1', function(){
    var idx = Navigation.findPageIndexForManzil(JUZ_PAGES, 8);
    return idx === -1 || ('expected -1, got ' + idx);
  });

  // currentManzilNumber: أي صفحة داخل نطاق منزل معيّن لازم ترجع رقم ذلك
  // المنزل بالظبط — بيتفحص بأول صفحة من كل منزل ونص عشوائي جواه.
  window.MANZIL_STARTS.forEach(function(startSurah, i){
    var manzilNum = i + 1;
    var pageIdx = JUZ_PAGES.findIndex(function(p){ return p.ayahs[0].surah === startSurah; });
    check('N12 currentManzilNumber() at the first page of منزل ' + manzilNum + ' returns ' + manzilNum, function(){
      var n = Navigation.currentManzilNumber(JUZ_PAGES, {page: pageIdx});
      return n === manzilNum || ('expected ' + manzilNum + ', got ' + n);
    });
  });
})();

// =====================================================================
// N14. زر "الذهاب إلى ركوع رقم" (btnGoto) في نطاق العرض = الجزء يتحول
// للذهاب إلى جزء رقم (١-٣٠) بدل رقم ركوع مطلق — يذهب لأول ركوع في ذلك
// الجزء. Navigation.findPageIndexForJuz/currentJuzNumber هما الدالتان
// الصرفتان (pure) خلف السلوك ده، بدون أي DOM — نفس فكرة N12 فوق لكن
// للجزء بدل المنزل.
// =====================================================================
(function(){
  check('N14 Navigation.findPageIndexForJuz / currentJuzNumber are exposed', function(){
    return (Navigation && typeof Navigation.findPageIndexForJuz === 'function' && typeof Navigation.currentJuzNumber === 'function')
      || 'Navigation.findPageIndexForJuz/currentJuzNumber missing — were they wired into window.Navigation?';
  });
  if(!Navigation || typeof Navigation.findPageIndexForJuz !== 'function') return;

  // كل رقم جزء (١-٣٠) لازم يوصل لأول صفحة (ركوع) في ذلك الجزء بالظبط —
  // نفس رقم الجزء المخزن في PAGES[idx].juz.
  for(var juzNum = 1; juzNum <= 30; juzNum++){
    (function(juzNum){
      check('N14 findPageIndexForJuz(' + juzNum + ') lands on the first page of juz ' + juzNum, function(){
        var idx = Navigation.findPageIndexForJuz(JUZ_PAGES, juzNum);
        if(idx === -1) return 'returned -1';
        if(JUZ_PAGES[idx].juz !== juzNum) return 'expected juz ' + juzNum + ', got juz ' + JUZ_PAGES[idx].juz;
        return (idx === 0 || JUZ_PAGES[idx - 1].juz !== juzNum)
          || 'index ' + idx + ' is not the first page of juz ' + juzNum;
      });
    })(juzNum);
  }

  check('N14 findPageIndexForJuz(0) (out of range, below ١) returns -1', function(){
    var idx = Navigation.findPageIndexForJuz(JUZ_PAGES, 0);
    return idx === -1 || ('expected -1, got ' + idx);
  });
  check('N14 findPageIndexForJuz(31) (out of range, above ٣٠) returns -1', function(){
    var idx = Navigation.findPageIndexForJuz(JUZ_PAGES, 31);
    return idx === -1 || ('expected -1, got ' + idx);
  });

  // currentJuzNumber: أي صفحة داخل جزء معيّن لازم ترجع رقم ذلك الجزء
  // بالظبط — بيتفحص بأول صفحة من كل جزء.
  for(var j = 1; j <= 30; j++){
    (function(j){
      var pageIdx = JUZ_PAGES.findIndex(function(p){ return p.juz === j; });
      check('N14 currentJuzNumber() at the first page of juz ' + j + ' returns ' + j, function(){
        var n = Navigation.currentJuzNumber(JUZ_PAGES, {page: pageIdx});
        return n === j || ('expected ' + j + ', got ' + n);
      });
    })(j);
  }
})();

// =====================================================================
// N13. btnGoto ("الذهاب إلى ركوع/منزل رقم") is an element INSIDE
// الفهرس's (indexPanel) own header (index.html), never reachable any
// other way — so openGoto()'s onGo callback, in BOTH branches (رقم
// ركوع مطلق و رقم منزل), must close indexPanel after navigating, or the
// panel stays open on top of the reader and hides the ruku/منزل the
// person just navigated to (confirmed on-device via the v1.0.8
// diagnostic log: goToPage() ran correctly every time, but #indexPanel
// was never closed, so nothing visibly changed on screen). This is a
// source-level check (not a DOM-driven behavioral one — see
// tests/history-regression.js "H7" for the behavioral half, which
// certifies that UI.closePanel(indexPanel) called from here correctly
// queues/resolves against a still-in-flight close of the nested
// gotoModal) since fully driving Navigation.init()'s real click handler
// needs far more DOM/module mocking than this suite sets up elsewhere.
// =====================================================================
(function(){
  var navSrc = fs.readFileSync(path.join(PROJECT_DIR, 'navigation.js'), 'utf8');
  var openGotoMatch = navSrc.match(/function openGoto\(\)\{[\s\S]*?\n    \}\n/);
  check('N13 openGoto() function is present in navigation.js', function(){
    return !!openGotoMatch || 'could not locate function openGoto(){...} in navigation.js — file structure changed?';
  });
  if(!openGotoMatch) return;
  var openGotoBody = openGotoMatch[0];

  // Split into the منزل branch (before the early `return;`) and the
  // plain ركوع branch (after it) so each is checked independently —
  // it's specifically easy to add the fix to one branch and forget the
  // other, which is exactly the shape of regression this must catch.
  var returnIdx = openGotoBody.indexOf('return;');
  var manzilBranch = returnIdx > -1 ? openGotoBody.slice(0, returnIdx) : openGotoBody;
  var rukuBranch = returnIdx > -1 ? openGotoBody.slice(returnIdx) : '';

  check('N13 منزل branch calls Home.openReaderAt(...)', function(){
    return /Home\.openReaderAt\(/.test(manzilBranch) || 'Home.openReaderAt(...) call missing from the منزل branch';
  });
  check('N13 منزل branch closes indexPanel after navigating', function(){
    return /UI\.closePanel\(\s*els\.indexPanel\s*\)/.test(manzilBranch)
      || 'UI.closePanel(els.indexPanel) missing from the منزل branch — the panel will stay open and hide the navigation';
  });
  check('N13 plain ركوع branch calls Home.openReaderAt(...)', function(){
    return /Home\.openReaderAt\(/.test(rukuBranch) || 'Home.openReaderAt(...) call missing from the ركوع branch';
  });
  check('N13 plain ركوع branch closes indexPanel after navigating', function(){
    return /UI\.closePanel\(\s*els\.indexPanel\s*\)/.test(rukuBranch)
      || 'UI.closePanel(els.indexPanel) missing from the ركوع branch — the panel will stay open and hide the navigation';
  });
})();

// =====================================================================
// N14. نطاق العرض = السورة الحالية: زر btnGoto بيتحول لـ"الانتقال إلى
// سورة" — يقبل رقم السورة أو اسمها، على عكس أدوات المنزل/الجزء اللي
// بتقبل رقم بس. يغطي resolveSurahGotoInput (المنطق البحت اللي بيحل
// المدخل لرقم سورة) وgotoButtonLabelFor (نص/تلميح الزر حسب النطاق).
// =====================================================================
(function(){
  var resolveSurahGotoInput = Navigation && Navigation.resolveSurahGotoInput;
  check('N14 Navigation.resolveSurahGotoInput is exposed', function(){
    return typeof resolveSurahGotoInput === 'function' || 'Navigation.resolveSurahGotoInput missing';
  });
  if(typeof resolveSurahGotoInput === 'function'){
    check('N14 numeric input "٢" (Arabic-Indic digits) resolves to surah 2', function(){
      var n = resolveSurahGotoInput('٢');
      return n === 2 || ('got ' + n);
    });
    check('N14 numeric input "114" resolves to surah 114 (upper bound)', function(){
      var n = resolveSurahGotoInput('114');
      return n === 114 || ('got ' + n);
    });
    check('N14 numeric input "0" is rejected (below range)', function(){
      var n = resolveSurahGotoInput('0');
      return (n === null || n === undefined) || ('got ' + n);
    });
    check('N14 numeric input "115" is rejected (above range)', function(){
      var n = resolveSurahGotoInput('115');
      return (n === null || n === undefined) || ('got ' + n);
    });
    check('N14 empty/whitespace input is rejected', function(){
      var n = resolveSurahGotoInput('   ');
      return (n === null || n === undefined) || ('got ' + n);
    });
    check('N14 exact surah name "البقرة" resolves to surah 2', function(){
      var n = resolveSurahGotoInput('البقرة');
      return n === 2 || ('got ' + n);
    });
    check('N14 a name that is only a partial/substring match (not the full surah name) is rejected', function(){
      // "النساء" (سورة النساء، رقم ٤) لازم ميتقبلش كمطابقة جزئية لاسم
      // تاني — بيتأكد إن المطابقة على الاسم الكامل بس، مش substring زي
      // searchSurahs() العادية.
      var n = resolveSurahGotoInput('نساء');
      return (n === null || n === undefined) || ('got ' + n);
    });
    check('N14 unknown name is rejected', function(){
      var n = resolveSurahGotoInput('سورة غير موجودة أصلًا');
      return (n === null || n === undefined) || ('got ' + n);
    });
  }

  var gotoButtonLabelFor = Navigation && Navigation.gotoButtonLabelFor;
  check('N14 Navigation.gotoButtonLabelFor is exposed', function(){
    return typeof gotoButtonLabelFor === 'function' || 'Navigation.gotoButtonLabelFor missing';
  });
  if(typeof gotoButtonLabelFor === 'function'){
    check('N14 scope "surah" → "الانتقال إلى سورة" button label', function(){
      var label = gotoButtonLabelFor('surah');
      return label === 'الانتقال إلى سورة' || ('got "' + label + '"');
    });
    ['all', 'manzil', 'juz', undefined, null].forEach(function(scope){
      check('N14 scope ' + JSON.stringify(scope) + ' keeps the default "الذهاب إلى ركوع رقم" button label', function(){
        var label = gotoButtonLabelFor(scope);
        return label === 'الذهاب إلى ركوع رقم' || ('got "' + label + '"');
      });
    });
  }
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
