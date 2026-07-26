// Regression test for readerManager.js's كَلَّآ ("kalla" + madda) fix when
// the word is immediately followed by a waqf mark, with no space between
// them.
//
// Node script, no build step:
//   node tests/kalla-waqf-regression.js
//   node tests/kalla-waqf-regression.js --dir /path/to/unzipped-release
//
// Background (see the long comment above KALLA_MADDA_REGEX in
// readerManager.js): the maddah-position bug on كَلَّآ was fixed for 7 of
// the 13 total occurrences in the mushaf. The other 6 — 23:100, 26:62,
// 70:15, 70:39, 74:16, 89:21 — were explicitly left unfixed, because
// wrapWaqfSigns() runs BEFORE the كلا fix regex and, for these 6 words
// only, splits the ligature: the ك+fatha get flushed as plain text (a
// fresh "base letter" starts at the ل), while ل+shadda+fatha+alef+maddah
// get wrapped alone in <span class="waqf-sign">. That <span> tag sitting
// between ك and ل breaks the plain 7-codepoint contiguous match the
// original regex looks for, so it silently never fires on these 6.
//
// This reproduces the exact bug reported on-device (screenshot, 70:15,
// Uthmani/مصحف المدينة mode): the alef/madda renders in the wrong place
// over the لام, same defect already fixed elsewhere for the other 7.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadReaderManager } = require('./_load-reader-manager.js');

const dirArgIndex = process.argv.indexOf('--dir');
const rootDir = dirArgIndex !== -1 ? process.argv[dirArgIndex + 1] : path.join(__dirname, '..');

const dataSrc = fs.readFileSync(path.join(rootDir, 'data.js'), 'utf8');

function getAyahText(surah, ayah) {
  const re = new RegExp(
    '\\{"surah":' + surah + ',"surahName":"[^"]*","ayah":' + ayah + ',"text":"((?:[^"\\\\]|\\\\.)*)"'
  );
  const m = re.exec(dataSrc);
  if (!m) throw new Error('Ayah ' + surah + ':' + ayah + ' not found in data.js');
  return JSON.parse('"' + m[1] + '"');
}

const RM = loadReaderManager(rootDir, 'uthmani');

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

// ---------------------------------------------------------------------
// 1. The 6 waqf-adjacent كَلَّآ occurrences: reported bug (70:15) plus the
//    other 5 confirmed-same-shape cases.
// ---------------------------------------------------------------------
console.log('كَلَّآ immediately followed by a waqf mark — 6 occurrences:');
const KALLA_WAQF_CASES = [
  [23, 100],
  [26, 62],
  [70, 15], // reported directly, screenshot
  [70, 39],
  [74, 16],
  [89, 21],
];
for (const [surah, ayah] of KALLA_WAQF_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);

  const hasKallaCluster = /class="kalla-cluster"/.test(html);
  check(
    surah + ':' + ayah + ' — كَلَّآ gets wrapped in .kalla-cluster despite the following waqf mark',
    hasKallaCluster,
    'rendered HTML snippet: ' + html.slice(0, 220)
  );

  const hasMaddaGlyph = /class="kalla-madda-glyph"[^>]*>\u0653</.test(html);
  check(
    surah + ':' + ayah + ' — the trailing madda is redrawn via .kalla-madda-glyph',
    hasMaddaGlyph,
    'rendered HTML snippet: ' + html.slice(0, 220)
  );

  // The waqf mark itself must still render inside its own .waqf-sign span
  // (nested), so the existing waqf-mark sizing/positioning rules are
  // untouched by this fix.
  const hasNestedWaqfSign = /class="kalla-cluster">[\s\S]*class="waqf-sign">/.test(html);
  check(
    surah + ':' + ayah + ' — the waqf mark still renders inside a nested .waqf-sign span',
    hasNestedWaqfSign,
    'rendered HTML snippet: ' + html.slice(0, 220)
  );
}

// ---------------------------------------------------------------------
// 2. Sanity: the original 7 non-waqf-adjacent كَلَّآ occurrences (already
//    fixed) must still work exactly as before.
// ---------------------------------------------------------------------
console.log('\nExisting non-waqf-adjacent كَلَّآ cases (must still pass):');
const KALLA_PLAIN_CASES = [
  [83, 18],
  [83, 15],
];
for (const [surah, ayah] of KALLA_PLAIN_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasKallaCluster = /class="kalla-cluster"/.test(html);
  check(
    surah + ':' + ayah + ' — plain كَلَّآ still wrapped in .kalla-cluster',
    hasKallaCluster,
    'rendered HTML snippet: ' + html.slice(0, 220)
  );
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
