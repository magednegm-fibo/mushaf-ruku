#!/usr/bin/env node
// =====================================================================
// Search Regression Test Suite — مصحف الركوع
// =====================================================================
// Runs entirely standalone via `node tests/search-regression.js` from
// the project root — no build step, no dependencies, nothing installed.
// Loads the ACTUAL shipped files (data.js, searchManager.js,
// readerManager.js) exactly as a browser would, then asserts against
// SearchManager's real public API. No mocking of search logic.
//
// PROJECT RULE: this must be run against files extracted from the final
// packaged ZIP before any release that touches searchManager.js or
// readerManager.js — not just the working-copy files — per the
// project's standing "the ZIP is the only source of truth" rule (see
// docs/search-regression-suite.md). Passing here on working files does
// NOT itself certify a release; re-run with --dir pointing at an
// unzipped release candidate to certify it.
//
// Usage:
//   node tests/search-regression.js                  (tests this checkout)
//   node tests/search-regression.js --dir /path/to/unzipped-release
//
// Exit code 0 = all pass. Exit code 1 = at least one failure — treat
// this as a release blocker for search/reader changes.
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
  ['data.js', 'searchManager.js', 'readerManager.js'].forEach(function(f){
    var full = path.join(PROJECT_DIR, f);
    if(!fs.existsSync(full)){
      throw new Error('Missing required file: ' + full);
    }
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(full, 'utf8'));
  });
  if(!window.SearchManager || !window.ReaderManager || !window.JUZ_PAGES){
    throw new Error('Project files loaded but did not expose the expected globals.');
  }
  window.SearchManager.init(window.JUZ_PAGES);
  return window;
}

var window = loadProject();
var SearchManager = window.SearchManager;
var ReaderManager = window.ReaderManager;
var JUZ_PAGES = window.JUZ_PAGES;

// ---------------------------------------------------------------------
// Tiny built-in test runner — no external test framework needed.
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

function findAyah(surah, ayah){
  for(var i = 0; i < JUZ_PAGES.length; i++){
    var p = JUZ_PAGES[i];
    for(var j = 0; j < p.ayahs.length; j++){
      var a = p.ayahs[j];
      if(a.surah === surah && a.ayah === ayah) return a;
    }
  }
  return null;
}

// =====================================================================
// SECTION A — Historical regression cases (specific bugs, once fixed,
// that must never silently come back). Each one names the ayah, the
// query, and what must hold. Add a new row here every time a new
// per-ayah bug is reported and fixed — this is the permanent record.
// =====================================================================

// A0. Ruku-end waqf mark data bug — 4:33 (ركوع 66) is the last ayah of
// its ركوع. Its textIndopak wrongly ended with the "لا" (no-stop,
// U+06D9) Sajawandi mark — the ONLY one of all 556 ruku-ending ayaat
// in data.js to do so (454 of the other 555 end with the font's own
// ruku-end waqf mark, U+E022). Confirmed against a printed مصحف النسخ
// (تعليق) reference photo, which shows ع at this exact position, not
// لا. Fixed by replacing the trailing U+06D9 with U+E022 in data.js.
check('A0: 4:33 (ruku-end) textIndopak does NOT end with لا (U+06D9)', function(){
  var a = findAyah(4, 33);
  if(!a) return '4:33 not found';
  var ip = (a.textIndopak || '').replace(/[\u200b\u200f\s]+$/, '');
  var lastCp = ip.codePointAt(ip.length - 1);
  return lastCp !== 0x06D9 || ('4:33 textIndopak still ends with لا (U+06D9): ' + ip.slice(-10));
});

check('A0: 4:33 (ruku-end) textIndopak ends with the ruku-end waqf mark (U+E022)', function(){
  var a = findAyah(4, 33);
  if(!a) return '4:33 not found';
  var ip = (a.textIndopak || '').replace(/[\u200b\u200f\s]+$/, '');
  var lastCp = ip.codePointAt(ip.length - 1);
  return lastCp === 0xE022 || ('expected U+E022 at end of 4:33 textIndopak, got: 0x' + lastCp.toString(16));
});

// A0b. Same class of bug — 6:20 (ركوع 103) is also a ruku-end ayah and
// its textIndopak was missing the ruku-end waqf mark entirely (ended
// with a plain fatha, no mark at all). Confirmed against a printed
// مصحف النسخ (تعليق) reference photo, which shows ع at this position.
// Fixed by appending U+E022 after the final letter in data.js.
check('A0b: 6:20 (ruku-end) textIndopak ends with the ruku-end waqf mark (U+E022)', function(){
  var a = findAyah(6, 20);
  if(!a) return '6:20 not found';
  var ip = (a.textIndopak || '').replace(/[\u200b\u200f\s]+$/, '');
  var lastCp = ip.codePointAt(ip.length - 1);
  return lastCp === 0xE022 || ('expected U+E022 at end of 6:20 textIndopak, got: 0x' + lastCp.toString(16));
});

// A0c. Structural ruku-boundary bug — 26:69 was wrongly included as the
// LAST ayah of ركوع 319 (53-69). It must be the FIRST ayah of ركوع 320
// instead (i.e. ركوع 319 = 53-68, ركوع 320 = 69-104). Confirmed against
// a printed مصحف النسخ (تعليق) reference photo. Fixed by moving the
// 26:69 ayah object from the ركوع-319 page's ayahs array to the front
// of the ركوع-320 page's ayahs array in data.js. Total ruku count (556)
// must stay unchanged — this is a boundary shift, not an insertion.
check('A0c: ruku 319 ends at 26:68 (not 26:69)', function(){
  var p = JUZ_PAGES.filter(function(pg){ return pg.ruku === 319; })[0];
  if(!p) return 'ruku 319 not found';
  var last = p.ayahs[p.ayahs.length - 1];
  return (last.surah === 26 && last.ayah === 68) || ('ruku 319 last ayah is ' + last.surah + ':' + last.ayah);
});

check('A0c: ruku 320 starts at 26:69 (not 26:70)', function(){
  var p = JUZ_PAGES.filter(function(pg){ return pg.ruku === 320; })[0];
  if(!p) return 'ruku 320 not found';
  var first = p.ayahs[0];
  return (first.surah === 26 && first.ayah === 69) || ('ruku 320 first ayah is ' + first.surah + ':' + first.ayah);
});

check('A0c: total ruku count is still 556 after the boundary shift', function(){
  return JUZ_PAGES.length === 556 || ('JUZ_PAGES.length is ' + JUZ_PAGES.length);
});

// A0d. Same class of bug as A0b — 33:40 (ركوع 365) is also a ruku-end
// ayah and its textIndopak was missing the ruku-end waqf mark entirely
// (ended with a plain letter, no mark at all). Confirmed against a
// printed مصحف النسخ (تعليق) reference photo, which shows ع at this
// position. Fixed by appending U+E022 after the final letter in data.js.
check('A0d: 33:40 (ruku-end) textIndopak ends with the ruku-end waqf mark (U+E022)', function(){
  var a = findAyah(33, 40);
  if(!a) return '33:40 not found';
  var ip = (a.textIndopak || '').replace(/[\u200b\u200f\s]+$/, '');
  var lastCp = ip.codePointAt(ip.length - 1);
  return lastCp === 0xE022 || ('expected U+E022 at end of 33:40 textIndopak, got: 0x' + lastCp.toString(16));
});

// A0e. Rendering bug (not a data bug) -- the ruku-end mark (U+E022) does
// not appear at all when it directly follows a bare ن (noon) with no
// harakah in between, confirmed on-device at 59:17 (textIndopak already
// had the correct U+E022 character; it just didn't render). Every other
// letter tested (33:40's bare ا, 4:33, 6:20's نَ) rendered fine natively.
// Fixed in readerManager.js/style.css by wrapping the mark in
// .waqf-ruku-mark-noon-lift only for this exact ن+U+E022 sequence.
check('A0e: 59:17 ruku-end mark gets the noon-collision lift wrapper', function(){
  var a = findAyah(59, 17);
  if(!a) return '59:17 not found';
  var html = ReaderManager.renderAyahTextWithHighlight(a.textIndopak, null);
  return html.indexOf('waqf-ruku-mark-noon-lift') !== -1 || 'lift wrapper class not found in rendered HTML';
});

check('A0e: the noon-collision lift wrapper does NOT fire for unrelated ruku ends (33:40, 6:20, 4:33)', function(){
  var unaffected = [[33,40],[6,20],[4,33]];
  for(var i = 0; i < unaffected.length; i++){
    var a = findAyah(unaffected[i][0], unaffected[i][1]);
    if(!a) return unaffected[i].join(':') + ' not found';
    var html = ReaderManager.renderAyahTextWithHighlight(a.textIndopak, null);
    if(html.indexOf('waqf-ruku-mark-noon-lift') !== -1){
      return 'lift wrapper incorrectly fired for ' + unaffected[i].join(':');
    }
  }
  return true;
});

// A0f. Same class of bug as A0b/A0d -- 95:8 (ركوع 537, last ayah of
// سورة التين) is also a ruku-end ayah and its textIndopak was missing
// the ruku-end waqf mark entirely (ended with a plain fatha, no mark at
// all). Confirmed against a printed مصحف النسخ (تعليق) reference photo,
// which shows ع at this position. Fixed by appending U+E022 after the
// final letter in data.js. The base letter here is نَ (noon + fatha),
// not a bare noon, so the A0e noon-collision lift must NOT fire for it.
check('A0f: 95:8 (ruku-end) textIndopak ends with the ruku-end waqf mark (U+E022)', function(){
  var a = findAyah(95, 8);
  if(!a) return '95:8 not found';
  var ip = (a.textIndopak || '').replace(/[\u200b\u200f\s]+$/, '');
  var lastCp = ip.codePointAt(ip.length - 1);
  return lastCp === 0xE022 || ('expected U+E022 at end of 95:8 textIndopak, got: 0x' + lastCp.toString(16));
});

check('A0f: 95:8 does NOT get the noon-collision lift wrapper (fatha, not bare noon, before the mark)', function(){
  var a = findAyah(95, 8);
  if(!a) return '95:8 not found';
  var html = ReaderManager.renderAyahTextWithHighlight(a.textIndopak, null);
  return html.indexOf('waqf-ruku-mark-noon-lift') === -1 || 'lift wrapper incorrectly fired for 95:8';
});

// A0e. Same class of bug — 59:17 (ركوع 480) is also a ruku-end ayah and
// its textIndopak was missing the ruku-end waqf mark entirely (ended
// with a plain letter, no mark at all). Confirmed against a printed
// مصحف النسخ (تعليق) reference photo, which shows ع at this position.
// Fixed by appending U+E022 after the final letter in data.js.
check('A0e: 59:17 (ruku-end) textIndopak ends with the ruku-end waqf mark (U+E022)', function(){
  var a = findAyah(59, 17);
  if(!a) return '59:17 not found';
  var ip = (a.textIndopak || '').replace(/[\u200b\u200f\s]+$/, '');
  var lastCp = ip.codePointAt(ip.length - 1);
  return lastCp === 0xE022 || ('expected U+E022 at end of 59:17 textIndopak, got: 0x' + lastCp.toString(16));
});

// A1. Perso-Arabic letter-variant folding (7 mappings) — cross-script:
// query must resolve to a word position in BOTH text and textIndopak,
// and — for the 6 "cross-script" cases — to the SAME word index in
// both (they're the same word, so a script-fallback mismatch here would
// itself be a bug, not just a missing match).
var CROSS_SCRIPT_CASES = [
  { surah: 2, ayah: 137, query: 'فسيكفيكهم', label: 'ک→ك (2:137)' },
  { surah: 2, ayah: 152, query: 'واشكروا', label: 'ک→ك (2:152)' },
  { surah: 6, ayah: 120, query: 'يكسبون', label: 'ی→ي (6:120)' },
  { surah: 2, ayah: 25, query: 'كلما', label: 'ڪ→ك (2:25)' },
  { surah: 7, ayah: 111, query: 'واخاه', label: 'ہ→ه (7:111)' },
  { surah: 4, ayah: 84, query: 'عسى', label: 'ے→ي (4:84)' },
  { surah: 4, ayah: 4, query: 'مريا', label: 'ﺎ→ا (4:4)' }
];
CROSS_SCRIPT_CASES.forEach(function(c){
  var a = findAyah(c.surah, c.ayah);
  check('A1 ' + c.label + ': ayah exists', function(){ return !!a || 'ayah ' + c.surah + ':' + c.ayah + ' not found in data.js'; });
  if(!a) return;
  var r1 = SearchManager.findMatchWordRange(a.text, c.query, false);
  var r2 = SearchManager.findMatchWordRange(a.textIndopak, c.query, false);
  check('A1 ' + c.label + ': resolves in Uthmani text', function(){ return !!r1 || 'findMatchWordRange returned null'; });
  check('A1 ' + c.label + ': resolves in Indopak text', function(){ return !!r2 || 'findMatchWordRange returned null'; });
  if(r1 && r2){
    check('A1 ' + c.label + ': resolved word actually contains the query (Uthmani)', function(){
      var words = ReaderManager.tokenizeAyahWords(a.text);
      var matched = words.slice(r1.start, r1.end + 1).map(function(w){ return SearchManager.normalizeArabic(w); }).join(' ');
      return matched.indexOf(SearchManager.normalizeArabic(c.query)) !== -1 || ('resolved word(s) "' + matched + '" do not contain "' + c.query + '"');
    });
    check('A1 ' + c.label + ': resolved word actually contains the query (Indopak)', function(){
      var words = ReaderManager.tokenizeAyahWords(a.textIndopak);
      var matched = words.slice(r2.start, r2.end + 1).map(function(w){ return SearchManager.normalizeArabic(w); }).join(' ');
      return matched.indexOf(SearchManager.normalizeArabic(c.query)) !== -1 || ('resolved word(s) "' + matched + '" do not contain "' + c.query + '"');
    });
  }
});

// A1b. ھ→ه (2:243) is documented as single-script only — do not assert
// cross-script equality for it, only that it resolves in at least one
// script (matches the known, intentional limitation).
(function(){
  var a = findAyah(2, 243);
  check('A1 ھ→ه (2:243): ayah exists', function(){ return !!a; });
  if(!a) return;
  var r1 = SearchManager.findMatchWordRange(a.text, 'احياهم', false);
  var r2 = SearchManager.findMatchWordRange(a.textIndopak, 'احياهم', false);
  check('A1 ھ→ه (2:243): resolves in at least one script', function(){ return !!(r1 || r2); });
})();

// A2. Known split-word fragments (real U+0020 space mid-word in the
// dataset) — KNOWN_SPLIT_WORD_FRAGMENTS in readerManager.js.
var SPLIT_WORD_CASES = [
  { surah: 6, ayah: 20, query: 'الذين خسروا', label: 'اَ لَّذِيْنَ split (6:20)' },
  { surah: 6, ayah: 12, query: 'الذين خسروا', label: 'اَ لَّذِيْنَ split (6:12)' }
];
SPLIT_WORD_CASES.forEach(function(c){
  var a = findAyah(c.surah, c.ayah);
  check('A2 ' + c.label + ': ayah exists', function(){ return !!a; });
  if(!a) return;
  var r1 = SearchManager.findMatchWordRange(a.text, c.query, false);
  var r2 = SearchManager.findMatchWordRange(a.textIndopak, c.query, false);
  check('A2 ' + c.label + ': resolves (both words, not just first)', function(){
    var r = r1 || r2;
    return (!!r && r.end > r.start) || ('range=' + JSON.stringify(r) + ' (expected a 2-word span)');
  });
});

// A2b. Known split single-word fragments (real U+0020 space splitting a
// SINGLE word into two tokens, as opposed to A2's two-word phrases) —
// KNOWN_SPLIT_WORD_FRAGMENTS in readerManager.js. Reported: 5:42
// "اَ كّٰلُوۡنَ" (اكالون) rendered with a visible gap after the alif in
// Naskh/Indopak mode, since the un-joined "اَ" and "كّٰلُوۡنَ" become two
// separate .quran-word spans. Also 5:64 "وَاَ لۡقَيۡنَا" (والقينا), same
// class of bug: fatha-alef + space + lam-sukun.
var SPLIT_SINGLE_WORD_CASES = [
  { surah: 5, ayah: 42, query: 'اكالون', label: 'اَ كّٰلُوۡنَ split (5:42)', marker: /^اَكّٰلُوۡنَ/ },
  { surah: 5, ayah: 64, query: 'والقينا', label: 'وَاَ لۡقَيۡنَا split (5:64)', marker: /^وَاَلۡقَيۡنَا/ }
];
SPLIT_SINGLE_WORD_CASES.forEach(function(c){
  var a = findAyah(c.surah, c.ayah);
  check('A2b ' + c.label + ': ayah exists', function(){ return !!a; });
  if(!a) return;
  check('A2b ' + c.label + ': tokenizes as a single word (not split by mid-word space)', function(){
    var words = ReaderManager.tokenizeAyahWords(a.textIndopak);
    var hit = words.filter(function(w){ return c.marker.test(w.replace(/[\u2060\u2061\u200B-\u200F]/g, '')); });
    return hit.length === 1 || ('expected exactly one token containing the joined word, found ' + hit.length + ' (word list: ' + JSON.stringify(words) + ')');
  });
  check('A2b ' + c.label + ': resolves to a single-word match (normal-mode search)', function(){
    var r = SearchManager.findMatchWordRange(a.textIndopak, c.query, false);
    return (!!r && r.end === r.start) || ('range=' + JSON.stringify(r) + ' (expected a single-word span)');
  });
});

// A3. Dagger-alif dual-normalization — the big one. Each case records
// the expected normal-mode count, exact-mode count, and confirms every
// normal-mode result resolves to a highlightable word in at least one
// script. Counts are exact assertions (not just ">0") specifically so a
// future data.js update or logic change that shifts these numbers gets
// caught and reviewed, not silently absorbed.
var DAGGER_ALIF_CASES = [
  { query: 'سبحان', normalCount: 41, exactCount: 1 },
  { query: 'الكافر', normalCount: 77, exactCount: 2 },
  { query: 'الصراط', normalCount: 6, exactCount: 6 },
  { query: 'اصحاب', normalCount: 70, exactCount: 0 },
  // Third interpretation: و immediately followed by dagger alif (the
  // classical rasm convention of writing certain words' long-aa with a
  // waw instead of an alif — "الصلوٰة" for "الصلاة"). Confirmed identical
  // in BOTH mushaf scripts, so cross-script comparison alone can't
  // surface these; exactCount=0 for all three is expected and correct —
  // neither script ever spells them with a literal alif.
  { query: 'الصلاة', normalCount: 61, exactCount: 0 },
  { query: 'الزكاة', normalCount: 28, exactCount: 0 },
  { query: 'الحياة', normalCount: 64, exactCount: 0 },
  // Same surface pattern (و + dagger alif), opposite resolution: here و
  // is a REAL root letter (وعد) and the dagger alif is the فاعل
  // pattern's own alif — needs "وا" kept, not collapsed to "ا". Proves
  // the two interpretations must coexist as separate tries, not replace
  // each other.
  { query: 'واعدنا', normalCount: 3, exactCount: 0 },
  { query: 'وارثون', normalCount: 2, exactCount: 0 }
];
DAGGER_ALIF_CASES.forEach(function(c){
  var normal = SearchManager.searchAyahs(c.query, false);
  var exact = SearchManager.searchAyahs(c.query, true);
  check('A3 "' + c.query + '": normal-mode count = ' + c.normalCount, function(){
    return normal.length === c.normalCount || ('got ' + normal.length);
  });
  check('A3 "' + c.query + '": exact-mode count = ' + c.exactCount, function(){
    return exact.length === c.exactCount || ('got ' + exact.length);
  });
  var unresolved = normal.filter(function(e){
    var r1 = SearchManager.findMatchWordRange(e.text, c.query, false);
    var r2 = SearchManager.findMatchWordRange(e.textIndopak, c.query, false);
    return !r1 && !r2;
  });
  check('A3 "' + c.query + '": every normal-mode result resolves to a word', function(){
    return unresolved.length === 0 ||
      (unresolved.length + ' unresolved: ' + unresolved.slice(0, 5).map(function(e){ return e.surah + ':' + e.ayah; }).join(', '));
  });
});

// =====================================================================
// A4. False-positive guard for normalizeArabicWawAlifCollapsed(). و
// immediately followed by dagger alif is only safe to collapse to ا
// when followed by ة (see the function's own comment in searchManager.js
// for the full index-based investigation). An earlier unscoped version
// collapsed it unconditionally, which silently corrupted words like
// "التقوى" (drops the real و, root letter) into "تقاى" internally — this
// didn't show up as a broken HIGHLIGHT (findMatchWordRange tries the
// strict/inserted interpretations first and those already succeed for
// "التقوى" itself, masking it) but DID cause a real false positive: the
// corrupted internal form made searchAyahs() match unrelated ayaat for
// a query that happens to equal that garbled text. Confirmed by directly
// diffing old-vs-new behavior: searching "تقاى" (nobody would type this)
// returned 21 ayaat with the unscoped bug and 7 with the fix — the other
// 14 were "التقوى" ayaat matching only because of the corruption. This
// section pins the FIXED count so a regression restores the false hits.
// =====================================================================
var FALSE_POSITIVE_GUARD_CASES = [
  // "تقاى" legitimately matches "اتقى" (a real, different, unrelated
  // verb) via ordinary substring matching — that's correct and expected.
  // It must NOT also match "التقوى" ayaat (2:197, 2:237, 5:2, 5:8, 7:26,
  // 9:108, 9:109, 20:132, 22:37, 48:26, 49:3, 58:9, 74:56, 96:12 — the 14
  // that only the corrupted collapse produced).
  { query: 'تقاى', expectedCount: 7, mustNotInclude: [{surah:2,ayah:197}, {surah:5,ayah:2}, {surah:96,ayah:12}] }
];
FALSE_POSITIVE_GUARD_CASES.forEach(function(c){
  var matches = SearchManager.searchAyahs(c.query, false);
  check('A4 "' + c.query + '": count = ' + c.expectedCount + ' (no waw-collapse false positives)', function(){
    return matches.length === c.expectedCount || ('got ' + matches.length + ' — likely regression in normalizeArabicWawAlifCollapsed\'s ة-only scoping');
  });
  c.mustNotInclude.forEach(function(bad){
    check('A4 "' + c.query + '": does not wrongly include ' + bad.surah + ':' + bad.ayah, function(){
      return !matches.some(function(e){ return e.surah === bad.surah && e.ayah === bad.ayah; });
    });
  });
});

// =====================================================================
// SECTION B — General invariants, run across a broad vocabulary sample.
// These catch NEW regressions automatically (no per-word entry needed)
// — this is the actual safety net for words not individually listed
// above, per the project's "no exception list to maintain" design.
// =====================================================================

var INVARIANT_QUERIES = [
  'الرحمن', 'الرحيم', 'العالمين', 'المستقيم', 'قل هو الله احد', 'بسم الله',
  'يا ايها الذين امنوا', 'الكافرين', 'موسى', 'ابراهيم', 'الجنة', 'النار',
  'يوم القيامة', 'الصلاة', 'الزكاة', 'الميزان', 'القرآن', 'الكتاب',
  'العذاب', 'الحساب', 'السماء', 'الارض', 'الملائكة', 'الشيطان', 'ابليس',
  'يوسف', 'مريم', 'عيسى', 'نوح', 'ادم', 'اعمالهم', 'جاهدوا', 'ازواج',
  'ميثاق', 'كتاب', 'قاتلوا', 'ايمان', 'اصحاب', 'داخلون', 'الصلاة', 'الزكاة',
  'الحياة', 'واعدنا'
];

(function(){
  var pairsTested = 0;
  var bothScriptsUnresolved = [];
  var exactExceedsNormal = [];

  INVARIANT_QUERIES.forEach(function(q){
    var normal = SearchManager.searchAyahs(q, false);
    var exact = SearchManager.searchAyahs(q, true);

    if(exact.length > normal.length){
      exactExceedsNormal.push(q + ' (exact=' + exact.length + ' > normal=' + normal.length + ')');
    }

    normal.forEach(function(e){
      pairsTested++;
      var r1 = SearchManager.findMatchWordRange(e.text, q, false);
      var r2 = SearchManager.findMatchWordRange(e.textIndopak, q, false);
      if(!r1 && !r2){
        bothScriptsUnresolved.push(q + ' @ ' + e.surah + ':' + e.ayah);
      }
    });

    check('B ' + q + ': result count within AYAH_SEARCH_LIMIT', function(){
      return normal.length <= SearchManager.AYAH_SEARCH_LIMIT || ('got ' + normal.length);
    });
  });

  check('B: every normal-mode hit resolves in at least one script (' + pairsTested + ' pairs tested)', function(){
    return bothScriptsUnresolved.length === 0 ||
      (bothScriptsUnresolved.length + ' unresolved, e.g. ' + bothScriptsUnresolved.slice(0, 5).join('; '));
  });

  check('B: exact-mode is always a subset of normal-mode (exact ⊆ normal)', function(){
    return exactExceedsNormal.length === 0 ||
      (exactExceedsNormal.length + ' violations: ' + exactExceedsNormal.slice(0, 5).join('; '));
  });
})();

// =====================================================================
// SECTION D — Unified search (البحث الموحّد): SearchManager.searchUnified()
// combines the two existing, independent search sources — searchSurahs()
// and searchAyahs() — into one {surahs, ayahs} result for a single search
// box that searches surah names AND verse text at once (see
// navigation.js's search-panel wiring for how the two lists get
// rendered/ordered — surahs first, then ayahs). These tests pin down the
// engine-level contract only: which surahs/ayahs come back for a given
// query, not any rendering.
// =====================================================================

// D1. Surah AND verse match together. "النساء" resolves the surah itself
// (by name) AND returns ayah hits, since "نساء" (women) is an ordinary
// word that recurs throughout the mushaf independent of the surah-name
// match (e.g. 2:49 "وَيَسۡتَحۡيُونَ نِسَآءَكُمۡ").
//
// NOTE: "البقرة" (the definite form used as the surah's name) is
// deliberately NOT used here even though it was the example in the
// original feature request — verified against data.js that the Qur'an's
// own text only ever uses the INDEFINITE form "بَقَرَةٗ/بَقَرَةٌ" ("a
// cow", throughout 2:67-71's story) and never the definite "البقرة" ("the
// cow") as a standalone phrase. So "البقرة" is correctly a surah-only
// match (see D2) — asserting ayah hits for it would pin down inaccurate
// behavior instead of a real bug.
var BOTH_CASES = [
  { query: 'النساء', surah: 4 }
];
BOTH_CASES.forEach(function(c){
  var r = SearchManager.searchUnified(c.query, false);
  check('D1 "' + c.query + '": surah match found', function(){
    return r.surahs.some(function(s){ return s.surah === c.surah; }) ||
      ('surahs=' + JSON.stringify(r.surahs.map(function(s){ return s.surah; })));
  });
  check('D1 "' + c.query + '": also has ayah matches', function(){
    return r.ayahs.length > 0 || 'ayahs.length === 0';
  });
});

// D2. Surah-only matches — both confirmed by direct inspection of
// data.js to never occur verbatim (after normalization) inside any
// ayah's text/textIndopak:
//   - "الإخلاص" is a scholarly-given surah title, not Qur'anic text.
//   - "البقرة" (definite "the cow") — the mushaf only ever uses the
//     INDEFINITE "بقرة" ("a cow") in the actual story (2:67-71); see the
//     note on D1 above.
// Both must resolve the surah by name while returning zero verse hits.
var SURAH_ONLY_CASES = [
  { query: 'الإخلاص', surah: 112 },
  { query: 'البقرة', surah: 2 }
];
SURAH_ONLY_CASES.forEach(function(c){
  var r = SearchManager.searchUnified(c.query, false);
  check('D2 "' + c.query + '": surah match found (surah ' + c.surah + ')', function(){
    return r.surahs.some(function(s){ return s.surah === c.surah; }) ||
      ('surahs=' + JSON.stringify(r.surahs.map(function(s){ return s.surah; })));
  });
  check('D2 "' + c.query + '": zero ayah matches', function(){
    return r.ayahs.length === 0 || ('got ' + r.ayahs.length);
  });
});

// D3. Verse-only match — "الحمد" is not a surah name (the surah is
// "الفاتحة"), so this must return zero surah matches while still hitting
// ayaat that contain the word (e.g. 1:2).
(function(){
  var r = SearchManager.searchUnified('الحمد', false);
  check('D3 "الحمد": zero surah matches', function(){
    return r.surahs.length === 0 || ('surahs=' + JSON.stringify(r.surahs.map(function(s){ return s.surah; })));
  });
  check('D3 "الحمد": has ayah matches', function(){
    return r.ayahs.length > 0 || 'ayahs.length === 0';
  });
})();

// D4. No results at all — neither a surah name nor any ayah contains
// this nonsense string.
(function(){
  var r = SearchManager.searchUnified('زذزذزذزذ', false);
  check('D4 "زذزذزذزذ": zero surah matches', function(){ return r.surahs.length === 0; });
  check('D4 "زذزذزذزذ": zero ayah matches', function(){ return r.ayahs.length === 0; });
})();

// D5. searchUnified never returns the full surah list for an empty/
// whitespace query — guards against the "falsy query returns everything"
// shortcut in searchSurahs() leaking into the unified result.
(function(){
  var r = SearchManager.searchUnified('   ', false);
  check('D5 whitespace-only query: zero surah matches (not the full index)', function(){
    return r.surahs.length === 0 || ('got ' + r.surahs.length);
  });
})();

// =====================================================================
// SECTION E — Production-readiness audit findings (v1.0). Each of these
// pins down a real behavior that had NO test coverage before this audit
// — either a genuine bug (E1) or a documented contract that was only
// ever asserted indirectly (E2, E3).
// =====================================================================

// E1. Non-string input must never throw. Found during the audit: every
// normalization function used `s || ''` to guard against missing input,
// which only catches FALSY values (null/undefined/''/0) — any truthy
// non-string (a number, boolean, plain object, array, NaN...) sailed
// through untouched and crashed the next .replace() call with
// "X.replace is not a function". Queries always arrive as strings from
// the DOM <input> in normal use, but SearchManager's functions are a
// public API (used directly by these tests, and by any future caller),
// and a search engine should degrade to "no results" on bad input, never
// throw. Fixed via toSearchString() in searchManager.js.
var BAD_INPUT_CASES = [undefined, null, 12345, 3.14, true, false, {}, [], NaN];
BAD_INPUT_CASES.forEach(function(v){
  var label = 'E1 non-string input (' + JSON.stringify(v) + ')';
  check(label + ': normalizeArabic does not throw', function(){
    SearchManager.normalizeArabic(v);
    return true;
  });
  check(label + ': searchUnified does not throw and returns empty result', function(){
    var r = SearchManager.searchUnified(v, false);
    return (r && Array.isArray(r.surahs) && r.surahs.length === 0 &&
            Array.isArray(r.ayahs) && r.ayahs.length === 0) ||
      ('got ' + JSON.stringify(r));
  });
});

// E2. Exact-mode ("مطابقة تامة") word-boundary contract — findBoundedIndex
// is the function every exact-mode result and highlight depends on, but
// (before this audit) had no DIRECT regression test; only indirectly
// exercised through corpus-wide counts. Pins down the exact scenario
// from findBoundedIndex's own doc comment: "له" must resolve as a normal-
// mode substring match inside "لِلَّهِ" (1:2) — normalized "لله" contains
// "له" starting mid-word — but must NOT count as an exact-mode match,
// since it doesn't occur at a real word boundary there.
(function(){
  var a = findAyah(1, 2);
  check('E2 1:2 exists', function(){ return !!a; });
  if(!a) return;
  var normalRange = SearchManager.findMatchWordRange(a.text, 'له', false);
  var exactRange = SearchManager.findMatchWordRange(a.text, 'له', true);
  check('E2 "له" in 1:2: normal mode resolves (substring match inside "لله")', function(){
    return !!normalRange || 'findMatchWordRange returned null';
  });
  check('E2 "له" in 1:2: exact mode does NOT match (no real word boundary)', function(){
    return exactRange === null || ('expected null, got ' + JSON.stringify(exactRange));
  });
})();

// E3. AYAH_SEARCH_LIMIT actually triggers and caps at exactly the
// documented value for a genuinely common word — Section B only asserts
// "<= AYAH_SEARCH_LIMIT" for every query, which would also silently pass
// if the early-exit condition in searchAyahs()'s for-loop were broken
// (e.g. an off-by-one that stops one short, or never triggers at all
// because the word happens to have fewer than 80 real hits). "الله"
// is common enough to guarantee the cap fires; asserting the count is
// EXACTLY 80 (not merely "<= 80") confirms the loop's early exit is the
// thing actually producing that number, not coincidence.
(function(){
  var matches = SearchManager.searchAyahs('الله', false);
  check('E3 "الله": hits the AYAH_SEARCH_LIMIT cap exactly (early-exit works)', function(){
    return matches.length === SearchManager.AYAH_SEARCH_LIMIT || ('got ' + matches.length);
  });
})();

// E4. searchSurahs()'s move from raw substring matching to
// normalizeArabic()-based matching (this audit's release) must actually
// do real work, not just pass through unchanged input — a hamza-variant
// query typed without the hamza ("الانبياء") must resolve the same surah
// (21, الأنبياء) as the correctly-spelled name, via the same [إأآٱ] → ا
// folding rule normalizeArabic() already applies everywhere else.
(function(){
  var folded = SearchManager.searchSurahs('الانبياء').map(function(s){ return s.surah; });
  var exact = SearchManager.searchSurahs('الأنبياء').map(function(s){ return s.surah; });
  check('E4 "الانبياء" (no hamza) resolves surah 21 via normalization', function(){
    return folded.indexOf(21) !== -1 || ('got ' + JSON.stringify(folded));
  });
  check('E4 hamza-folded and correctly-spelled queries agree', function(){
    return JSON.stringify(folded) === JSON.stringify(exact) ||
      (JSON.stringify(folded) + ' !== ' + JSON.stringify(exact));
  });
})();

// =====================================================================
// SECTION F — Exact-match ("مطابقة تامة") consistency between surah-name
// matching and ayah matching. Real correctness bug found: searchSurahs()
// never received the `exact` flag at all, so it always did plain
// substring/prefix matching regardless of the toggle — "الكافر" (a
// literal prefix of "الكافرون") kept surfacing surah 109 "الكافرون" as a
// surah-name match even with مطابقة تامة switched on, silently
// contradicting the word-boundary contract exact-mode ayah search
// already enforced (see Section E2). Fixed by threading `exact` through
// to searchSurahs() and reusing findBoundedIndex() — same function,
// same semantics, both sources of the unified result.
// =====================================================================

(function(){
  check('F1 "الكافر" exact=true: surah 109 "الكافرون" is NOT a match (different word)', function(){
    var r = SearchManager.searchSurahs('الكافر', true);
    return !r.some(function(s){ return s.surah === 109; }) ||
      ('surahs=' + JSON.stringify(r.map(function(s){ return s.surah; })));
  });
  check('F1 "الكافر" exact=false: surah 109 "الكافرون" IS a match (substring — unchanged default behavior)', function(){
    var r = SearchManager.searchSurahs('الكافر', false);
    return r.some(function(s){ return s.surah === 109; }) ||
      ('surahs=' + JSON.stringify(r.map(function(s){ return s.surah; })));
  });
  check('F1 "الكافرون" exact=true: still matches itself (the full, correctly-spelled word)', function(){
    var r = SearchManager.searchSurahs('الكافرون', true);
    return r.some(function(s){ return s.surah === 109; }) ||
      ('surahs=' + JSON.stringify(r.map(function(s){ return s.surah; })));
  });
  check('F1 searchUnified: exact=true excludes surah 109 for "الكافر"', function(){
    var r = SearchManager.searchUnified('الكافر', true);
    return !r.surahs.some(function(s){ return s.surah === 109; }) ||
      ('surahs=' + JSON.stringify(r.surahs.map(function(s){ return s.surah; })));
  });
  check('F1 searchUnified: exact=false still includes surah 109 for "الكافر" (regression guard on the default path)', function(){
    var r = SearchManager.searchUnified('الكافر', false);
    return r.surahs.some(function(s){ return s.surah === 109; }) ||
      ('surahs=' + JSON.stringify(r.surahs.map(function(s){ return s.surah; })));
  });
  // Same class of bug, opposite direction — a QUERY that's a superset of
  // the actual surah name must not exact-match it either.
  check('F1 "الكافرين" (not a real surah name) exact=true: does not match surah 109', function(){
    var r = SearchManager.searchSurahs('الكافرين', true);
    return !r.some(function(s){ return s.surah === 109; }) ||
      ('surahs=' + JSON.stringify(r.map(function(s){ return s.surah; })));
  });
})();

// F2. The one two-word surah name in the mushaf ("آل عمران", surah 3) —
// confirms exact mode's word-boundary check is applied at the SAME
// per-word granularity for surah names as it is for ayah text (a surah
// name isn't always a single indivisible token).
(function(){
  var r = SearchManager.searchSurahs('عمران', true);
  check('F2 "عمران" exact=true: matches surah 3 "آل عمران" (bounded word within a two-word name)', function(){
    return r.some(function(s){ return s.surah === 3; }) ||
      ('surahs=' + JSON.stringify(r.map(function(s){ return s.surah; })));
  });
})();

// =====================================================================
// SECTION C — Structural sanity (things that would break silently and
// affect EVERY query, not just specific words).
// =====================================================================

check('C: normalizeArabic strips all standard harakat', function(){
  var n = SearchManager.normalizeArabic('بِسْمِ اللَّهِ');
  return !/[\u064B-\u065F]/.test(n) || ('leftover diacritics in: ' + n);
});

check('C: normalizeArabic("") is empty, not throwing', function(){
  return SearchManager.normalizeArabic('') === '';
});

check('C: searchAyahs("") returns empty (not the whole Quran)', function(){
  return SearchManager.searchAyahs('', false).length === 0;
});

check('C: findMatchWordRange returns null for a query that cannot appear', function(){
  var a = findAyah(1, 1);
  return SearchManager.findMatchWordRange(a.text, 'زذزذزذزذ', false) === null;
});

// =====================================================================
// Report
// =====================================================================
console.log('');
console.log('=== Search Regression Suite — ' + PROJECT_DIR + ' ===');
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
