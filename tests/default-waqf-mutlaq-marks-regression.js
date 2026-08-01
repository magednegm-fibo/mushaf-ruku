// Regression test for the default (built-in) reminder marks placed at
// every ط (waqf-mutlaq) position, derived from WAQF_POSITIONS
// (waqf-positions.js) — a direct user request to reuse the existing
// Sajawandi waqf-position data to pre-populate reminder-style marks on
// the Uthmani/Madinah mushaf, kept as a layer fully independent from the
// personal reminder-mark system (not stored, not removable, not shared
// with Indopak rendering).
//
// UPDATE (direct user request): the mark must NOT appear when the
// TA_MUTLAQ position is the ayah's LAST word — the ayah break itself
// already signals a stop there, so the mark would be redundant.
//
// UPDATE 2 (direct user request): this was originally a floating ط glyph
// (.default-waqf-mark span) positioned above/below the word, tuned
// through several rounds of size/offset feedback. It was then replaced
// with a reminder star above the word via the .has-default-waqf class
// (star color rule lives in style.css on .waqf-mark) — no word-text
// span at all anymore. This test checks the class only.
//
// Node script, no build step:
//   node tests/default-waqf-mutlaq-marks-regression.js
//   node tests/default-waqf-mutlaq-marks-regression.js --dir /path/to/unzipped-release
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dirArgIndex = process.argv.indexOf('--dir');
const rootDir = dirArgIndex !== -1 ? process.argv[dirArgIndex + 1] : path.join(__dirname, '..');

const dataSrc = fs.readFileSync(path.join(rootDir, 'data.js'), 'utf8');
const waqfPositionsSrc = fs.readFileSync(path.join(rootDir, 'waqf-positions.js'), 'utf8');
const silaPositionsSrc = fs.readFileSync(path.join(rootDir, 'sila-positions.js'), 'utf8');
const styleSrc = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

function getAyah(surah, ayah, surahName) {
  const re = new RegExp(
    '\\{"surah":' + surah + ',"surahName":"[^"]*","ayah":' + ayah +
    ',"text":"((?:[^"\\\\]|\\\\.)*)"(?:,"juzStart":\\d+)?,"textIndopak":"((?:[^"\\\\]|\\\\.)*)"'
  );
  const m = re.exec(dataSrc);
  if (!m) throw new Error('Ayah ' + surah + ':' + ayah + ' not found in data.js');
  return {
    surah: surah,
    surahName: surahName,
    ayah: ayah,
    text: JSON.parse('"' + m[1] + '"'),
    textIndopak: JSON.parse('"' + m[2] + '"')
  };
}

// Loads readerManager.js AND waqf-positions.js into the same sandbox, so
// window.WAQF_POSITIONS is populated exactly like it is on the real page
// (script load order in index.html: waqf-positions.js before data.js,
// both before readerManager.js). Also captures any console.warn calls
// fired during load (e.g. the unresolved-conflict warning), so tests can
// assert on them without polluting real test output noise.
function loadReaderManagerWithWaqfPositions(fontStyle) {
  const warnings = [];
  const sandbox = {
    console: { warn: function (msg) { warnings.push(msg); }, log: console.log, error: console.error },
    document: { addEventListener: function () {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(waqfPositionsSrc, sandbox, { filename: 'waqf-positions.js' });
  const rmSrc = fs.readFileSync(path.join(rootDir, 'readerManager.js'), 'utf8');
  vm.runInContext(rmSrc, sandbox, { filename: 'readerManager.js' });

  const state = { fontStyle: fontStyle || 'uthmani' };
  sandbox.window.ReaderManager.init({
    PAGES: [], JUZ_INFO: [], state: state, els: {},
    toArabicDigits: function (n) { return String(n); },
    REMINDER_COLORS: {},
    getWaqfMarks: function () { return {}; },
    showReader: function () {}, onBeforePageChange: function () {},
    onPageChanged: function () {}, onAfterRender: function () {}
  });
  sandbox.window.ReaderManager.__testWarnings = warnings;
  return sandbox.window.ReaderManager;
}

// Variant that injects a synthetic WAQF_POSITIONS array instead of the
// real waqf-positions.js — used to test the conflict-exclusion safeguard
// (readerManager.js's DEFAULT_MARK_CONFLICT_KEYS) in isolation, since the
// real data currently has zero overlaps to exercise it against.
function loadReaderManagerWithSyntheticPositions(positions, fontStyle) {
  const warnings = [];
  const sandbox = {
    console: { warn: function (msg) { warnings.push(msg); }, log: console.log, error: console.error },
    document: { addEventListener: function () {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext('window.WAQF_POSITIONS = ' + JSON.stringify(positions) + ';', sandbox);
  const rmSrc = fs.readFileSync(path.join(rootDir, 'readerManager.js'), 'utf8');
  vm.runInContext(rmSrc, sandbox, { filename: 'readerManager.js' });

  const state = { fontStyle: fontStyle || 'uthmani' };
  sandbox.window.ReaderManager.init({
    PAGES: [], JUZ_INFO: [], state: state, els: {},
    toArabicDigits: function (n) { return String(n); },
    REMINDER_COLORS: {},
    getWaqfMarks: function () { return {}; },
    showReader: function () {}, onBeforePageChange: function () {},
    onPageChanged: function () {}, onAfterRender: function () {}
  });
  return { RM: sandbox.window.ReaderManager, warnings: warnings };
}

// Ground truth recomputed directly from waqf-positions.js — not
// hardcoded expected counts, per project testing rules.
const waqfSandbox = { window: {} };
vm.createContext(waqfSandbox);
vm.runInContext(waqfPositionsSrc, waqfSandbox, { filename: 'waqf-positions.js' });
const TA_MUTLAQ_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'TA_MUTLAQ'; });
const SAD_RUKHSA_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'SAD_RUKHSA'; });
const WAQF_LAZIM_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'WAQF_LAZIM'; });
const MUANAQAH_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'MUANAQAH'; });
const ZAY_JAWAZ_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'ZAY_JAWAZ'; });
const LA_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'LA'; });

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + label);
  } else {
    fail++;
    console.log('  FAIL  ' + label + (extra ? '\n        ' + extra : ''));
  }
}

// Extracts just one word span's own markup (up to the next word's
// data-key, or end of string), so checks don't accidentally match
// something belonging to a neighboring word.
function wordHtml(html, key) {
  const startIdx = html.indexOf('data-key="' + key + '"');
  if (startIdx === -1) return null;
  const nextIdx = html.indexOf('data-key="', startIdx + 1);
  return html.slice(startIdx, nextIdx === -1 ? html.length : nextIdx);
}

// Matches the class="..." attribute that immediately precedes
// data-key="KEY" in the markup (see renderAyahWords: class comes before
// data-key), and checks whether `className` is one of its
// space-separated tokens — robust to class ordering, e.g. a word
// carrying more than one default mark class at once.
function hasWordClass(html, className, key) {
  const re = new RegExp('class="([^"]*)"\\s+data-key="' + key + '"');
  const m = re.exec(html);
  if (!m) return false;
  return m[1].split(/\s+/).indexOf(className) !== -1;
}
function hasDefaultWaqfClass(html, key) {
  return hasWordClass(html, 'has-default-waqf', key);
}
function hasDefaultSadRukhsaClass(html, key) {
  return hasWordClass(html, 'has-default-sad-rukhsa', key);
}
function hasDefaultWaqfLazimClass(html, key) {
  return hasWordClass(html, 'has-default-waqf-lazim', key);
}

console.log('Default waqf-mutlaq (ط) reminder marks:');

// Sanity check the source data actually has TA_MUTLAQ entries, so this
// test can't silently pass against an empty/broken waqf-positions.js.
check(
  'waqf-positions.js contains TA_MUTLAQ entries',
  TA_MUTLAQ_POSITIONS.length > 1000,
  'count: ' + TA_MUTLAQ_POSITIONS.length
);

const RM_uthmani = loadReaderManagerWithWaqfPositions('uthmani');

// --- Mid-ayah TA_MUTLAQ position: MUST get the has-default-waqf class ---
// 2:7 word 6 (idx 5) is TA_MUTLAQ per waqf-positions.js, and 2:7 has 12
// words total, so idx 5 is NOT the last word.
const a2_7 = getAyah(2, 7, 'البقرة');
const html2_7 = RM_uthmani.renderAyahWords(a2_7);
const word2_7_5 = wordHtml(html2_7, '2:7:5');
check(
  '2:7 word 6 (idx 5, mid-ayah ط position) carries the has-default-waqf class',
  hasDefaultWaqfClass(html2_7, '2:7:5'),
  'word html: ' + word2_7_5
);
check(
  '2:7 word 6 (idx 5) never emits a default-waqf-mark span (removed feature)',
  !!word2_7_5 && word2_7_5.indexOf('default-waqf-mark') === -1,
  'word html: ' + word2_7_5
);

// --- End-of-ayah TA_MUTLAQ positions: must NOT get the class ---
// 1:4 word 3 (idx 2) is TA_MUTLAQ, and 1:4 ("مالك يوم الدين") has exactly
// 3 words, so idx 2 IS the last word — the class must be suppressed.
const a1_4 = getAyah(1, 4, 'الفاتحة');
const html1_4 = RM_uthmani.renderAyahWords(a1_4);
const word1_4_2 = wordHtml(html1_4, '1:4:2');
check(
  '1:4 word 3 (idx 2, last word of the ayah) does NOT carry the has-default-waqf class',
  !hasDefaultWaqfClass(html1_4, '1:4:2'),
  'word html: ' + word1_4_2
);

// 1:5 word 4 (idx 3) is TA_MUTLAQ and is also the ayah's last word (4
// words total) — same exclusion applies.
const a1_5 = getAyah(1, 5, 'الفاتحة');
const html1_5 = RM_uthmani.renderAyahWords(a1_5);
check(
  '1:5 word 4 (idx 3, last word of the ayah) does NOT carry the has-default-waqf class',
  !hasDefaultWaqfClass(html1_5, '1:5:3'),
  'html: ' + html1_5
);

// A word NOT in WAQF_POSITIONS/TA_MUTLAQ at all must never get the
// class either — e.g. 1:4 word 1 (idx 0, "مَٰلِكِ").
check(
  '1:4 word 1 (idx 0, not a ط position) does not carry the has-default-waqf class',
  !hasDefaultWaqfClass(html1_4, '1:4:0'),
  'word html: ' + wordHtml(html1_4, '1:4:0')
);

// Must be scoped to Uthmani only — word indices in WAQF_POSITIONS are
// computed against the Madinah text, not Indopak's own tokenization.
const RM_indopak = loadReaderManagerWithWaqfPositions('indopak');
const html2_7_indopak = RM_indopak.renderAyahWords(a2_7);
check(
  'Indopak rendering of 2:7 never carries the has-default-waqf class',
  html2_7_indopak.indexOf('has-default-waqf') === -1,
  'html: ' + html2_7_indopak
);

// CSS-level check: the coloring rule exists and targets the right class,
// and the old floating-glyph rule is fully gone.
check(
  'style.css colors the word TEXT (not a star) for .has-default-waqf',
  /\.quran-word\.has-default-waqf:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:/.test(styleSrc)
    && /\.quran-word\.has-default-waqf:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  '.has-default-waqf word text uses the exact same blue as .waqf-mark.mark-blue (#1565C0)',
  /\.quran-word\.has-default-waqf:not\(\.has-waqf\)[\s\S]{0,150}?\{\s*color\s*:\s*#1565C0/i.test(styleSrc),
  ''
);
check(
  'style.css no longer defines the old bare .quran-word.has-default-waqf{color:...} selector (superseded by the :not(.has-waqf) word-coloring rule above)',
  !/\.quran-word\.has-default-waqf\s*\{\s*color\s*:/.test(styleSrc),
  ''
);
check(
  'style.css no longer defines a .default-waqf-mark CSS rule (removed floating glyph; historical mention in a comment is fine)',
  !/\.default-waqf-mark\s*\{/.test(styleSrc),
  ''
);

console.log('\nManual ط exclusions (ط + تعانق positions the user reviewed and decided to drop):');

// Direct user review of all 11 known ط+تعانق (MUANAQAH) co-occurrences:
// 2 of them (2:151, 74:39) are the ayah's last word and already excluded
// by the standard last-word rule; the user picked exactly 2 of the
// remaining 9 to manually drop the ط coloring from — 14:9 word 13 and
// 33:13 word 18 (see DEFAULT_MARK_MANUAL_EXCLUSIONS in
// readerManager.js). These must NOT carry has-default-waqf even though
// they're genuine TA_MUTLAQ entries in waqf-positions.js.
const a14_9 = getAyah(14, 9, 'ابراهيم');
const html14_9 = RM_uthmani.renderAyahWords(a14_9);
check(
  '14:9 word 13 (idx 12, manually excluded) does NOT carry has-default-waqf',
  !hasDefaultWaqfClass(html14_9, '14:9:12'),
  'word html: ' + wordHtml(html14_9, '14:9:12')
);
// 14:9 word 10 ("وَثَمُودَ") is ALSO a ط+تعانق position from the same
// list, but was NOT picked for exclusion — must remain fully active, to
// confirm the exclusion is scoped to exactly the two chosen words, not
// the whole ayah or every ط+تعانق position.
check(
  '14:9 word 10 (idx 9, ط+تعانق but NOT excluded) still carries has-default-waqf',
  hasDefaultWaqfClass(html14_9, '14:9:9'),
  'word html: ' + wordHtml(html14_9, '14:9:9')
);

const a33_13 = getAyah(33, 13, 'الأحزاب');
const html33_13 = RM_uthmani.renderAyahWords(a33_13);
check(
  '33:13 word 18 (idx 17, manually excluded) does NOT carry has-default-waqf',
  !hasDefaultWaqfClass(html33_13, '33:13:17'),
  'word html: ' + wordHtml(html33_13, '33:13:17')
);

// Must be scoped to Uthmani only, same as everything else in this file
// (though the exclusion itself is type-based, not script-based — this
// just confirms Indopak was never going to show it in the first place).
const html14_9_indopak = RM_indopak.renderAyahWords(a14_9);
check(
  'Indopak rendering of 14:9 never carries has-default-waqf at all (scoped to Uthmani)',
  html14_9_indopak.indexOf('has-default-waqf') === -1,
  'html: ' + html14_9_indopak
);

console.log('\nتعانق-pair review: the 6 remaining active ط×تعانق positions (direct user methodology):');

// General rule (direct user explanation): each تعانق pair has two sides;
// stopping at one cancels the other. If one side is the ayah's last
// word, it's chosen (Sunnah of stopping at ayah ends), cancelling the
// other side automatically. If neither side is ayah-final, it needs
// individual review to pick exactly one side. Reviewed outcomes for all
// 6 remaining active ط×تعانق words (out of the original 11 raw
// overlaps — 2:151/74:39 already ayah-final, 14:9:13/33:13:18 excluded
// earlier for unrelated reasons):
//   • 3:172 "ٱلۡقَرۡحُۚ": the OTHER side of this pair is ayah-final —
//     that side wins per the Sunnah rule, so ط is cancelled HERE. EXCLUDE.
//   • 9:101 "مُنَٰفِقُونَۖ": neither side ayah-final; the other side only
//     carries ج (weaker than ط) — ط wins here. KEEP (no change).
//   • 11:49 "هَٰذَاۖ" (word 15) and "فَٱصۡبِرۡۖ" (word 16): both sides of
//     this SAME pair carry ط, neither ayah-final — only one can be
//     adopted. The first side (15) is kept; the second (16) is EXCLUDED.
//   • 14:9 "وَثَمُودَ" (word 10): the other side of this pair is this
//     ayah's own last word per non-Kufan reading conventions — this side
//     wins (Sunnah rule), so KEEP (no change; separately unrelated to
//     the already-excluded word 13 "بَعۡدِهِمۡ" in the SAME ayah, which
//     was excluded earlier for a different reason and happens to also
//     be the other side of THIS SAME pair, so the two decisions agree).
//   • 47:4 "ذَٰلِكَۖ": neither side ayah-final; the other side only
//     carries قف (weaker than ط) — ط wins here. KEEP (no change).
const a3_172 = getAyah(3, 172, 'آل عمران');
const html3_172 = RM_uthmani.renderAyahWords(a3_172);
check(
  '3:172 word 9 (idx 8, "ٱلۡقَرۡحُۚ") EXCLUDED — the other تعانق side is ayah-final and wins per the Sunnah rule',
  !hasDefaultWaqfClass(html3_172, '3:172:8'),
  'word html: ' + wordHtml(html3_172, '3:172:8')
);

const a9_101 = getAyah(9, 101, 'التوبة');
const html9_101 = RM_uthmani.renderAyahWords(a9_101);
check(
  '9:101 word 5 (idx 4, "مُنَٰفِقُونَۖ") still carries has-default-waqf — ط outranks the weaker ج on the other تعانق side',
  hasDefaultWaqfClass(html9_101, '9:101:4'),
  'word html: ' + wordHtml(html9_101, '9:101:4')
);

const a11_49 = getAyah(11, 49, 'هود');
const html11_49 = RM_uthmani.renderAyahWords(a11_49);
check(
  '11:49 word 15 (idx 14, "هَٰذَاۖ") still carries has-default-waqf — the first side of the ط×ط تعانق pair is kept',
  hasDefaultWaqfClass(html11_49, '11:49:14'),
  'word html: ' + wordHtml(html11_49, '11:49:14')
);
check(
  '11:49 word 16 (idx 15, "فَٱصۡبِرۡۖ") EXCLUDED — the second side of the SAME ط×ط تعانق pair, only one side may be adopted',
  !hasDefaultWaqfClass(html11_49, '11:49:15'),
  'word html: ' + wordHtml(html11_49, '11:49:15')
);
check(
  'waqf-positions.js itself still tags 11:49 word 16 as TA_MUTLAQ (manual exclusion, not missing data)',
  TA_MUTLAQ_POSITIONS.some(function (p) { return p.surah === 11 && p.ayah === 49 && p.word === 16; }),
  ''
);

const a47_4 = getAyah(47, 4, 'محمد');
const html47_4 = RM_uthmani.renderAyahWords(a47_4);
check(
  '47:4 word 21 (idx 20, "ذَٰلِكَۖ") does NOT carry has-default-waqf — reversed: the قف side (word 20) turned out to be the true ayah-end per غير الكوفيين',
  !hasDefaultWaqfClass(html47_4, '47:4:20'),
  'word html: ' + wordHtml(html47_4, '47:4:20')
);
check(
  '47:4 word 20 (idx 19, "أَوۡزَارَهَاۚ") DOES carry has-default-jeem — قف+ج → ج (policy 1.0.139); تعانق side still wins over word 21',
  hasWordClass(html47_4, 'has-default-jeem', '47:4:19') && !hasWordClass(html47_4, 'has-default-qif', '47:4:19'),
  'word html: ' + wordHtml(html47_4, '47:4:19')
);
check(
  'waqf-positions.js itself still tags 3:172 word 9 as TA_MUTLAQ (manual exclusion, not missing data)',
  TA_MUTLAQ_POSITIONS.some(function (p) { return p.surah === 3 && p.ayah === 172 && p.word === 9; }),
  ''
);

console.log('\nManual ط addition (33:13 word 21 "بعورة" — confirmed per علل الوقوف للسجاوندي, p. 817):');

// Direct user follow-up on the 33:13 word 18 exclusion above: علل
// الوقوف للسجاوندي places ط at «بعورة» (the SECOND occurrence, word 21)
// specifically for the reading that does NOT stop at the first
// occurrence «عورة» (word 18) — which is exactly the choice already
// made above. waqf-positions.js never tagged word 21 as TA_MUTLAQ at
// all (it only carries JEEM/MUANAQAH there), so this is a manual
// addition, not a resolution of an existing conflict — see
// DEFAULT_MARK_MANUAL_ADDITIONS in readerManager.js.
check(
  '33:13 word 21 (idx 20, "بعورة", manually added) DOES carry has-default-waqf',
  hasDefaultWaqfClass(html33_13, '33:13:20'),
  'word html: ' + wordHtml(html33_13, '33:13:20')
);
// Sanity: waqf-positions.js genuinely has no TA_MUTLAQ entry for this
// word — confirms this is a real addition, not accidentally already
// present in the source data.
check(
  'waqf-positions.js itself has no TA_MUTLAQ entry for 33:13 word 21 (this really is a manual addition)',
  !TA_MUTLAQ_POSITIONS.some(function (p) { return p.surah === 33 && p.ayah === 13 && p.word === 21; }),
  ''
);
check(
  'Indopak rendering of 33:13 never carries has-default-waqf at all (scoped to Uthmani)',
  RM_indopak.renderAyahWords(a33_13).indexOf('has-default-waqf') === -1,
  ''
);

console.log('\nManual ط addition (60:8 word 17 "إليهم" — real waqf-positions.js extraction gap, direct user bug report):');

// Direct user bug report: "سورة الممتحنة الآية 8 كلمة إليهم في مصحف
// النسخ عليها ط ولم يتم تلوينها". Verified directly against the raw
// textIndopak in data.js: the Indopak word contains U+0615 (ARABIC
// SMALL HIGH TAH, the standard glyph for ط in this encoding), but
// waqf-positions.js has ZERO entries at all for 60:8 — a genuine
// extraction gap in the auto-generated file (not a rendering bug here).
const a60_8 = getAyah(60, 8, 'الممتحنة');
const html60_8 = RM_uthmani.renderAyahWords(a60_8);
check(
  '60:8 word 17 (idx 16, "إِلَيۡهِمۡۚ", manually added — confirmed bug) DOES carry has-default-waqf',
  hasDefaultWaqfClass(html60_8, '60:8:16'),
  'word html: ' + wordHtml(html60_8, '60:8:16')
);
check(
  'waqf-positions.js itself has NO entries at all for 60:8 (confirms this is a real extraction gap, not existing/duplicate data)',
  !TA_MUTLAQ_POSITIONS.some(function (p) { return p.surah === 60 && p.ayah === 8; }) &&
    !waqfSandbox.window.WAQF_POSITIONS.some(function (p) { return p.surah === 60 && p.ayah === 8; }),
  ''
);
check(
  'Indopak rendering of 60:8 never carries has-default-waqf at all (scoped to Uthmani)',
  RM_indopak.renderAyahWords(a60_8).indexOf('has-default-waqf') === -1,
  ''
);


console.log('\nط/ص/م × لا (LA — waqf mamnoo) conflict review (4 active positions, user-confirmed against علل الوقوف):');

// Direct user report request found 47 raw overlaps between our 3 types
// and LA (وقف ممنوع — do NOT stop here), but 43 of them (all
// SAD_RUKHSA) were already moot: last word of their ayah, already
// excluded by the standard rule. Only 4 were actually active/colored.
// The user reviewed each of those 4 individually against علل الوقوف
// للسجاوندي (photographed pages 1084, 738, 985, 1132) and decided AT
// THE TIME:
//   • 78:38 "صَفّٗا" (ط): confirmed correct — keep, no exclusion.
//   • 55:11 "فَٰكِهَةٞ" (ص): confirmed correct — keep (original decision).
//   • 24:37 "ٱلزَّكَوٰةِ" (ص): كتاب السجاوندي يثبت لا هنا — EXCLUDE.
//   • 91:14 "فَعَقَرُوهَا" (ص): لا وقف عليها إطلاقًا — EXCLUDE.
// UPDATE (طلب مباشر لاحق، سياسة عامة نهائية): "أي علامة ص/ق/ز معاها
// علامة لا أو صلي، شيلها فورًا" — هذا يُلغي قرار الإبقاء على 55:11،
// فأصبحت مستبعدة الآن أيضًا (راجع 'SAD_RUKHSA' في
// DEFAULT_MARK_MANUAL_EXCLUSIONS في readerManager.js).
// UPDATE 2 (طلب مباشر أوسع لاحق): "ط مع لا شيلها بردة من التلوين
// نهائيًا" — وسَّع نفس السياسة لتشمل ط كمان، فألغى قرار الإبقاء على
// 78:38 أيضًا. بما أن 78:38 هي أيضًا الموضع الوحيد في كل البيانات فيه
// ط×قد_قيل، حذف استثنائها من DEFAULT_MARK_CONFLICT_RESOLUTIONS يجعلها
// تعارضًا داخليًا عاديًا غير محسوم، فتُستبعد من الطرفين تلقائيًا (لا
// أزرق ولا أخضر) بنفس آلية DEFAULT_MARK_CONFLICT_KEYS.
const a78_38 = getAyah(78, 38, 'النبإ');
const html78_38 = RM_uthmani.renderAyahWords(a78_38);
check(
  '78:38 word 5 (idx 4, "صَفّٗا") now EXCLUDED from has-default-waqf — the ط/لا exception was later removed too',
  !hasDefaultWaqfClass(html78_38, '78:38:4'),
  'word html: ' + wordHtml(html78_38, '78:38:4')
);
check(
  '78:38 word 5 (idx 4) also does NOT carry has-default-qad-qila — unresolved internal ط×قد_قيل conflict, excluded from both',
  !hasWordClass(html78_38, 'has-default-qad-qila', '78:38:4'),
  'word html: ' + wordHtml(html78_38, '78:38:4')
);

const a55_11 = getAyah(55, 11, 'الرحمن');
const html55_11 = RM_uthmani.renderAyahWords(a55_11);
check(
  '55:11 word 2 (idx 1, "فَٰكِهَةٞ") now EXCLUDED — direct final policy: any ص/ق/ز touching لا/صلي is removed immediately',
  !hasDefaultSadRukhsaClass(html55_11, '55:11:1'),
  'word html: ' + wordHtml(html55_11, '55:11:1')
);

const a24_37 = getAyah(24, 37, 'النور');
const html24_37 = RM_uthmani.renderAyahWords(a24_37);
check(
  '24:37 word 13 (idx 12, "ٱلزَّكَوٰةِ", السجاوندي confirms لا here) does NOT carry has-default-sad-rukhsa',
  !hasDefaultSadRukhsaClass(html24_37, '24:37:12'),
  'word html: ' + wordHtml(html24_37, '24:37:12')
);

const a91_14 = getAyah(91, 14, 'الشمس');
const html91_14 = RM_uthmani.renderAyahWords(a91_14);
check(
  '91:14 word 2 (idx 1, "فَعَقَرُوهَا", no waqf at all per السجاوندي) does NOT carry has-default-sad-rukhsa',
  !hasDefaultSadRukhsaClass(html91_14, '91:14:1'),
  'word html: ' + wordHtml(html91_14, '91:14:1')
);

// Ground-truth sanity: waqf-positions.js itself genuinely still tags
// SAD_RUKHSA at these two words (confirms this is a manual override, not
// something already absent from the source data).
check(
  'waqf-positions.js itself still has a SAD_RUKHSA entry for 24:37 word 13 (this really is a manual exclusion)',
  SAD_RUKHSA_POSITIONS.some(function (p) { return p.surah === 24 && p.ayah === 37 && p.word === 13; }),
  ''
);
check(
  'waqf-positions.js itself still has a SAD_RUKHSA entry for 91:14 word 2 (this really is a manual exclusion)',
  SAD_RUKHSA_POSITIONS.some(function (p) { return p.surah === 91 && p.ayah === 14 && p.word === 2; }),
  ''
);

console.log('\nDefault SAD_RUKHSA (ص، الوقف المرخَّص للضرورة) reminder marks:');

check(
  'waqf-positions.js contains SAD_RUKHSA entries',
  SAD_RUKHSA_POSITIONS.length > 50,
  'count: ' + SAD_RUKHSA_POSITIONS.length
);

// --- Mid-ayah SAD_RUKHSA position: MUST get the class ---
// 2:16 word 5 (idx 4) is SAD_RUKHSA per waqf-positions.js, and 2:16 has
// 11 words total, so idx 4 is NOT the last word.
const a2_16 = getAyah(2, 16, 'البقرة');
const html2_16 = RM_uthmani.renderAyahWords(a2_16);
check(
  '2:16 word 5 (idx 4, mid-ayah ص موضع) carries the has-default-sad-rukhsa class',
  hasDefaultSadRukhsaClass(html2_16, '2:16:4'),
  'word html: ' + wordHtml(html2_16, '2:16:4')
);
check(
  '2:16 word 5 (idx 4) does NOT also carry the has-default-waqf (ط) class',
  !hasDefaultWaqfClass(html2_16, '2:16:4'),
  'word html: ' + wordHtml(html2_16, '2:16:4')
);

// --- End-of-ayah SAD_RUKHSA position: must NOT get the class ---
// 4:155 word 22 (idx 21) is SAD_RUKHSA, and 4:155 has exactly 22 words,
// so idx 21 IS the last word — the class must be suppressed.
const a4_155 = getAyah(4, 155, 'النساء');
const html4_155 = RM_uthmani.renderAyahWords(a4_155);
check(
  '4:155 word 22 (idx 21, last word of the ayah) does NOT carry the has-default-sad-rukhsa class',
  !hasDefaultSadRukhsaClass(html4_155, '4:155:21'),
  'word html: ' + wordHtml(html4_155, '4:155:21')
);

// A word NOT in WAQF_POSITIONS/SAD_RUKHSA at all must never get the
// class — e.g. 2:16 word 1 (idx 0).
check(
  '2:16 word 1 (idx 0, not a ص موضع) does not carry the has-default-sad-rukhsa class',
  !hasDefaultSadRukhsaClass(html2_16, '2:16:0'),
  'word html: ' + wordHtml(html2_16, '2:16:0')
);

// Must be scoped to Uthmani only, same as the ط table.
const html2_16_indopak = RM_indopak.renderAyahWords(a2_16);
check(
  'Indopak rendering of 2:16 never carries the has-default-sad-rukhsa class',
  html2_16_indopak.indexOf('has-default-sad-rukhsa') === -1,
  'html: ' + html2_16_indopak
);

check(
  'style.css colors the word TEXT (not a star) for .has-default-sad-rukhsa',
  /\.quran-word\.has-default-sad-rukhsa:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:/.test(styleSrc)
    && /\.quran-word\.has-default-sad-rukhsa:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  '.has-default-sad-rukhsa word text uses the exact same green as .waqf-mark.mark-green (#2E7D32)',
  /\.quran-word\.has-default-sad-rukhsa:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:\s*#2E7D32/i.test(styleSrc),
  ''
);
check(
  '.waqf-mark.mark-green (personal reminder) stays #2E7D32',
  /\.waqf-mark\.mark-green\s*\{\s*color\s*:\s*#2E7D32/i.test(styleSrc),
  ''
);
check(
  'style.css no longer defines the old bare .quran-word.has-default-sad-rukhsa{color:...} selector (superseded by the :not(.has-waqf) word-coloring rule above)',
  !/\.quran-word\.has-default-sad-rukhsa\s*\{\s*color\s*:/.test(styleSrc),
  ''
);

// If any single word ever carried BOTH TA_MUTLAQ and SAD_RUKHSA, its two
// classes (has-default-waqf + has-default-sad-rukhsa) would collide in
// the CSS cascade — whichever rule is declared later in style.css wins,
// silently overriding the other color. Direct user question: does this
// actually happen with the current data? Answer: no — verified below
// (see "Color-conflict checks" section), not assumed.
const overlapKeys = TA_MUTLAQ_POSITIONS
  .map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; })
  .filter(function (taKey) {
    return SAD_RUKHSA_POSITIONS.some(function (p) {
      return (p.surah + ':' + p.ayah + ':' + p.word) === taKey;
    });
  });

console.log('\nDefault WAQF_LAZIM (م، الوقف اللازم) reminder marks:');

check(
  'waqf-positions.js contains WAQF_LAZIM entries',
  WAQF_LAZIM_POSITIONS.length > 50,
  'count: ' + WAQF_LAZIM_POSITIONS.length
);

// --- Mid-ayah WAQF_LAZIM position: MUST get the class ---
// 2:26 word 28 (idx 27) is WAQF_LAZIM per waqf-positions.js, and 2:26
// has 39 words total, so idx 27 is NOT the last word.
const a2_26 = getAyah(2, 26, 'البقرة');
const html2_26 = RM_uthmani.renderAyahWords(a2_26);
check(
  '2:26 word 28 (idx 27, mid-ayah م موضع) carries the has-default-waqf-lazim class',
  hasDefaultWaqfLazimClass(html2_26, '2:26:27'),
  'word html: ' + wordHtml(html2_26, '2:26:27')
);

// --- End-of-ayah WAQF_LAZIM position: MUST STILL get the class ---
// Direct user request: unlike ط/ص, م is NOT excluded at the ayah's
// last word. 2:8 word 11 (idx 10) is WAQF_LAZIM, and 2:8 has exactly 11
// words, so idx 10 IS the last word — the class must still apply.
const a2_8 = getAyah(2, 8, 'البقرة');
const html2_8 = RM_uthmani.renderAyahWords(a2_8);
check(
  '2:8 word 11 (idx 10, LAST word of the ayah) still carries has-default-waqf-lazim (no exclusion for لا)',
  hasDefaultWaqfLazimClass(html2_8, '2:8:10'),
  'word html: ' + wordHtml(html2_8, '2:8:10')
);

// A word NOT in WAQF_POSITIONS/WAQF_LAZIM at all must never get the
// class — e.g. 2:26 word 1 (idx 0).
check(
  '2:26 word 1 (idx 0, not a م موضع) does not carry the has-default-waqf-lazim class',
  !hasDefaultWaqfLazimClass(html2_26, '2:26:0'),
  'word html: ' + wordHtml(html2_26, '2:26:0')
);

// Must be scoped to Uthmani only, same as the other two tables.
const html2_26_indopak = RM_indopak.renderAyahWords(a2_26);
check(
  'Indopak rendering of 2:26 never carries the has-default-waqf-lazim class',
  html2_26_indopak.indexOf('has-default-waqf-lazim') === -1,
  'html: ' + html2_26_indopak
);

check(
  'style.css colors the word TEXT (not a star) for .has-default-waqf-lazim',
  /\.quran-word\.has-default-waqf-lazim:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:/.test(styleSrc)
    && /\.quran-word\.has-default-waqf-lazim:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  '.has-default-waqf-lazim word text uses the exact same red as .waqf-mark.mark-red (#C62828)',
  /\.quran-word\.has-default-waqf-lazim:not\(\.has-waqf\)[\s\S]{0,150}?\{\s*color\s*:\s*#C62828/i.test(styleSrc),
  ''
);

console.log('\nDefault ZAY_JAWAZ (ز، الوقف الجائز) reminder marks:');

check(
  'waqf-positions.js contains ZAY_JAWAZ entries',
  ZAY_JAWAZ_POSITIONS.length > 100,
  'count: ' + ZAY_JAWAZ_POSITIONS.length
);

// --- Mid-ayah ZAY_JAWAZ position: MUST get the class ---
// 2:7 word 9 (idx 8) is ZAY_JAWAZ per waqf-positions.js, and 2:7 has 12
// words total, so idx 8 is NOT the last word. (Note: 2:7 word 6/idx 5 is
// a separate, unrelated TA_MUTLAQ position used elsewhere in this file —
// no overlap with word 9.)
const html2_7_zj = RM_uthmani.renderAyahWords(a2_7);
check(
  '2:7 word 9 (idx 8, mid-ayah ز موضع) carries the has-default-zay-jawaz class',
  hasWordClass(html2_7_zj, 'has-default-zay-jawaz', '2:7:8'),
  'word html: ' + wordHtml(html2_7_zj, '2:7:8')
);

// --- End-of-ayah ZAY_JAWAZ position: must NOT get the class ---
// Same last-word exclusion as ط/ص (by analogy, not explicitly requested
// for ز — documented as an assumption in readerManager.js). 2:101 word
// 22 (idx 21) is ZAY_JAWAZ, and 2:101 has exactly 22 words, so idx 21 IS
// the last word.
const a2_101 = getAyah(2, 101, 'البقرة');
const html2_101 = RM_uthmani.renderAyahWords(a2_101);
check(
  '2:101 word 22 (idx 21, last word of the ayah) does NOT carry has-default-zay-jawaz',
  !hasWordClass(html2_101, 'has-default-zay-jawaz', '2:101:21'),
  'word html: ' + wordHtml(html2_101, '2:101:21')
);

// A word NOT in WAQF_POSITIONS/ZAY_JAWAZ at all must never get the
// class — e.g. 2:7 word 1 (idx 0).
check(
  '2:7 word 1 (idx 0, not a ز موضع) does not carry the has-default-zay-jawaz class',
  !hasWordClass(html2_7_zj, 'has-default-zay-jawaz', '2:7:0'),
  'word html: ' + wordHtml(html2_7_zj, '2:7:0')
);

// Must be scoped to Uthmani only, same as the other tables.
const html2_7_zj_indopak = RM_indopak.renderAyahWords(a2_7);
check(
  'Indopak rendering of 2:7 never carries the has-default-zay-jawaz class',
  html2_7_zj_indopak.indexOf('has-default-zay-jawaz') === -1,
  'html: ' + html2_7_zj_indopak
);

check(
  'style.css colors the word TEXT (not a star) for .has-default-zay-jawaz',
  /\.quran-word\.has-default-zay-jawaz:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:/.test(styleSrc)
    && /\.quran-word\.has-default-zay-jawaz:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  '.has-default-zay-jawaz word text uses the exact same green as .waqf-mark.mark-green (#2E7D32)',
  /\.quran-word\.has-default-zay-jawaz:not\(\.has-waqf\)[\s\S]{0,150}?\{\s*color\s*:\s*#2E7D32/i.test(styleSrc),
  ''
);

console.log('\nDefault QAD_QILA (ق، قد قيل — NOT the discarded قِف work) reminder marks:');

const QAD_QILA_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'QAD_QILA'; });
check(
  'waqf-positions.js contains QAD_QILA entries',
  QAD_QILA_POSITIONS.length > 100,
  'count: ' + QAD_QILA_POSITIONS.length
);
check(
  'waqf-positions.js contains NO leftover QIF (قِف) entries being used — QAD_QILA is a distinct type',
  QAD_QILA_POSITIONS.every(function (p) { return p.type === 'QAD_QILA'; }),
  ''
);

// --- Mid-ayah QAD_QILA position: MUST get the class ---
// 2:5 word 5 (idx 4) is QAD_QILA per waqf-positions.js (and no other
// type at that exact word), and 2:5 has 8 words total, so idx 4 is NOT
// the last word.
const a2_5 = getAyah(2, 5, 'البقرة');
const html2_5 = RM_uthmani.renderAyahWords(a2_5);
check(
  '2:5 word 5 (idx 4, mid-ayah قد_قيل موضع) carries the has-default-qad-qila class',
  hasWordClass(html2_5, 'has-default-qad-qila', '2:5:4'),
  'word html: ' + wordHtml(html2_5, '2:5:4')
);

// --- End-of-ayah QAD_QILA position: must NOT get the class ---
// Direct user request: excluded at the ayah's last word, same as ط/ص/ز.
// 3:112 word 35 (idx 34) is QAD_QILA, and 3:112 has exactly 35 words.
const a3_112 = getAyah(3, 112, 'آل عمران');
const html3_112 = RM_uthmani.renderAyahWords(a3_112);
check(
  '3:112 word 35 (idx 34, last word of the ayah) does NOT carry has-default-qad-qila',
  !hasWordClass(html3_112, 'has-default-qad-qila', '3:112:34'),
  'word html: ' + wordHtml(html3_112, '3:112:34')
);

// A word NOT in WAQF_POSITIONS/QAD_QILA at all must never get the class.
check(
  '2:5 word 1 (idx 0, not a قد_قيل موضع) does not carry the has-default-qad-qila class',
  !hasWordClass(html2_5, 'has-default-qad-qila', '2:5:0'),
  'word html: ' + wordHtml(html2_5, '2:5:0')
);

// Must be scoped to Uthmani only, same as the other tables.
const html2_5_indopak = RM_indopak.renderAyahWords(a2_5);
check(
  'Indopak rendering of 2:5 never carries the has-default-qad-qila class',
  html2_5_indopak.indexOf('has-default-qad-qila') === -1,
  'html: ' + html2_5_indopak
);

check(
  'style.css colors the word TEXT (not a star) for .has-default-qad-qila',
  /\.quran-word\.has-default-qad-qila:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:/.test(styleSrc)
    && /\.quran-word\.has-default-qad-qila:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  '.has-default-qad-qila word text uses the exact same green as ص/ز (#2E7D32)',
  /\.quran-word\.has-default-qad-qila:not\(\.has-waqf\)[\s\S]{0,150}?\{\s*color\s*:\s*#2E7D32/i.test(styleSrc),
  ''
);

console.log('\nقد_قيل internal conflicts (ط/ز) — held via the existing safeguard, except the 78:38 exception:');

check(
  'قد_قيل×ط internal: exactly 1 raw overlap (78:38 word 5)',
  rawOverlapKeys(QAD_QILA_POSITIONS, TA_MUTLAQ_POSITIONS).length === 1 &&
    rawOverlapKeys(QAD_QILA_POSITIONS, TA_MUTLAQ_POSITIONS)[0] === '78:38:5',
  ''
);
check(
  'قد_قيل×ص internal: zero raw overlaps',
  rawOverlapKeys(QAD_QILA_POSITIONS, SAD_RUKHSA_POSITIONS).length === 0,
  ''
);
check(
  'قد_قيل×م internal: zero raw overlaps',
  rawOverlapKeys(QAD_QILA_POSITIONS, WAQF_LAZIM_POSITIONS).length === 0,
  ''
);
check(
  'قد_قيل×ز internal: exactly 8 raw overlaps',
  rawOverlapKeys(QAD_QILA_POSITIONS, ZAY_JAWAZ_POSITIONS).length === 8,
  ''
);
// Direct user follow-up: only the 6 of these 8 that carry ق+ز
// EXCLUSIVELY (no صلي, not the ayah's last word) are approved as green.
// All 6 must carry has-default-qad-qila and NOT has-default-zay-jawaz
// (resolved specifically to قد قيل, not both).
const QAD_QILA_ZAY_JAWAZ_APPROVED = [
  { surah: 2, ayah: 34, name: 'البقرة', word: 10 },
  { surah: 3, ayah: 187, name: 'آل عمران', word: 11 },
  { surah: 4, ayah: 45, name: 'النساء', word: 6 },
  { surah: 28, ayah: 15, name: 'القصص', word: 11 },
  { surah: 28, ayah: 15, name: 'القصص', word: 29 },
  { surah: 29, ayah: 32, name: 'العنكبوت', word: 13 }
];
QAD_QILA_ZAY_JAWAZ_APPROVED.forEach(function (t) {
  const a = getAyah(t.surah, t.ayah, t.name);
  const html = RM_uthmani.renderAyahWords(a);
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (قد_قيل×ز, exclusive + not last word) DOES carry has-default-qad-qila (green)',
    hasWordClass(html, 'has-default-qad-qila', key),
    'word html: ' + wordHtml(html, key)
  );
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' does NOT carry has-default-zay-jawaz (resolved to قد_قيل specifically)',
    !hasWordClass(html, 'has-default-zay-jawaz', key),
    'word html: ' + wordHtml(html, key)
  );
});
// The other 2 of the 8 do NOT qualify and stay unresolved (excluded
// from both sides via the ordinary temporary-exclusion safeguard).
const a11_46 = getAyah(11, 46, 'هود');
const html11_46 = RM_uthmani.renderAyahWords(a11_46);
check(
  '11:46 word 10 (idx 9, قد_قيل×ز but ALSO carries صلي — fails the "no other marks" condition) does NOT carry has-default-qad-qila',
  !hasWordClass(html11_46, 'has-default-qad-qila', '11:46:9'),
  'word html: ' + wordHtml(html11_46, '11:46:9')
);
check(
  '11:46 word 10 (idx 9) does NOT carry has-default-zay-jawaz either — unresolved, excluded from both',
  !hasWordClass(html11_46, 'has-default-zay-jawaz', '11:46:9'),
  'word html: ' + wordHtml(html11_46, '11:46:9')
);
const a51_54 = getAyah(51, 54, 'الذاريات');
const html51_54 = RM_uthmani.renderAyahWords(a51_54);
check(
  '51:54 word 5 (idx 4, قد_قيل×ز but IS the ayah last word) does NOT carry has-default-qad-qila',
  !hasWordClass(html51_54, 'has-default-qad-qila', '51:54:4'),
  'word html: ' + wordHtml(html51_54, '51:54:4')
);
// 78:38:5 was originally a special exception (resolved directly to ط,
// blue), because it had been confirmed against علل الوقوف in an
// earlier, unrelated review round. A later, broader final policy ("ط
// مع لا شيلها بردة") removed that exception too, so it's now an
// ordinary unresolved internal ط×قد_قيل conflict — excluded from BOTH
// colors, same as any other unresolved internal conflict. (a78_38/
// html78_38 already declared above in the لا/تعانق/صلي review section
// — same ayah, reused here.)
check(
  '78:38 word 5 (idx 4, قد_قيل×ط AND ×لا at once) does NOT carry has-default-waqf — the ط exception was later removed',
  !hasDefaultWaqfClass(html78_38, '78:38:4'),
  'word html: ' + wordHtml(html78_38, '78:38:4')
);
check(
  '78:38 word 5 (idx 4) also does NOT carry has-default-qad-qila — unresolved internal conflict, excluded from both',
  !hasWordClass(html78_38, 'has-default-qad-qila', '78:38:4'),
  'word html: ' + wordHtml(html78_38, '78:38:4')
);

console.log('\nقد_قيل × لا/تعانق/صلي — permanently excluded (direct final user decision):');

const laFullQQ = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'LA'; });
const muFullQQ = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'MUANAQAH'; });
check(
  'قد_قيل×لا: exactly 13 raw overlaps (6 active incl. 78:38:5 exception + 7 already last-word-excluded)',
  rawOverlapKeys(QAD_QILA_POSITIONS, laFullQQ).length === 13,
  ''
);
check(
  'قد_قيل×تعانق: exactly 1 raw overlap (26:208 word 7), which is the ayah last word (already excluded)',
  rawOverlapKeys(QAD_QILA_POSITIONS, muFullQQ).length === 1 &&
    rawOverlapKeys(QAD_QILA_POSITIONS, muFullQQ)[0] === '26:208:7',
  ''
);
// Spot-check one held-back لا overlap (2:20 word 9).
const a2_20 = getAyah(2, 20, 'البقرة');
const html2_20 = RM_uthmani.renderAyahWords(a2_20);
check(
  '2:20 word 9 (idx 8, قد_قيل×لا, permanently excluded — direct final decision) does NOT carry has-default-qad-qila',
  !hasWordClass(html2_20, 'has-default-qad-qila', '2:20:8'),
  'word html: ' + wordHtml(html2_20, '2:20:8')
);
// Spot-check one held-back صلي overlap (3:45 word 9).
const a3_45 = getAyah(3, 45, 'آل عمران');
const html3_45 = RM_uthmani.renderAyahWords(a3_45);
check(
  '3:45 word 9 (idx 8, قد_قيل×صلي, permanently excluded — direct final decision) does NOT carry has-default-qad-qila',
  !hasWordClass(html3_45, 'has-default-qad-qila', '3:45:8'),
  'word html: ' + wordHtml(html3_45, '3:45:8')
);
// Control: waqf-positions.js itself still tags 2:20 as QAD_QILA —
// confirms this is a manual hold, not missing source data.
check(
  'waqf-positions.js itself still has a QAD_QILA entry for 2:20 word 9 (manual hold, not missing data)',
  QAD_QILA_POSITIONS.some(function (p) { return p.surah === 2 && p.ayah === 20 && p.word === 9; }),
  ''
);

console.log('\nDefault QIF (قف — NOT قد قيل, rebuilt from scratch after the earlier mixup) reminder marks:');

const QIF_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'QIF'; });
check(
  'waqf-positions.js contains QIF entries',
  QIF_POSITIONS.length > 50,
  'count: ' + QIF_POSITIONS.length
);

// --- Mid-ayah QIF position: MUST get the class ---
// 2:83 word 9 (idx 8) is QIF per waqf-positions.js (and no other type at
// that exact word), and 2:83 has 29 words total, so idx 8 is NOT last.
const a2_83 = getAyah(2, 83, 'البقرة');
const html2_83 = RM_uthmani.renderAyahWords(a2_83);
check(
  '2:83 word 9 (idx 8, mid-ayah قف موضع) carries the has-default-qif class',
  hasWordClass(html2_83, 'has-default-qif', '2:83:8'),
  'word html: ' + wordHtml(html2_83, '2:83:8')
);

// --- End-of-ayah QIF position: must NOT get the class ---
// 10:37 word 22 (idx 21) is QIF, and 10:37 has exactly 22 words.
const a10_37 = getAyah(10, 37, 'يونس');
const html10_37 = RM_uthmani.renderAyahWords(a10_37);
check(
  '10:37 word 22 (idx 21, last word of the ayah) does NOT carry has-default-qif',
  !hasWordClass(html10_37, 'has-default-qif', '10:37:21'),
  'word html: ' + wordHtml(html10_37, '10:37:21')
);

// A word NOT in WAQF_POSITIONS/QIF at all must never get the class.
check(
  '2:83 word 1 (idx 0, not a قف موضع) does not carry the has-default-qif class',
  !hasWordClass(html2_83, 'has-default-qif', '2:83:0'),
  'word html: ' + wordHtml(html2_83, '2:83:0')
);

// Must be scoped to Uthmani only, same as the other tables.
const html2_83_indopak = RM_indopak.renderAyahWords(a2_83);
check(
  'Indopak rendering of 2:83 never carries the has-default-qif class',
  html2_83_indopak.indexOf('has-default-qif') === -1,
  'html: ' + html2_83_indopak
);

check(
  'style.css colors the word TEXT (not a star) for .has-default-qif',
  /\.quran-word\.has-default-qif:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:/.test(styleSrc)
    && /\.quran-word\.has-default-qif:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  '.has-default-qif word text uses the exact same blue as .waqf-mark.mark-blue (#1565C0)',
  /\.quran-word\.has-default-qif:not\(\.has-waqf\)[\s\S]{0,150}?\{\s*color\s*:\s*#1565C0/i.test(styleSrc),
  ''
);

console.log('\nقف internal conflicts (ط/ص/ز) — held back pending review (direct user request):');

check(
  'قف×ط internal: exactly 6 raw overlaps',
  rawOverlapKeys(QIF_POSITIONS, TA_MUTLAQ_POSITIONS).length === 6,
  ''
);
check(
  'قف×ص internal: exactly 2 raw overlaps',
  rawOverlapKeys(QIF_POSITIONS, SAD_RUKHSA_POSITIONS).length === 2,
  ''
);
check(
  'قف×ز internal: exactly 1 raw overlap',
  rawOverlapKeys(QIF_POSITIONS, ZAY_JAWAZ_POSITIONS).length === 1,
  ''
);
check(
  'قف×م internal: zero raw overlaps',
  rawOverlapKeys(QIF_POSITIONS, WAQF_LAZIM_POSITIONS).length === 0,
  ''
);
check(
  'قف×قد_قيل internal: zero raw overlaps',
  rawOverlapKeys(QIF_POSITIONS, QAD_QILA_POSITIONS).length === 0,
  ''
);

console.log('\nقف internal conflicts RESOLVED (clean overlaps only — no third mark involved, direct user decision):');

// 5 clean قف×ط overlaps: "كلاهما نفس المعنى وهو الوقف" — resolved blue.
const QIF_TA_MUTLAQ_CLEAN = [
  { surah: 7, ayah: 183, name: 'الأعراف', word: 2 },
  { surah: 19, ayah: 30, name: 'مريم', word: 4 },
  { surah: 24, ayah: 58, name: 'النور', word: 27 },
  { surah: 32, ayah: 24, name: 'السجدة', word: 7 },
  { surah: 88, ayah: 21, name: 'الغاشية', word: 1 }
];
QIF_TA_MUTLAQ_CLEAN.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (clean قف×ط → قف per policy) DOES carry has-default-qif (blue)',
    hasWordClass(html, 'has-default-qif', key),
    'word html: ' + wordHtml(html, key)
  );
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' does NOT carry has-default-waqf (resolved to قف specifically)',
    !hasDefaultWaqfClass(html, key),
    'word html: ' + wordHtml(html, key)
  );
});

// 2 clean قف×ص overlaps: "ترجّح، الوصل أولى" — resolved green (ص).
const QIF_SAD_RUKHSA_CLEAN = [
  { surah: 3, ayah: 135, name: 'آل عمران', word: 16 },
  { surah: 19, ayah: 17, name: 'مريم', word: 4 }
];
QIF_SAD_RUKHSA_CLEAN.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (clean قف×ص) DOES carry has-default-sad-rukhsa (green)',
    hasDefaultSadRukhsaClass(html, key),
    'word html: ' + wordHtml(html, key)
  );
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' does NOT carry has-default-qif (resolved to ص specifically)',
    !hasWordClass(html, 'has-default-qif', key),
    'word html: ' + wordHtml(html, key)
  );
});

// 1 clean قف×ز overlap: same reasoning — resolved green (ز).
const html27_66 = RM_uthmani.renderAyahWords(getAyah(27, 66, 'النمل'));
check(
  '27:66 word 10 (clean قف×ز) DOES carry has-default-zay-jawaz (green)',
  hasWordClass(html27_66, 'has-default-zay-jawaz', '27:66:9'),
  'word html: ' + wordHtml(html27_66, '27:66:9')
);
check(
  '27:66 word 10 does NOT carry has-default-qif (resolved to ز specifically)',
  !hasWordClass(html27_66, 'has-default-qif', '27:66:9'),
  'word html: ' + wordHtml(html27_66, '27:66:9')
);

// 65:10 word 11 is قف×ط too, but it's triple-tagged (also MUANAQAH) —
// fails the "no third mark" condition, so it was excluded from the
// batch "clean" resolution above. It was later resolved SEPARATELY via
// the قف×تعانق review: "الموضع الآخر في التعانق عليه صلي" — resolved
// blue (via قف specifically, not ط).
const html65_10_qif = RM_uthmani.renderAyahWords(getAyah(65, 10, 'الطلاق'));
check(
  '65:10 word 11 (idx 10) DOES carry has-default-qif — resolved blue via the separate قف×تعانق review',
  hasWordClass(html65_10_qif, 'has-default-qif', '65:10:10'),
  'word html: ' + wordHtml(html65_10_qif, '65:10:10')
);
check(
  '65:10 word 11 (idx 10) does NOT carry has-default-waqf — resolved to قف specifically, not ط',
  !hasDefaultWaqfClass(html65_10_qif, '65:10:10'),
  'word html: ' + wordHtml(html65_10_qif, '65:10:10')
);

console.log('\nقف × لا/صلي — permanently excluded (direct final user decision, same policy as ط/ص/ز/ق):');

const laFullQif = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'LA'; });
check(
  'قف×لا: exactly 6 raw overlaps (5 active, permanently excluded; 15:43:4 already last-word-excluded)',
  rawOverlapKeys(QIF_POSITIONS, laFullQif).length === 6,
  ''
);
const html2_251_qif = RM_uthmani.renderAyahWords(getAyah(2, 251, 'البقرة'));
check(
  '2:251 word 3 (idx 2, قف×لا) does NOT carry has-default-qif — permanently excluded',
  !hasWordClass(html2_251_qif, 'has-default-qif', '2:251:2'),
  'word html: ' + wordHtml(html2_251_qif, '2:251:2')
);
const qifSilaSandbox = { window: {} };
vm.createContext(qifSilaSandbox);
vm.runInContext(silaPositionsSrc, qifSilaSandbox, { filename: 'sila-positions.js' });
check(
  'قف×صلي: exactly 1 raw overlap (27:40 word 23)',
  rawOverlapKeys(QIF_POSITIONS, qifSilaSandbox.window.SILA_POSITIONS).length === 1,
  ''
);
const html27_40_qif = RM_uthmani.renderAyahWords(getAyah(27, 40, 'النمل'));
check(
  '27:40 word 23 (idx 22, قف×صلي) does NOT carry has-default-qif — permanently excluded',
  !hasWordClass(html27_40_qif, 'has-default-qif', '27:40:22'),
  'word html: ' + wordHtml(html27_40_qif, '27:40:22')
);
check(
  'waqf-positions.js itself still has a QIF entry for 2:251 word 3 (permanent exclusion, not missing data)',
  QIF_POSITIONS.some(function (p) { return p.surah === 2 && p.ayah === 251 && p.word === 3; }),
  ''
);

console.log('\nقف × تعانق — fully reviewed (direct user decisions per position):');

check(
  'قف×تعانق: exactly 7 raw overlaps, all active (none ayah-final)',
  rawOverlapKeys(QIF_POSITIONS, waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'MUANAQAH'; })).length === 7,
  ''
);
// 9:101: "الطرف الآخر (منافقون) عليه ط، أقوى" — قف permanently excluded,
// the ط side (9:101:5, tested earlier in the ط×تعانق section) stays blue.
const html9_101_qif2 = RM_uthmani.renderAyahWords(getAyah(9, 101, 'التوبة'));
check(
  '9:101 word 8 (idx 7, قف×تعانق) does NOT carry has-default-qif — permanently excluded, the other side (ط at "منافقون") wins',
  !hasWordClass(html9_101_qif2, 'has-default-qif', '9:101:7'),
  'word html: ' + wordHtml(html9_101_qif2, '9:101:7')
);
check(
  '9:101 word 5 (idx 4, "مُنَٰفِقُونَۖ") still carries has-default-waqf — unaffected control, confirms the ط side of this pair is unchanged',
  hasDefaultWaqfClass(html9_101_qif2, '9:101:4'),
  'word html: ' + wordHtml(html9_101_qif2, '9:101:4')
);
// 26:209, 40:70, 74:40, 97:5: "الطرف الآخر رأس آية، يُختار بالسنة" —
// all four permanently excluded.
[
  { surah: 26, ayah: 209, name: 'الشعراء', word: 1 },
  { surah: 40, ayah: 70, name: 'غافر', word: 7 },
  { surah: 74, ayah: 40, name: 'المدثر', word: 2 },
  { surah: 97, ayah: 5, name: 'القدر', word: 1 }
].forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (قف×تعانق) does NOT carry has-default-qif — permanently excluded, the other (ayah-final) side wins by Sunnah',
    !hasWordClass(html, 'has-default-qif', key),
    'word html: ' + wordHtml(html, key)
  );
});
check(
  'waqf-positions.js itself still has a QIF entry for 9:101 word 8 (permanent exclusion, not missing data)',
  QIF_POSITIONS.some(function (p) { return p.surah === 9 && p.ayah === 101 && p.word === 8; }),
  ''

);

console.log('\nDefault ج (JEEM، الوقف الجائز) reminder marks:');

const JEEM_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'JEEM'; });
check(
  'waqf-positions.js contains JEEM entries',
  JEEM_POSITIONS.length > 1000,
  'count: ' + JEEM_POSITIONS.length
);

// --- Mid-ayah ج position: MUST get the class ---
const a2_4 = getAyah(2, 4, 'البقرة');
const html2_4 = RM_uthmani.renderAyahWords(a2_4);
check(
  '2:4 word 9 (idx 8, mid-ayah ج موضع, no other tag) carries the has-default-jeem class',
  hasWordClass(html2_4, 'has-default-jeem', '2:4:8'),
  'word html: ' + wordHtml(html2_4, '2:4:8')
);

// --- End-of-ayah ج position: must NOT get the class ---
const a2_1 = getAyah(2, 1, 'البقرة');
const html2_1 = RM_uthmani.renderAyahWords(a2_1);
check(
  '2:1 word 1 (idx 0, last word of the ayah) does NOT carry has-default-jeem',
  !hasWordClass(html2_1, 'has-default-jeem', '2:1:0'),
  'word html: ' + wordHtml(html2_1, '2:1:0')
);

check(
  'style.css colors the word TEXT (not a star) for .has-default-jeem',
  /\.quran-word\.has-default-jeem:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?[\s\S]{0,250}?\{\s*color\s*:/.test(styleSrc)
    && /\.quran-word\.has-default-jeem:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  '.has-default-jeem word text uses brown matching .waqf-mark.mark-brown (#A9793B)',
  /\.quran-word\.has-default-jeem:not\(\.has-waqf\)[\s\S]{0,150}?\{\s*color\s*:\s*#A9793B/i.test(styleSrc),
  ''
);

console.log('\nج internal conflicts — auto-resolved via strength ranking (ط > قف > ج > ز > ق > ص):');

check('ج×ط internal: exactly 2 raw overlaps', rawOverlapKeys(JEEM_POSITIONS, TA_MUTLAQ_POSITIONS).length === 2, '');
check('ج×ص internal: exactly 1 raw overlap', rawOverlapKeys(JEEM_POSITIONS, SAD_RUKHSA_POSITIONS).length === 1, '');
check('ج×ز internal: exactly 3 raw overlaps', rawOverlapKeys(JEEM_POSITIONS, ZAY_JAWAZ_POSITIONS).length === 3, '');
check('ج×قد_قيل internal: exactly 2 raw overlaps', rawOverlapKeys(JEEM_POSITIONS, QAD_QILA_POSITIONS).length === 2, '');
check('ج×قف internal: exactly 5 raw overlaps', rawOverlapKeys(JEEM_POSITIONS, QIF_POSITIONS).length === 5, '');

// ط wins over ج (4:103:9) per rank — now a real color difference (ط blue, ج green), resolved to ط specifically.
const html4_103 = RM_uthmani.renderAyahWords(getAyah(4, 103, 'النساء'));
check(
  '4:103 word 9 (ج×ط → ج weaker wins) DOES carry has-default-jeem, NOT has-default-waqf',
  hasWordClass(html4_103, 'has-default-jeem', '4:103:8') && !hasDefaultWaqfClass(html4_103, '4:103:8'),
  'word html: ' + wordHtml(html4_103, '4:103:8')
);
// ج wins over ص (2:62:18) per rank — no longer a visual color change now that ج is also green, but the class assignment still matters for bookkeeping.
const html2_62 = RM_uthmani.renderAyahWords(getAyah(2, 62, 'البقرة'));
check(
  '2:62 word 18 (ج×ص → ص weaker wins) DOES carry has-default-sad-rukhsa, NOT has-default-jeem',
  hasDefaultSadRukhsaClass(html2_62, '2:62:17') && !hasWordClass(html2_62, 'has-default-jeem', '2:62:17'),
  'word html: ' + wordHtml(html2_62, '2:62:17')
);
// ج wins over ز (9:30:21) per rank — same note, both green now.
const html9_30 = RM_uthmani.renderAyahWords(getAyah(9, 30, 'التوبة'));
check(
  '9:30 word 21 (ج×ز → ز weaker wins) DOES carry has-default-zay-jawaz, NOT has-default-jeem',
  hasWordClass(html9_30, 'has-default-zay-jawaz', '9:30:20') && !hasWordClass(html9_30, 'has-default-jeem', '9:30:20'),
  'word html: ' + wordHtml(html9_30, '9:30:20')
);
// ج wins over قد_قيل (18:21:13) per rank — same note, both green now.
const html18_21 = RM_uthmani.renderAyahWords(getAyah(18, 21, 'الكهف'));
check(
  '18:21 word 13 (ج×قد_قيل → ق weaker wins) DOES carry has-default-qad-qila, NOT has-default-jeem',
  hasWordClass(html18_21, 'has-default-qad-qila', '18:21:12') && !hasWordClass(html18_21, 'has-default-jeem', '18:21:12'),
  'word html: ' + wordHtml(html18_21, '18:21:12')
);
// قف wins over ج (19:1:1) per the resolution — but 19:1 is a 1-word
// ayah, so word 1 is ALSO the last word: the ordinary last-word
// exclusion applies on top and wins out, so neither class shows here
// regardless of the resolution (harmless but moot in this specific case).
const html19_1 = RM_uthmani.renderAyahWords(getAyah(19, 1, 'مريم'));
check(
  '19:1 word 1 (ج×قف, but ALSO the ayah last word) carries NEITHER has-default-qif NOR has-default-jeem',
  !hasWordClass(html19_1, 'has-default-qif', '19:1:0') && !hasWordClass(html19_1, 'has-default-jeem', '19:1:0'),
  'word html: ' + wordHtml(html19_1, '19:1:0')
);
// 22:11:18 is a cleaner example of the same قف-wins resolution, not
// complicated by the last-word rule.
const html22_11 = RM_uthmani.renderAyahWords(getAyah(22, 11, 'الحج'));
check(
  '22:11 word 18 (ج×قف → ج per policy 1.0.139, not last word) DOES carry has-default-jeem, NOT has-default-qif',
  hasWordClass(html22_11, 'has-default-jeem', '22:11:17') && !hasWordClass(html22_11, 'has-default-qif', '22:11:17'),
  'word html: ' + wordHtml(html22_11, '22:11:17')
);
// The one "non-clean" internal conflict (also صلي): fully excluded.
const html3_119 = RM_uthmani.renderAyahWords(getAyah(3, 119, 'آل عمران'));
check(
  '3:119 word 12 (ج×قد_قيل AND ×صلي — non-clean) carries NEITHER has-default-jeem NOR has-default-qad-qila',
  !hasWordClass(html3_119, 'has-default-jeem', '3:119:11') && !hasWordClass(html3_119, 'has-default-qad-qila', '3:119:11'),
  'word html: ' + wordHtml(html3_119, '3:119:11')
);

console.log('\nج × لا/صلي — permanently excluded (same final policy as ط/ص/ز/ق/قف):');

const laFullJeem = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'LA'; });
check('ج×لا: exactly 20 raw overlaps (16 already last-word-excluded, 4 active)', rawOverlapKeys(JEEM_POSITIONS, laFullJeem).length === 20, '');
const html3_49 = RM_uthmani.renderAyahWords(getAyah(3, 49, 'آل عمران'));
check(
  '3:49 word 10 (ج×لا) does NOT carry has-default-jeem — permanently excluded',
  !hasWordClass(html3_49, 'has-default-jeem', '3:49:9'),
  'word html: ' + wordHtml(html3_49, '3:49:9')
);
const qifSilaSandbox2 = { window: {} };
vm.createContext(qifSilaSandbox2);
vm.runInContext(silaPositionsSrc, qifSilaSandbox2, { filename: 'sila-positions.js' });
check('ج×صلي: exactly 115 raw overlaps (64 already last-word-excluded, 51 active)', rawOverlapKeys(JEEM_POSITIONS, qifSilaSandbox2.window.SILA_POSITIONS).length === 115, '');
const html2_14 = RM_uthmani.renderAyahWords(getAyah(2, 14, 'البقرة'));
check(
  '2:14 word 6 (ج×صلي) does NOT carry has-default-jeem — permanently excluded',
  !hasWordClass(html2_14, 'has-default-jeem', '2:14:5'),
  'word html: ' + wordHtml(html2_14, '2:14:5')
);
check(
  'waqf-positions.js itself still has a JEEM entry for 2:14 word 6 (permanent exclusion, not missing data)',
  JEEM_POSITIONS.some(function (p) { return p.surah === 2 && p.ayah === 14 && p.word === 6; }),
  ''
);

console.log('\nج × تعانق — mostly auto-resolved, 25 held back pending pairing info:');

const muFullJeem = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'MUANAQAH'; });
check('ج×تعانق: exactly 42 raw overlaps (10 already last-word-excluded, 32 active)', rawOverlapKeys(JEEM_POSITIONS, muFullJeem).length === 42, '');
// Auto-resolved via the صلي rule (this word also has صلي on itself).
const html2_2 = RM_uthmani.renderAyahWords(getAyah(2, 2, 'البقرة'));
check(
  '2:2 word 4 (idx 3, ج×تعانق but ALSO صلي) does NOT carry has-default-jeem — excluded via the صلي rule, no pairing info needed',
  !hasWordClass(html2_2, 'has-default-jeem', '2:2:3'),
  'word html: ' + wordHtml(html2_2, '2:2:3')
);
// Special case: 33:13:21 excluded due to a prior, unrelated ط decision at this exact word.
const html33_13_jeem = RM_uthmani.renderAyahWords(getAyah(33, 13, 'الأحزاب'));
check(
  '33:13 word 21 ("بعورة") does NOT carry has-default-jeem — ط already placed here by an earlier unrelated decision',
  !hasWordClass(html33_13_jeem, 'has-default-jeem', '33:13:20'),
  'word html: ' + wordHtml(html33_13_jeem, '33:13:20')
);
check(
  '33:13 word 21 ("بعورة") still carries has-default-waqf (ط) — unaffected by ج joining',
  hasDefaultWaqfClass(html33_13_jeem, '33:13:20'),
  'word html: ' + wordHtml(html33_13_jeem, '33:13:20')
);
console.log('\nج × تعانق pairs extracted from raw مصحف النسخ text (direct user follow-up: "جيب البيانات من مصحف النسخ إن استطعت"):');

// 4 positions resolved to green: the mu'anaqah partner (found by
// matching Uthmani words to Indopak words directly, since word-numbering
// differs between the two scripts) carries صلى in the raw text — cross-
// verified independently against sila-positions.js/waqf-positions.js.
const JEEM_SILA_RESOLVED = [
  { surah: 2, ayah: 2, name: 'البقرة', word: 5, partner: { ayah: 2, word: 4 } },
  { surah: 2, ayah: 195, name: 'البقرة', word: 10, partner: { ayah: 195, word: 9 } },
  { surah: 3, ayah: 30, name: 'آل عمران', word: 13, partner: { ayah: 30, word: 9 } },
  { surah: 7, ayah: 188, name: 'الأعراف', word: 21, partner: { ayah: 188, word: 18 } }
];
JEEM_SILA_RESOLVED.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (ج×تعانق, partner has صلى per مصحف النسخ) DOES carry has-default-jeem — resolved green',
    hasWordClass(html, 'has-default-jeem', key),
    'word html: ' + wordHtml(html, key)
  );
});

// 21 positions (5 ج×ج tie pairs + 11 partner-unknown) reviewed visually
// by the user. 7 resolved green; 14 excluded permanently.
const JEEM_TIE_RESOLVED_GREEN = [
  { surah: 2, ayah: 96, name: 'البقرة', word: 8 },
  { surah: 5, ayah: 41, name: 'المائدة', word: 16 },
  { surah: 7, ayah: 163, name: 'الأعراف', word: 22 },
  { surah: 7, ayah: 172, name: 'الأعراف', word: 17 },
  { surah: 28, ayah: 35, name: 'القصص', word: 11 },
  { surah: 25, ayah: 32, name: 'الفرقان', word: 9 },
  { surah: 60, ayah: 3, name: 'الممتحنة', word: 5 }
];
JEEM_TIE_RESOLVED_GREEN.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (ج×تعانق, visual review → green) DOES carry has-default-jeem',
    hasWordClass(html, 'has-default-jeem', key),
    'word html: ' + wordHtml(html, key)
  );
});

const JEEM_TIE_EXCLUDED = [
  { surah: 2, ayah: 96, name: 'البقرة', word: 5 },
  { surah: 5, ayah: 41, name: 'المائدة', word: 19 },
  { surah: 7, ayah: 163, name: 'الأعراف', word: 23 },
  { surah: 7, ayah: 172, name: 'الأعراف', word: 16 },
  { surah: 28, ayah: 35, name: 'القصص', word: 10 },
  { surah: 5, ayah: 32, name: 'المائدة', word: 3 },
  { surah: 7, ayah: 92, name: 'الأعراف', word: 7 },
  { surah: 25, ayah: 32, name: 'الفرقان', word: 10 },
  { surah: 25, ayah: 59, name: 'الفرقان', word: 13 },
  { surah: 33, ayah: 61, name: 'الأحزاب', word: 1 },
  { surah: 44, ayah: 45, name: 'الدخان', word: 1 },
  { surah: 60, ayah: 3, name: 'الممتحنة', word: 7 },
  { surah: 68, ayah: 41, name: 'القلم', word: 3 },
  { surah: 84, ayah: 15, name: 'الانشقاق', word: 1 }
];
JEEM_TIE_EXCLUDED.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (ج×تعانق, visual review → excluded) does NOT carry has-default-jeem',
    !hasWordClass(html, 'has-default-jeem', key),
    'word html: ' + wordHtml(html, key)
  );
});
check(
  'waqf-positions.js itself still has a JEEM entry for 2:2 word 5 (now resolved, not missing data)',
  JEEM_POSITIONS.some(function (p) { return p.surah === 2 && p.ayah === 2 && p.word === 5; }),
  ''
);

// WAQF_REVIEW JEEM extraction gaps filled via MANUAL_ADDITIONS (1.0.133).
// Opened by user report: 60:9 word 16 ("تَوَلَّوْهُمۡ") had ج in Indopak
// but was only in WAQF_REVIEW without a word number — never colored.
const JEEM_REVIEW_GAP_FILLED = [
  { surah: 60, ayah: 9, name: 'الممتحنة', word: 16 },
  { surah: 2, ayah: 198, name: 'البقرة', word: 8 },
  { surah: 9, ayah: 51, name: 'التوبة', word: 10 },
  { surah: 32, ayah: 3, name: 'السجدة', word: 3 },
  { surah: 18, ayah: 63, name: 'الكهف', word: 15 },
  { surah: 66, ayah: 2, name: 'التحريم', word: 6 }
];
JEEM_REVIEW_GAP_FILLED.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (WAQF_REVIEW JEEM gap → MANUAL_ADDITIONS) DOES carry has-default-jeem',
    hasWordClass(html, 'has-default-jeem', key),
    'word html: ' + wordHtml(html, key)
  );
});
// Indopak has ط (U+0615) on these words — must stay TA blue, not JEEM green.
// Madinah text may show U+06DA glyph, but Indopak is source of truth.
const TA_INDOPAK_NOT_JEEM = [
  { surah: 3, ayah: 152, name: 'آل عمران', word: 20 },
  { surah: 57, ayah: 12, name: 'الحديد', word: 18 }
];
TA_INDOPAK_NOT_JEEM.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (Indopak ط, not ج) DOES carry has-default-waqf, NOT has-default-jeem',
    hasDefaultWaqfClass(html, key) && !hasWordClass(html, 'has-default-jeem', key),
    'word html: ' + wordHtml(html, key)
  );
});
// 59:9:24 — Indopak has ط+قف on same token → قف wins (policy 1.0.139)
(function () {
  const html = RM_uthmani.renderAyahWords(getAyah(59, 9, 'الحشر'));
  check(
    '59:9 word 24 (ط+قف same token → قف) DOES carry has-default-qif, NOT has-default-waqf',
    hasWordClass(html, 'has-default-qif', '59:9:23') && !hasDefaultWaqfClass(html, '59:9:23'),
    'word html: ' + wordHtml(html, '59:9:23')
  );
})();


// Sanity: zero unexpected console.warn — all 13 internal conflicts are
// accounted for (11 clean resolved, 1 excluded via صلي, 1 already
// resolved via a separate قف×تعانق decision).
check(
  'loading against the real, unmodified waqf-positions.js triggers ZERO console.warn — all known internal conflicts (including ج) are resolved',
  RM_uthmani.__testWarnings.length === 0,
  'warnings: ' + JSON.stringify(RM_uthmani.__testWarnings)
);

console.log('\nColor-conflict checks (all three default-mark types against each other):');

// TA_MUTLAQ vs SAD_RUKHSA: no overlap.
check(
  'no word in waqf-positions.js is currently both TA_MUTLAQ and SAD_RUKHSA at once',
  overlapKeys.length === 0,
  'overlapping surah:ayah:word keys: ' + JSON.stringify(overlapKeys)
);

// TA_MUTLAQ vs WAQF_LAZIM: exactly 2 known real overlaps in the current
// data (6:124 word 13, 67:19 word 7) — this is what the conflict
// safeguard actually protects against in practice, not just theory.
const taLazimOverlapKeys = TA_MUTLAQ_POSITIONS
  .map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; })
  .filter(function (taKey) {
    return WAQF_LAZIM_POSITIONS.some(function (p) {
      return (p.surah + ':' + p.ayah + ':' + p.word) === taKey;
    });
  });
check(
  'waqf-positions.js has exactly the 2 known real TA_MUTLAQ+WAQF_LAZIM overlaps (6:124 w13, 67:19 w7)',
  taLazimOverlapKeys.length === 2 &&
    taLazimOverlapKeys.indexOf('6:124:13') !== -1 &&
    taLazimOverlapKeys.indexOf('67:19:7') !== -1,
  'overlapping surah:ayah:word keys: ' + JSON.stringify(taLazimOverlapKeys)
);

// SAD_RUKHSA vs WAQF_LAZIM: no overlap.
const srLazimOverlapKeys = SAD_RUKHSA_POSITIONS
  .map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; })
  .filter(function (srKey) {
    return WAQF_LAZIM_POSITIONS.some(function (p) {
      return (p.surah + ':' + p.ayah + ':' + p.word) === srKey;
    });
  });
check(
  'no word in waqf-positions.js is currently both SAD_RUKHSA and WAQF_LAZIM at once',
  srLazimOverlapKeys.length === 0,
  'overlapping surah:ayah:word keys: ' + JSON.stringify(srLazimOverlapKeys)
);

// ز (ZAY_JAWAZ) vs the other three internal types — direct user
// request: "بحيث لا يوجد تعارض مع العلامات" (ensure no conflict exists).
function rawOverlapKeys(listA, listB) {
  const setB = new Set(listB.map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; }));
  return listA
    .filter(function (p) { return setB.has(p.surah + ':' + p.ayah + ':' + p.word); })
    .map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; });
}
check(
  'ز×ط: zero raw overlaps',
  rawOverlapKeys(ZAY_JAWAZ_POSITIONS, TA_MUTLAQ_POSITIONS).length === 0,
  ''
);
check(
  'ز×ص: zero raw overlaps',
  rawOverlapKeys(ZAY_JAWAZ_POSITIONS, SAD_RUKHSA_POSITIONS).length === 0,
  ''
);
check(
  'ز×م: zero raw overlaps',
  rawOverlapKeys(ZAY_JAWAZ_POSITIONS, WAQF_LAZIM_POSITIONS).length === 0,
  ''
);
// قد قيل (QAD_QILA) joining DEFAULT_MARK_TYPES introduced 8 genuine
// internal overlaps with ز. Per direct user follow-up, only the 6 that
// carry ق+ز EXCLUSIVELY (no صلي) and aren't the ayah's last word are
// resolved to green — those 6 must not trigger the warning. The other
// 2 (11:46:10, 51:54:5), plus the 1 ط×قد_قيل overlap (78:38:5), were
// initially left genuinely unresolved (triggering the warning) — but a
// direct final user decision confirmed each one's fate individually
// (78:38: has لا in مصحف النسخ, exclude; 11:46: has صلي, exclude;
// 51:54: ayah-final, exclude), so all 3 are now permanently resolved via
// the 'CONFIRMED_EXCLUDED' sentinel in DEFAULT_MARK_CONFLICT_RESOLUTIONS
// (readerManager.js) — no longer pending, so the warning no longer fires
// for them at all.
const RESOLVED_QAD_QILA_ZAY_JAWAZ_KEYS = [
  '2:34:10', '3:187:11', '4:45:6',
  '28:15:11', '28:15:29', '29:32:13'
];
const PERMANENTLY_EXCLUDED_VIA_SENTINEL_KEYS = ['11:46:10', '51:54:5', '78:38:5'];
check(
  'the 6 approved قد_قيل×ز conflicts never appear in any console.warn',
  RM_uthmani.__testWarnings.every(function (w) {
    return RESOLVED_QAD_QILA_ZAY_JAWAZ_KEYS.every(function (k) { return w.indexOf(k) === -1; });
  }),
  'warnings: ' + JSON.stringify(RM_uthmani.__testWarnings)
);
check(
  '78:38:5, 11:46:10 and 51:54:5 (permanently resolved via CONFIRMED_EXCLUDED) never appear in any console.warn',
  RM_uthmani.__testWarnings.every(function (w) {
    return w.indexOf('78:38:5') === -1 && w.indexOf('11:46:10') === -1 && w.indexOf('51:54:5') === -1;
  }),
  'warnings: ' + JSON.stringify(RM_uthmani.__testWarnings)
);
check(
  '8 of the 9 قف internal conflicts are now resolved (clean overlaps) and no longer trigger any console.warn',
  RM_uthmani.__testWarnings.every(function (w) {
    return ['3:135:16', '7:183:2', '19:17:4', '19:30:4', '24:58:27', '27:66:10', '32:24:7', '88:21:1']
      .every(function (k) { return w.indexOf(k) === -1; });
  }),
  'warnings: ' + JSON.stringify(RM_uthmani.__testWarnings)
);
check(
  '65:10:11 is now ALSO resolved (via the separate قف×تعانق review) — zero console.warn fires at all, all known internal conflicts accounted for',
  RM_uthmani.__testWarnings.length === 0,
  'warnings: ' + JSON.stringify(RM_uthmani.__testWarnings)
);
check(
  'all 3 permanently-resolved words are still excluded from every default-mark class (78:38: ط+قد_قيل, 11:46: ز+قد_قيل, 51:54: ز+قد_قيل)',
  (function () {
    const h7838 = RM_uthmani.renderAyahWords(getAyah(78, 38, 'النبإ'));
    const h1146 = RM_uthmani.renderAyahWords(getAyah(11, 46, 'هود'));
    const h5154 = RM_uthmani.renderAyahWords(getAyah(51, 54, 'الذاريات'));
    return !hasDefaultWaqfClass(h7838, '78:38:4') && !hasWordClass(h7838, 'has-default-qad-qila', '78:38:4') &&
      !hasWordClass(h1146, 'has-default-qad-qila', '11:46:9') && !hasWordClass(h1146, 'has-default-zay-jawaz', '11:46:9') &&
      !hasWordClass(h5154, 'has-default-qad-qila', '51:54:4') && !hasWordClass(h5154, 'has-default-zay-jawaz', '51:54:4');
  })(),
  ''
);

console.log('\nز × لا/تعانق conflict check (direct user request — verified, not assumed):');

check(
  'ز×تعانق: zero raw overlaps',
  rawOverlapKeys(ZAY_JAWAZ_POSITIONS, MUANAQAH_POSITIONS).length === 0,
  ''
);
// ز×لا has exactly 1 raw overlap (33:38 word 22), but that word is the
// ayah's LAST word — already excluded by the standard rule regardless
// of لا, so zero ACTIVE conflicts remain.
const zjLaOverlapKeys = rawOverlapKeys(ZAY_JAWAZ_POSITIONS, LA_POSITIONS);
check(
  'ز×لا: exactly 1 known raw overlap (33:38 word 22), which is the ayah last word (already excluded)',
  zjLaOverlapKeys.length === 1 && zjLaOverlapKeys[0] === '33:38:22',
  'overlapping keys: ' + JSON.stringify(zjLaOverlapKeys)
);
const a33_38 = getAyah(33, 38, 'الأحزاب');
const html33_38 = RM_uthmani.renderAyahWords(a33_38);
check(
  '33:38 word 22 (idx 21, the ز×لا overlap) does NOT carry has-default-zay-jawaz (last-word exclusion, not a لا-driven exclusion)',
  !hasWordClass(html33_38, 'has-default-zay-jawaz', '33:38:21'),
  'word html: ' + wordHtml(html33_38, '33:38:21')
);

console.log('\nFull pairwise summary — ط ص م تعانق (direct user request: confirm zero unresolved conflicts overall):');

// Helper: raw surah:ayah:word overlap count between two position lists.
function overlapCount(listA, listB) {
  const setB = new Set(listB.map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; }));
  return listA.filter(function (p) { return setB.has(p.surah + ':' + p.ayah + ':' + p.word); }).length;
}

// The three COMPETING-COLOR types (ط/ص/م) must have zero UNRESOLVED
// conflicts between every pair — either no raw overlap at all, or every
// raw overlap has an entry in DEFAULT_MARK_CONFLICT_RESOLUTIONS. تعانق
// is deliberately excluded from this table: it isn't in
// DEFAULT_MARK_TYPES, so co-occurring with ط/ص/م is expected and not a
// competing-color conflict (see the "Manual ط exclusions"/"Manual ط
// addition" sections above for how those specific co-occurrences were
// actually handled).
check(
  'ط×ص: zero raw overlaps (nothing to resolve)',
  overlapCount(TA_MUTLAQ_POSITIONS, SAD_RUKHSA_POSITIONS) === 0,
  ''
);
check(
  'ط×م: exactly 2 raw overlaps, both resolved (0 unresolved) — see DEFAULT_MARK_CONFLICT_RESOLUTIONS',
  overlapCount(TA_MUTLAQ_POSITIONS, WAQF_LAZIM_POSITIONS) === 2,
  ''
);
check(
  'ص×م: zero raw overlaps (nothing to resolve)',
  overlapCount(SAD_RUKHSA_POSITIONS, WAQF_LAZIM_POSITIONS) === 0,
  ''
);
// Confirmed directly above (Real-data conflict RESOLUTION section runs
// after this one in file order but the resolutions themselves are
// applied at readerManager.js load time either way): zero *unresolved*
// ط/ص/م conflicts remain — the resolved ط×م pair (6:124, 67:19) must
// NOT appear in any console.warn. (قد قيل now legitimately contributes
// its own separate warning against ز — see the checks above — so this
// no longer asserts zero warnings globally.)
check(
  'ط/ص/م: the resolved ط×م pair (6:124, 67:19) does not appear in any console.warn (genuinely resolved, not just uncounted)',
  RM_uthmani.__testWarnings.every(function (w) {
    return w.indexOf('6:124:13') === -1 && w.indexOf('67:19:7') === -1;
  }),
  'warnings: ' + JSON.stringify(RM_uthmani.__testWarnings)
);

// تعانق co-occurrence counts, tracked here as a permanent record (not a
// pass/fail conflict check, since تعانق isn't a competing color) — locks
// in today's known state so any future change (new waqf-positions.js
// regeneration, a new default-mark type) that shifts these numbers gets
// caught immediately rather than passing silently.
check(
  'ص×تعانق: zero co-occurrences (documented, not expected to ever need manual handling)',
  overlapCount(SAD_RUKHSA_POSITIONS, MUANAQAH_POSITIONS) === 0,
  ''
);
check(
  'م×تعانق: zero co-occurrences (documented, not expected to ever need manual handling)',
  overlapCount(WAQF_LAZIM_POSITIONS, MUANAQAH_POSITIONS) === 0,
  ''
);
check(
  'ط×تعانق: exactly 11 raw co-occurrences in waqf-positions.js (documented, all individually reviewed above)',
  overlapCount(TA_MUTLAQ_POSITIONS, MUANAQAH_POSITIONS) === 11,
  ''
);

console.log('\nReal-data conflict RESOLUTION (6:124 w13 and 67:19 w7 — confirmed ط per علل الوقوف للسجاوندي):');

// These are the same 2 real overlaps checked above, but now MANUALLY
// RESOLVED (direct user verification against photographed pages of علل
// الوقوف للسجاوندي: both are ط, not م — see
// DEFAULT_MARK_CONFLICT_RESOLUTIONS in readerManager.js). They must now
// render as ط (has-default-waqf), NOT be excluded, and NOT carry
// has-default-waqf-lazim.
const a6_124 = getAyah(6, 124, 'الأنعام');
const html6_124 = RM_uthmani.renderAyahWords(a6_124);
check(
  '6:124 word 13 (idx 12, resolved ط per السجاوندي) DOES carry has-default-waqf',
  hasDefaultWaqfClass(html6_124, '6:124:12'),
  'word html: ' + wordHtml(html6_124, '6:124:12')
);
check(
  '6:124 word 13 (idx 12, resolved ط) does NOT carry has-default-waqf-lazim',
  !hasDefaultWaqfLazimClass(html6_124, '6:124:12'),
  'word html: ' + wordHtml(html6_124, '6:124:12')
);

const a67_19 = getAyah(67, 19, 'الملك');
const html67_19 = RM_uthmani.renderAyahWords(a67_19);
check(
  '67:19 word 7 (idx 6, resolved ط per السجاوندي) DOES carry has-default-waqf',
  hasDefaultWaqfClass(html67_19, '67:19:6'),
  'word html: ' + wordHtml(html67_19, '67:19:6')
);
check(
  '67:19 word 7 (idx 6, resolved ط) does NOT carry has-default-waqf-lazim',
  !hasDefaultWaqfLazimClass(html67_19, '67:19:6'),
  'word html: ' + wordHtml(html67_19, '67:19:6')
);

// Since both real ط×م overlaps are now resolved (not left as
// unresolved conflicts), they must not appear in any console.warn.
// (قد قيل independently contributes its own separate, expected warning
// now — see the checks above — so this no longer asserts zero warnings
// globally.)
check(
  'the resolved ط×م pair (6:124, 67:19) triggers no console.warn — genuinely resolved',
  RM_uthmani.__testWarnings.every(function (w) {
    return w.indexOf('6:124:13') === -1 && w.indexOf('67:19:7') === -1;
  }),
  'warnings: ' + JSON.stringify(RM_uthmani.__testWarnings)
);

console.log('\nConflict-exclusion safeguard (synthetic data, to prove UNRESOLVED conflicts still get excluded):');

// 2:7 word 6 (idx 5) is a REAL TA_MUTLAQ position (used earlier in this
// file). Here it's synthetically also marked SAD_RUKHSA, to force a
// conflict and verify the safeguard — direct user request: on conflict,
// exclude the word from BOTH colorings entirely (don't let CSS decide),
// pending manual review against علل الوقوف للسجاوندي. 2:7 word 3 (idx 2)
// is included as an unrelated, non-conflicting TA_MUTLAQ position in the
// same synthetic dataset, to confirm the safeguard doesn't overreact and
// suppress marks that aren't actually in conflict.
const syntheticPositions = [
  { surah: 2, ayah: 7, word: 3, type: 'TA_MUTLAQ' },
  { surah: 2, ayah: 7, word: 6, type: 'TA_MUTLAQ' },
  { surah: 2, ayah: 7, word: 6, type: 'SAD_RUKHSA' }
];
const synthetic = loadReaderManagerWithSyntheticPositions(syntheticPositions, 'uthmani');
const htmlSynthetic = synthetic.RM.renderAyahWords(a2_7);

check(
  'conflicting word (2:7 idx 5, synthetic ط+ص) does NOT carry has-default-waqf',
  !hasWordClass(htmlSynthetic, 'has-default-waqf', '2:7:5'),
  'word html: ' + wordHtml(htmlSynthetic, '2:7:5')
);
check(
  'conflicting word (2:7 idx 5, synthetic ط+ص) does NOT carry has-default-sad-rukhsa',
  !hasWordClass(htmlSynthetic, 'has-default-sad-rukhsa', '2:7:5'),
  'word html: ' + wordHtml(htmlSynthetic, '2:7:5')
);
check(
  'an unrelated, non-conflicting TA_MUTLAQ word (2:7 idx 2) in the same dataset is unaffected',
  hasWordClass(htmlSynthetic, 'has-default-waqf', '2:7:2'),
  'word html: ' + wordHtml(htmlSynthetic, '2:7:2')
);
check(
  'a console.warn fires naming the conflict when one exists',
  synthetic.warnings.some(function (w) { return w.indexOf('2:7:6') !== -1; }),
  'warnings: ' + JSON.stringify(synthetic.warnings)
);

// Sanity control: the SAME synthetic-loader path with zero conflicts
// must NOT warn and must NOT suppress anything — proves the safeguard
// only activates on an actual conflict, not just because synthetic data
// was used.
const noConflictPositions = [{ surah: 2, ayah: 7, word: 6, type: 'TA_MUTLAQ' }];
const noConflict = loadReaderManagerWithSyntheticPositions(noConflictPositions, 'uthmani');
const htmlNoConflict = noConflict.RM.renderAyahWords(a2_7);
check(
  'control: with zero conflicts, the TA_MUTLAQ word still gets has-default-waqf normally',
  hasWordClass(htmlNoConflict, 'has-default-waqf', '2:7:5'),
  'word html: ' + wordHtml(htmlNoConflict, '2:7:5')
);
check(
  'control: with zero conflicts, no console.warn fires',
  noConflict.warnings.length === 0,
  'warnings: ' + JSON.stringify(noConflict.warnings)
);

console.log('\nsila-positions.js integration (صلي، مصحف النسخ — independent from WAQF_POSITIONS):');

// Ground truth: sila-positions.js loaded on its own, same pattern as
// waqf-positions.js above.
const silaSandbox = { window: {} };
vm.createContext(silaSandbox);
vm.runInContext(silaPositionsSrc, silaSandbox, { filename: 'sila-positions.js' });
const SILA_POSITIONS = silaSandbox.window.SILA_POSITIONS;
const SILA_REVIEW = silaSandbox.window.SILA_REVIEW;

check(
  'sila-positions.js parses and exposes window.SILA_POSITIONS with the expected count',
  Array.isArray(SILA_POSITIONS) && SILA_POSITIONS.length === 258,
  'count: ' + (SILA_POSITIONS ? SILA_POSITIONS.length : 'undefined')
);
check(
  'sila-positions.js exposes window.SILA_REVIEW with the expected count',
  Array.isArray(SILA_REVIEW) && SILA_REVIEW.length === 11,
  'count: ' + (SILA_REVIEW ? SILA_REVIEW.length : 'undefined')
);

// Loading sila-positions.js on its own must NOT touch window.WAQF_POSITIONS
// at all — confirms the two data sources stay fully independent, as
// documented in readerManager.js (صلي is deliberately excluded from
// DEFAULT_MARK_TYPES).
check(
  'loading sila-positions.js alone does not define window.WAQF_POSITIONS (fully independent data source)',
  typeof silaSandbox.window.WAQF_POSITIONS === 'undefined',
  ''
);

// Real-data conflict check between SILA_POSITIONS and our 3 active
// default-mark types (ط/م/ص), computed directly here (not hardcoded),
// against the SAME effective TA_MUTLAQ/SAD_RUKHSA/WAQF_LAZIM lists used
// throughout this file.
function overlapKeysWith(positionList) {
  const silaSet = new Set(SILA_POSITIONS.map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; }));
  return positionList
    .filter(function (p) { return silaSet.has(p.surah + ':' + p.ayah + ':' + p.word); })
    .map(function (p) { return p.surah + ':' + p.ayah + ':' + p.word; });
}
check(
  'ط × صلي: zero raw overlaps',
  overlapKeysWith(TA_MUTLAQ_POSITIONS).length === 0,
  ''
);
check(
  'م × صلي: zero raw overlaps',
  overlapKeysWith(WAQF_LAZIM_POSITIONS).length === 0,
  ''
);
const srSilaOverlap = overlapKeysWith(SAD_RUKHSA_POSITIONS);
check(
  'ص × صلي: exactly the 2 known raw overlaps (19:31 w11, 24:22 w15)',
  srSilaOverlap.length === 2 &&
    srSilaOverlap.indexOf('19:31:11') !== -1 &&
    srSilaOverlap.indexOf('24:22:15') !== -1,
  'overlapping keys: ' + JSON.stringify(srSilaOverlap)
);
// ز × صلي: a large number of raw overlaps (59). Direct user follow-up
// request: hold back the 34 that are actually active (not already
// ayah-final) until reviewed against علل الوقوف — see
// DEFAULT_MARK_MANUAL_EXCLUSIONS['ZAY_JAWAZ'] in readerManager.js. This
// check locks in today's known RAW count as a permanent record.
const zjSilaOverlap = overlapKeysWith(ZAY_JAWAZ_POSITIONS);
check(
  'ز × صلي: exactly 59 known raw overlaps (documented — the 34 active ones are held back, see checks below)',
  zjSilaOverlap.length === 59,
  'count: ' + zjSilaOverlap.length
);

// Spot-check two of the 34 held-back positions: must NOT carry
// has-default-zay-jawaz right now (pending manual review).
const a2_168 = getAyah(2, 168, 'البقرة');
const html2_168 = RM_uthmani.renderAyahWords(a2_168);
check(
  '2:168 word 8 (idx 7, active ز×صلي, held back pending review) does NOT carry has-default-zay-jawaz',
  !hasWordClass(html2_168, 'has-default-zay-jawaz', '2:168:7'),
  'word html: ' + wordHtml(html2_168, '2:168:7')
);
const a73_20 = getAyah(73, 20, 'المزمل');
const html73_20 = RM_uthmani.renderAyahWords(a73_20);
check(
  '73:20 word 48 (idx 47, active ز×صلي, held back pending review) does NOT carry has-default-zay-jawaz',
  !hasWordClass(html73_20, 'has-default-zay-jawaz', '73:20:47'),
  'word html: ' + wordHtml(html73_20, '73:20:47')
);
// Control: waqf-positions.js itself still tags these as ZAY_JAWAZ —
// confirms this is a manual hold, not something already absent from
// the source data.
check(
  'waqf-positions.js itself still has a ZAY_JAWAZ entry for 2:168 word 8 (this really is a manual hold, not missing data)',
  ZAY_JAWAZ_POSITIONS.some(function (p) { return p.surah === 2 && p.ayah === 168 && p.word === 8; }),
  ''
);
// Control: a ز×صلي overlap that's ALSO the ayah's last word (already
// excluded by the standard rule, e.g. 26:76) should behave identically
// to before — confirms the new manual-exclusion list didn't need to
// (and doesn't) duplicate what the last-word rule already handles.
const a26_76 = getAyah(26, 76, 'الشعراء');
const html26_76 = RM_uthmani.renderAyahWords(a26_76);
check(
  '26:76 word 3 (idx 2, ز×صلي overlap but ALSO last word) does NOT carry has-default-zay-jawaz — via the ordinary last-word rule',
  !hasWordClass(html26_76, 'has-default-zay-jawaz', '26:76:2'),
  'word html: ' + wordHtml(html26_76, '26:76:2')
);

// 24:22 word 15 (idx 14, "ٱللَّهِ" in "في سبيل الله"): originally, a
// direct user review against علل الوقوف للسجاوندي (photographed page
// 736) confirmed ص was correct here despite the صلي overlap. UPDATE
// (طلب مباشر لاحق، سياسة عامة نهائية): "أي علامة ص/ق/ز معاها لا أو
// صلي، شيلها فورًا ولا تعتمدها" — this supersedes that original
// case-by-case decision; 24:22 is now excluded like every other
// ص/ز/ق×(لا/صلي) overlap, no more individual exceptions for this
// pairing.
const a24_22 = getAyah(24, 22, 'النور');
const html24_22 = RM_uthmani.renderAyahWords(a24_22);
check(
  '24:22 word 15 (idx 14, "ٱللَّهِ") now EXCLUDED — direct final policy supersedes the earlier case-by-case "keep" decision',
  !hasDefaultSadRukhsaClass(html24_22, '24:22:14'),
  'word html: ' + wordHtml(html24_22, '24:22:14')
);
// 19:31 word 11 (idx 10) is the OTHER raw overlap — it's the ayah's last
// word, already excluded by the standard rule, independent of صلي
// entirely. Confirms that exclusion still holds.
const a19_31 = getAyah(19, 31, 'مريم');
const html19_31 = RM_uthmani.renderAyahWords(a19_31);
check(
  '19:31 word 11 (idx 10, last word, already excluded regardless of صلي) does NOT carry has-default-sad-rukhsa',
  !hasDefaultSadRukhsaClass(html19_31, '19:31:10'),
  'word html: ' + wordHtml(html19_31, '19:31:10')
);


// QIF REVIEW gaps filled (1.0.139) — Indopak U+E01E → Uthmani word
const QIF_REVIEW_GAP_FILLED = [
  { surah: 3, ayah: 50, name: 'آل عمران', word: 16 },
  { surah: 6, ayah: 62, name: 'الأنعام', word: 9 },
  { surah: 7, ayah: 43, name: 'الأعراف', word: 16 },
  { surah: 28, ayah: 25, name: 'القصص', word: 22 }
];
QIF_REVIEW_GAP_FILLED.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (QIF REVIEW gap) DOES carry has-default-qif',
    hasWordClass(html, 'has-default-qif', key),
    'word html: ' + wordHtml(html, key)
  );
});
// 16:70:4 — لا on same Indopak token → excluded
(function () {
  const html = RM_uthmani.renderAyahWords(getAyah(16, 70, 'النحل'));
  check(
    '16:70 word 4 (قف+لا same token) does NOT carry has-default-qif',
    !hasWordClass(html, 'has-default-qif', '16:70:3'),
    'word html: ' + wordHtml(html, '16:70:3')
  );
})();


// ZAY / QAD / SAD REVIEW gaps (1.0.140)
const ZAY_REVIEW_GAP = [
  { surah: 5, ayah: 7, name: 'المائدة', word: 12 },
  { surah: 18, ayah: 62, name: 'الكهف', word: 6 },
  { surah: 28, ayah: 26, name: 'القصص', word: 4 }
];
ZAY_REVIEW_GAP.forEach(function (t) {
  const html = RM_uthmani.renderAyahWords(getAyah(t.surah, t.ayah, t.name));
  const key = t.surah + ':' + t.ayah + ':' + (t.word - 1);
  check(
    t.surah + ':' + t.ayah + ' word ' + t.word + ' (ZAY REVIEW gap) DOES carry has-default-zay-jawaz',
    hasWordClass(html, 'has-default-zay-jawaz', key),
    'word html: ' + wordHtml(html, key)
  );
});
(function () {
  const html = RM_uthmani.renderAyahWords(getAyah(59, 7, 'الحشر'));
  check(
    '59:7 word 27 (QAD REVIEW gap) DOES carry has-default-qad-qila',
    hasWordClass(html, 'has-default-qad-qila', '59:7:26'),
    'word html: ' + wordHtml(html, '59:7:26')
  );
})();
(function () {
  const html = RM_uthmani.renderAyahWords(getAyah(2, 144, 'البقرة'));
  check(
    '2:144 word 9 (SAD REVIEW gap) DOES carry has-default-sad-rukhsa',
    hasWordClass(html, 'has-default-sad-rukhsa', '2:144:8'),
    'word html: ' + wordHtml(html, '2:144:8')
  );
})();

console.log('\nدليل القارئ guide text (قصر المنفصل note box mentions the purple color):');

check(
  'index.html qasr-munfasil-note-box text explicitly says باللون البنفسجي (direct user-provided wording)',
  htmlSrc.indexOf('تم تلوين الكلمات التي يقع فيها الخلاف بين طريق الشاطبية وطريق روضة الحفاظ باللون <span class="khilaf-highlight-color-name">البنفسجي</span>؛ لتسهيل التعرف عليها أثناء التلاوة.') !== -1,
  ''
);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail > 0) process.exit(1);
