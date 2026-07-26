// Regression test for readerManager.js's مد منفصل highlighting.
//
// Node script, no build step:
//   node tests/mad-munfasil-regression.js
//   node tests/mad-munfasil-regression.js --dir /path/to/unzipped-release
//
// Exit code 0 if every check passes, 1 if any fails. Loads readerManager.js
// in a minimal sandbox (see _load-reader-manager.js) and data.js as plain
// JSON-ish text, then renders each ayah through the same
// renderAyahTextWithHighlight() pipeline the app uses, and checks the
// resulting HTML for the expected "mad-munfasil" class placement.
//
// Covers:
//   1. The 5 "يَـٰٓـَٔادَمُ" (يا آدم) occurrences (2:33, 2:35, 7:19,
//      20:117, 20:120) that YA_HA_MUNFASIL_REGEX previously missed
//      because the hamza there rides on its own tatweel instead of
//      being a plain hamza letter.
//   2. A sample of the pre-existing "يَـٰٓأَيُّهَا" / "هَـٰٓؤُلَآءِ"
//      munfasil cases, to confirm the fix didn't regress them.
//   3. A sample of the general (non-يا/ها) مد منفصل rule, to confirm
//      that unrelated highlighting logic is untouched.
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
  // The source is JSON-string-escaped text sitting inside a JS source file;
  // wrapping it in quotes and JSON.parse-ing unescapes \u.... sequences etc.
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
// 1. يَـٰٓـَٔادَمُ ("يا آدم") — the reported bug. All 5 occurrences.
// ---------------------------------------------------------------------
console.log('يَـٰٓـَٔادَمُ (يا آدم) — 5 occurrences:');
const YA_ADAM_CASES = [[2, 33], [2, 35], [7, 19], [20, 117], [20, 120]];
for (const [surah, ayah] of YA_ADAM_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  // The tatweel-seat span immediately preceding the yaa/alef cluster
  // must now carry the mad-munfasil class.
  const hasMunfasilTatweelSeat = /class="tatweel-seat[^"]*mad-munfasil[^"]*"/.test(html) ||
                                  /class="tatweel-seat[^"]* mad-munfasil"/.test(html) ||
                                  /class="[^"]*tatweel-seat[^"]*mad-munfasil[^"]*"/.test(html);
  check(
    surah + ':' + ayah + ' — يا آدم tatweel-seat span carries mad-munfasil',
    hasMunfasilTatweelSeat,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

// ---------------------------------------------------------------------
// 2. Pre-existing يَـٰٓأَيُّهَا / هَـٰٓؤُلَآءِ cases still work.
// ---------------------------------------------------------------------
console.log('\nExisting يَـٰٓأَيُّهَا / هَـٰٓؤُلَآءِ cases (must still pass):');
const YA_AYYUHA_CASES = [
  [22, 1],   // يَـٰٓأَيُّهَا ٱلنَّاسُ
  [24, 21],  // يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُواْ
];
for (const [surah, ayah] of YA_AYYUHA_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasMunfasilTatweelSeat = /class="[^"]*tatweel-seat[^"]*mad-munfasil[^"]*"/.test(html);
  check(
    surah + ':' + ayah + ' — يَـٰٓأَيُّهَا tatweel-seat span still carries mad-munfasil',
    hasMunfasilTatweelSeat,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

const HAA_ULAA_CASES = [
  [21, 44],  // بَلۡ مَتَّعۡنَا هَـٰٓؤُلَآءِ
];
for (const [surah, ayah] of HAA_ULAA_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasMunfasilTatweelSeat = /class="[^"]*tatweel-seat[^"]*mad-munfasil[^"]*"/.test(html);
  check(
    surah + ':' + ayah + ' — هَـٰٓؤُلَآءِ tatweel-seat span still carries mad-munfasil',
    hasMunfasilTatweelSeat,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

// ---------------------------------------------------------------------
// 3. General مد منفصل rule (unrelated to يا/ها) still works.
// ---------------------------------------------------------------------
console.log('\nGeneral مد منفصل rule (sanity, unrelated code path):');
const GENERAL_MUNFASIL_CASES = [
  [21, 25],  // وَمَآ أَرۡسَلۡنَا مِن قَبۡلِكَ مِن رَّسُولٍ إِلَّا نُوحِيٓ إِلَيۡهِ
];
for (const [surah, ayah] of GENERAL_MUNFASIL_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasMadMunfasilSpan = /class="mad-munfasil"/.test(html);
  check(
    surah + ':' + ayah + ' — general مد منفصل still renders a mad-munfasil span',
    hasMadMunfasilSpan,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
