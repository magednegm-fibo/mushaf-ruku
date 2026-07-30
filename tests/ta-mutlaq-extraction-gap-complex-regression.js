// Regression test for the "complex" batch of the ط (TA_MUTLAQ) extraction
// gap — the 106 ayahs where U+0615 (ARABIC SMALL HIGH TAH) appears "alone"
// in the raw Indopak text (not attached to a clear word), so automatic
// word-structure alignment could not resolve them (see the "simple" batch
// covered separately in ta-mutlaq-extraction-gap-regression.js, and the
// full project-wide survey in تقرير-فجوات-علامة-ط.md: 171 ayahs, 248
// missing marks in total).
//
// Each of these 106 ayahs was resolved individually via a visual picker
// tool (shows the full Uthmani ayah split into words; a human matches each
// Indopak ط occurrence to its Uthmani word). The raw picks (208 across all
// 106 ayahs — every ط occurrence per ayah, whether already registered or
// missing, kept for verification) were then reviewed word-by-word:
//   • 39 picks already matched an existing TA_MUTLAQ entry in
//     waqf-positions.js — not re-added.
//   • 10 picks are the ayah's LAST word (5:46, 69:3, 70:7, 79:30, 79:42,
//     90:12, 91:10, 101:3, 101:10, 104:5) — excluded under the same
//     standing "لا تُوضع عند آخر كلمة في الآية" rule applied to every other
//     TA_MUTLAQ source; not a new exception.
//   • 1 pick (46:15 word 39) is a genuine ط/ج clash in the raw text,
//     resolved in favor of ج (JEEM) after manual review — see
//     DEFAULT_MARK_MANUAL_ADDITIONS['JEEM'] in readerManager.js instead of
//     here.
//   • 1 pick (18:49 word 19) was a mispick by the tool — direct inspection
//     of textIndopak shows that word actually carries U+06DA (ج), not
//     U+0615 (ط); 18:49 has exactly one real ط (word 23, included below).
// That leaves 157 genuinely new TA_MUTLAQ words, added in this batch.
//
// Ground truth is recomputed directly from data.js (not hardcoded): for
// each of the 95 ayahs below, count real Indopak words carrying U+0615,
// then require that count to equal (auto-registered TA_MUTLAQ entries) +
// (this batch's manual additions) + (this ayah's known/accounted
// exclusions — last-word or the 46:15 ج hand-off) — i.e. full accounted
// coverage, zero unexplained gap. Must fail before the fix, pass after.
//
// Node script, no build step:
//   node tests/ta-mutlaq-extraction-gap-complex-regression.js
//   node tests/ta-mutlaq-extraction-gap-complex-regression.js --dir /path/to/unzipped-release
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dirArgIndex = process.argv.indexOf('--dir');
const rootDir = dirArgIndex !== -1 ? process.argv[dirArgIndex + 1] : path.join(__dirname, '..');

const dataSrc = fs.readFileSync(path.join(rootDir, 'data.js'), 'utf8');
const waqfPositionsSrc = fs.readFileSync(path.join(rootDir, 'waqf-positions.js'), 'utf8');
const rmSrc = fs.readFileSync(path.join(rootDir, 'readerManager.js'), 'utf8');

function getAyah(surah, ayah) {
  const re = new RegExp(
    '\\{"surah":' + surah + ',"surahName":"[^"]*","ayah":' + ayah +
    ',"text":"((?:[^"\\\\]|\\\\.)*)"(?:,"juzStart":\\d+)?,"textIndopak":"((?:[^"\\\\]|\\\\.)*)"'
  );
  const m = re.exec(dataSrc);
  if (!m) throw new Error('Ayah ' + surah + ':' + ayah + ' not found in data.js');
  return {
    surah: surah, ayah: ayah,
    text: JSON.parse('"' + m[1] + '"'),
    textIndopak: JSON.parse('"' + m[2] + '"')
  };
}

function loadReaderManager(fontStyle) {
  const sandbox = {
    console: { warn: function () {}, log: console.log, error: console.error },
    document: { addEventListener: function () {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(waqfPositionsSrc, sandbox, { filename: 'waqf-positions.js' });
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
  return sandbox.window.ReaderManager;
}

function wordHtml(html, key) {
  const startIdx = html.indexOf('data-key="' + key + '"');
  if (startIdx === -1) return null;
  const nextIdx = html.indexOf('data-key="', startIdx + 1);
  return html.slice(startIdx, nextIdx === -1 ? html.length : nextIdx);
}
function hasDefaultWaqfClass(html, key) {
  const startIdx = html.indexOf('data-key="' + key + '"');
  if (startIdx === -1) return false;
  const before = html.slice(0, startIdx);
  const classMatch = /class="([^"]*)"\s*$/.exec(before);
  if (!classMatch) return false;
  return classMatch[1].split(/\s+/).indexOf('has-default-waqf') !== -1;
}
function hasDefaultJeemClass(html, key) {
  const startIdx = html.indexOf('data-key="' + key + '"');
  if (startIdx === -1) return false;
  const before = html.slice(0, startIdx);
  const classMatch = /class="([^"]*)"\s*$/.exec(before);
  if (!classMatch) return false;
  return classMatch[1].split(/\s+/).indexOf('has-default-jeem') !== -1;
}

const waqfSandbox = { window: {} };
vm.createContext(waqfSandbox);
vm.runInContext(waqfPositionsSrc, waqfSandbox, { filename: 'waqf-positions.js' });
const TA_MUTLAQ_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'TA_MUTLAQ'; });

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '\n        ' + extra : '')); }
}

// --- The 95-ayah / 157-word batch (surah:ayah -> [uthmani word numbers]) ---
const BATCH = {
  '2:72': [5], '2:142': [11, 15], '2:144': [14, 20, 29], '2:247': [35, 40],
  '2:251': [13], '2:272': [8, 13, 19],
  '2:282': [71, 77, 86, 107, 115, 120, 122, 124],
  '3:28': [21, 24], '3:93': [17], '3:144': [16, 24], '3:148': [7],
  '3:180': [12, 16, 22, 26], '4:20': [13], '4:37': [11], '4:84': [17],
  '4:105': [11], '4:114': [16], '4:171': [31, 34, 38, 50], '5:7': [14],
  '5:43': [12], '5:44': [32], '5:48': [42], '5:66': [16, 19], '5:68': [15],
  '5:72': [29], '6:71': [29, 35], '6:80': [8, 18, 23], '6:90': [6, 11],
  '6:128': [31], '6:144': [34], '7:22': [14], '7:27': [23], '7:38': [34],
  '7:43': [28], '7:89': [14, 25, 30, 33], '7:157': [30],
  '7:160': [20, 25, 32, 37], '7:176': [20], '7:187': [5, 15, 19, 23, 27],
  '8:43': [16], '9:111': [23, 33], '9:127': [14], '10:16': [16],
  '10:23': [9], '10:24': [38], '10:38': [3], '10:83': [14], '11:13': [3],
  '11:35': [3], '11:41': [7], '11:54': [7], '11:88': [21, 27, 31],
  '12:21': [14, 23], '12:30': [13], '12:36': [21], '12:68': [20],
  '12:96': [9], '14:6': [20], '14:34': [5, 11], '17:5': [14], '17:40': [7],
  '17:67': [15], '17:97': [23], '18:49': [23], '21:103': [6],
  '24:33': [27, 39], '24:39': [19], '25:43': [5], '28:25': [14],
  '28:50': [17], '29:24': [14], '31:32': [15], '32:9': [11],
  '33:4': [19, 22], '33:37': [25, 44], '33:48': [9],
  '33:53': [26, 38, 45, 49, 63], '35:2': [16], '35:11': [18, 29],
  '35:43': [5, 11], '39:21': [25], '40:35': [8, 15], '41:12': [10, 15],
  '42:45': [10, 21], '45:23': [17, 22], '46:8': [3, 12, 17, 22],
  '48:29': [24, 44], '49:9': [26], '49:13': [16], '58:6': [10],
  '58:12': [11, 15], '58:13': [7, 20], '59:7': [33], '62:5': [11, 18],
  '65:4': [14, 20]
};

// --- Ayahs with a raw ط occurrence that is intentionally NOT covered by
// BATCH above, each for a documented reason (not a remaining gap): ---
const EXCLUDED_COUNT = {
  // last word of the ayah (standing rule, not a new exception)
  '5:46': 1, '69:3': 1, '70:7': 1, '79:30': 1, '79:42': 1, '90:12': 1,
  '91:10': 1, '101:3': 1, '101:10': 1, '104:5': 1,
  // 46:15 word 39: ط/ج clash, resolved to ج — see DEFAULT_MARK_MANUAL_ADDITIONS['JEEM']
  '46:15': 1
};
const ALL_AYAHS = Object.keys(BATCH).concat(Object.keys(EXCLUDED_COUNT))
  .filter(function (k, i, arr) { return arr.indexOf(k) === i; })
  .sort(function (a, b) {
    const pa = a.split(':').map(Number), pb = b.split(':').map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1];
  });

// --- Ground truth: real-word U+0615 count per ayah, computed straight
// from data.js's textIndopak (space-split words, trailing mark-only
// tokens merged onto the preceding real word) ---
function isMarkOnlyWord(w) {
  for (const ch of w) {
    const cp = ch.codePointAt(0);
    const isMark = (cp >= 0x064B && cp <= 0x065F) || (cp >= 0x06D6 && cp <= 0x06ED) ||
      cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0x200E || cp === 0x200F ||
      cp === 0xFEFF || cp === 0x0615 || (cp >= 0xE000 && cp <= 0xF8FF);
    if (!isMark) return false;
  }
  return true;
}
function countRealWordsWithTA(textIndopak) {
  const raw = textIndopak.trim().split(/\s+/).filter(Boolean);
  let merged = [];
  for (const w of raw) {
    if (isMarkOnlyWord(w) && merged.length > 0) merged[merged.length - 1] += w;
    else merged.push(w);
  }
  return merged.filter(function (w) {
    for (const ch of w) if (ch.codePointAt(0) === 0x0615) return true;
    return false;
  }).length;
}

console.log('Ground truth vs. batch coverage (' + ALL_AYAHS.length + ' ayahs):');
let allCovered = true;
for (const key of ALL_AYAHS) {
  const parts = key.split(':').map(Number);
  const a = getAyah(parts[0], parts[1]);
  const taCount = countRealWordsWithTA(a.textIndopak);
  const registeredCount = TA_MUTLAQ_POSITIONS.filter(function (p) { return p.surah === parts[0] && p.ayah === parts[1]; }).length;
  const batchCount = (BATCH[key] || []).length;
  const excludedCount = EXCLUDED_COUNT[key] || 0;
  const covered = (registeredCount + batchCount + excludedCount) === taCount;
  if (!covered) allCovered = false;
  check(
    key + ': registered(' + registeredCount + ') + batch(' + batchCount + ') + accounted-excluded(' + excludedCount + ') === raw ط count(' + taCount + ')',
    covered
  );
}
check('all ' + ALL_AYAHS.length + ' ayahs fully accounted for (zero unexplained gap in this batch)', allCovered);

console.log('\nRendered Uthmani markup carries has-default-waqf for every batch word\n(none of the 157 batch words are an ayah\'s last word — verified above via\nthe accounted-exclusions list, which covers the 10 real last-word cases\nseparately):');
const RM = loadReaderManager('uthmani');
let allRendered = true;
for (const key in BATCH) {
  const parts = key.split(':').map(Number);
  const a = getAyah(parts[0], parts[1]);
  const html = RM.renderAyahWords(a);
  for (const w of BATCH[key]) {
    // BATCH numbers are 1-based (waqf-positions.js / DEFAULT_MARK_MANUAL_ADDITIONS
    // convention), but rendered data-key uses a 0-based word index.
    const wordKey = parts[0] + ':' + parts[1] + ':' + (w - 1);
    const ok = hasDefaultWaqfClass(html, wordKey);
    if (!ok) allRendered = false;
    check(key + ' word ' + w + ' (data-key ' + wordKey + ') carries has-default-waqf', ok, 'word html: ' + wordHtml(html, wordKey));
  }
}
check('all 157 batch words render as ط (blue)', allRendered);

console.log('\n46:15 word 39 ("ذُرِّيَّتِيٓۖ") renders as ج (JEEM/green), not ط —\nresolved hand-off between the two colliding marks in the raw text:');
{
  const a = getAyah(46, 15);
  const html = RM.renderAyahWords(a);
  const wordKey = '46:15:38'; // 0-based (word 39, 1-based)
  const isJeem = hasDefaultJeemClass(html, wordKey);
  const isTaMutlaq = hasDefaultWaqfClass(html, wordKey);
  check('46:15 word 39 carries has-default-jeem', isJeem, 'word html: ' + wordHtml(html, wordKey));
  check('46:15 word 39 does NOT carry has-default-waqf (ط)', !isTaMutlaq, 'word html: ' + wordHtml(html, wordKey));
}

console.log('\n10 last-word ayahs correctly suppressed (no has-default-waqf at the\nayah\'s final word, same standing rule as every other TA_MUTLAQ source):');
{
  const lastWordAyahs = [[5, 46], [69, 3], [70, 7], [79, 30], [79, 42], [90, 12], [91, 10], [101, 3], [101, 10], [104, 5]];
  let allSuppressed = true;
  for (const [s, ay] of lastWordAyahs) {
    const a = getAyah(s, ay);
    const uWordCount = a.text.trim().split(/\s+/).filter(Boolean).length;
    const html = RM.renderAyahWords(a);
    const wordKey = s + ':' + ay + ':' + (uWordCount - 1);
    const ok = !hasDefaultWaqfClass(html, wordKey);
    if (!ok) allSuppressed = false;
    check(s + ':' + ay + ' last word (data-key ' + wordKey + ') correctly does NOT carry has-default-waqf', ok, 'word html: ' + wordHtml(html, wordKey));
  }
  check('all 10 last-word ayahs correctly suppressed', allSuppressed);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail > 0 ? 1 : 0);
