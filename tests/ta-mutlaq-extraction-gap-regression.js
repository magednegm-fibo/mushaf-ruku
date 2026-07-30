// Regression test for the "simple" batch of the ط (TA_MUTLAQ) extraction
// gap: waqf-positions.js is missing entries for U+0615 (ARABIC SMALL HIGH
// TAH) marks that genuinely exist in the raw Indopak text of data.js —
// confirmed first at 60:8 (see default-waqf-mutlaq-marks-regression.js),
// then tracked project-wide (171 ayahs, 248 missing marks; see
// تقرير-فجوات-علامة-ط.md). This test covers the 65 "simple" ayahs (a mark
// always attached to a clear word, no free-floating mark tokens) — 63 of
// them after excluding 19:41 (a reversed case, already fixed separately
// via WORD_MARK_CORRECTIONS) and 60:8 (already fixed via its own manual
// addition, covered by the other test file).
//
// Ground truth is recomputed directly from data.js (not hardcoded): for
// each of the 63 ayahs, count real Indopak words carrying U+0615, then
// require that count to equal (auto-registered TA_MUTLAQ entries) +
// (this batch's manual additions) for that ayah — i.e. full coverage,
// zero gap remaining. This must fail before the fix (gap present) and
// pass after (per the project's regression-first rule).
//
// Node script, no build step:
//   node tests/ta-mutlaq-extraction-gap-regression.js
//   node tests/ta-mutlaq-extraction-gap-regression.js --dir /path/to/unzipped-release
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

const waqfSandbox = { window: {} };
vm.createContext(waqfSandbox);
vm.runInContext(waqfPositionsSrc, waqfSandbox, { filename: 'waqf-positions.js' });
const TA_MUTLAQ_POSITIONS = waqfSandbox.window.WAQF_POSITIONS.filter(function (p) { return p.type === 'TA_MUTLAQ'; });

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '\n        ' + extra : '')); }
}

// --- The 63-ayah / 80-word batch (surah:ayah -> [uthmani word numbers]) ---
const BATCH = {
  '2:29': [15], '2:102': [66, 71], '2:243': [17], '2:258': [23, 38],
  '3:65': [13], '3:151': [16], '3:152': [20, 35], '3:153': [21],
  '3:162': [11], '3:197': [5], '4:97': [9, 14, 22, 25], '5:63': [9],
  '6:46': [16], '6:62': [6], '6:165': [14], '8:16': [18], '8:40': [6],
  '9:73': [9], '9:115': [13], '11:28': [15], '12:88': [17], '13:18': [25],
  '14:5': [14], '14:12': [9, 13], '14:21': [25], '16:28': [12],
  '16:70': [16], '16:76': [19], '18:37': [16], '20:11': [4],
  '22:37': [18], '22:78': [14, 17, 38], '24:40': [13, 17, 23],
  '24:57': [9], '28:32': [21], '28:77': [21], '32:20': [5],
  '40:56': [17, 19], '42:51': [19], '43:80': [7], '51:16': [4, 9],
  '57:12': [18], '57:15': [11, 13], '57:20': [25, 33], '57:23': [9],
  '58:19': [6, 9], '59:9': [24], '59:19': [7], '61:6': [24],
  '65:7': [13, 20], '66:9': [9], '74:27': [4], '74:47': [3], '77:14': [5],
  '79:43': [4], '79:44': [3], '79:45': [5], '82:18': [6], '83:8': [4],
  '83:19': [4], '88:1': [4], '89:15': [11], '97:2': [5]
};

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

console.log('Ground truth vs. batch coverage (63 ayahs):');
let allCovered = true;
for (const key in BATCH) {
  const parts = key.split(':').map(Number);
  const a = getAyah(parts[0], parts[1]);
  const taCount = countRealWordsWithTA(a.textIndopak);
  const registeredCount = TA_MUTLAQ_POSITIONS.filter(function (p) { return p.surah === parts[0] && p.ayah === parts[1]; }).length;
  const batchCount = BATCH[key].length;
  const covered = (registeredCount + batchCount) === taCount;
  if (!covered) allCovered = false;
  check(
    key + ': registered(' + registeredCount + ') + batch(' + batchCount + ') === raw ط count(' + taCount + ')',
    covered
  );
}
check('all 63 ayahs fully covered (zero remaining gap in this batch)', allCovered);

console.log('\nRendered Uthmani markup carries has-default-waqf for every batch word\n(except words that are the ayah\'s LAST word — the existing "لا تُوضع عند\nآخر كلمة في الآية" rule intentionally suppresses those, same as every\nother TA_MUTLAQ source; that is correct behavior, not a gap):');
const RM = loadReaderManager('uthmani');
let allRendered = true;
for (const key in BATCH) {
  const parts = key.split(':').map(Number);
  const a = getAyah(parts[0], parts[1]);
  const uWordCount = a.text.trim().split(/\s+/).filter(Boolean).length;
  const html = RM.renderAyahWords(a);
  for (const w of BATCH[key]) {
    // BATCH numbers are 1-based (waqf-positions.js / DEFAULT_MARK_MANUAL_ADDITIONS
    // convention), but rendered data-key uses a 0-based word index.
    const wordKey = parts[0] + ':' + parts[1] + ':' + (w - 1);
    const isLastWord = w === uWordCount;
    const ok = hasDefaultWaqfClass(html, wordKey);
    if (isLastWord) {
      if (ok) allRendered = false;
      check(key + ' word ' + w + ' (data-key ' + wordKey + ', LAST WORD) correctly does NOT carry has-default-waqf', !ok, 'word html: ' + wordHtml(html, wordKey));
    } else {
      if (!ok) allRendered = false;
      check(key + ' word ' + w + ' (data-key ' + wordKey + ') carries has-default-waqf', ok, 'word html: ' + wordHtml(html, wordKey));
    }
  }
}
check('all 80 batch words render correctly (colored, or intentionally suppressed at ayah end)', allRendered);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail > 0 ? 1 : 0);
