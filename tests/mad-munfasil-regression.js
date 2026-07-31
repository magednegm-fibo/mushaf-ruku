// Regression test for readerManager.js's مد منفصل (general) highlighting.
//
// Node script, no build step:
//   node tests/mad-munfasil-regression.js
//   node tests/mad-munfasil-regression.js --dir /path/to/unzipped-release
//
// Exit code 0 if every check passes, 1 if any fails. Loads readerManager.js
// in a minimal sandbox (see _load-reader-manager.js) and data.js as plain
// JSON-ish text, then renders each ayah through the same
// renderAyahTextWithHighlight() pipeline the app uses.
//
// Guard suite: the old blanket general مد منفصل highlighting was
// permanently removed. Only the curated khilaf tables (مواضع اختلاف
// روضة الحفاظ — see mad-munfasil-indopak-regression.js) keep the purple
// --khilaf-highlight colour. Ordinary مد منفصل text must render in plain
// ink with no "mad-munfasil" class, in BOTH script modes.
//
// This suite asserts that the "mad-munfasil" class is never produced for
// ordinary cases (يَـٰٓـَٔادَمُ, يَـٰٓأَيُّهَا, هَـٰٓؤُلَآءِ, and plain
// general مد منفصل), while كَلَّآ's glyph-position span
// (kalla-madda-glyph) remains present for its rendering fix.
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
// 1. يَـٰٓـَٔادَمُ ("يا آدم") -- must NOT carry mad-munfasil anymore.
// ---------------------------------------------------------------------
console.log('يَـٰٓـَٔادَمُ (يا آدم) -- 5 occurrences, mad-munfasil now removed:');
const YA_ADAM_CASES = [[2, 33], [2, 35], [7, 19], [20, 117], [20, 120]];
for (const [surah, ayah] of YA_ADAM_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasMunfasilTatweelSeat = /class="[^"]*tatweel-seat[^"]*mad-munfasil[^"]*"/.test(html);
  check(
    surah + ':' + ayah + ' -- يا آدم tatweel-seat span no longer carries mad-munfasil',
    !hasMunfasilTatweelSeat,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

// ---------------------------------------------------------------------
// 2. يَـٰٓأَيُّهَا / هَـٰٓؤُلَآءِ -- must NOT carry mad-munfasil anymore.
// ---------------------------------------------------------------------
console.log('\nيَـٰٓأَيُّهَا / هَـٰٓؤُلَآءِ cases (mad-munfasil now removed):');
const YA_AYYUHA_CASES = [
  [22, 1],   // يَـٰٓأَيُّهَا ٱلنَّاسُ
  [24, 21],  // يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُواْ
];
for (const [surah, ayah] of YA_AYYUHA_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasMunfasilTatweelSeat = /class="[^"]*tatweel-seat[^"]*mad-munfasil[^"]*"/.test(html);
  check(
    surah + ':' + ayah + ' -- يَـٰٓأَيُّهَا tatweel-seat span no longer carries mad-munfasil',
    !hasMunfasilTatweelSeat,
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
    surah + ':' + ayah + ' -- هَـٰٓؤُلَآءِ tatweel-seat span no longer carries mad-munfasil',
    !hasMunfasilTatweelSeat,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

// ---------------------------------------------------------------------
// 3. General مد منفصل rule (unrelated to يا/ها) -- must NOT render any
//    mad-munfasil span anymore, anywhere in the whole ayah.
// ---------------------------------------------------------------------
console.log('\nGeneral مد منفصل rule (mad-munfasil now removed):');
const GENERAL_MUNFASIL_CASES = [
  [21, 25],  // وَمَآ أَرۡسَلۡنَا مِن قَبۡلِكَ مِن رَّسُولٍ إِلَّا نُوحِيٓ إِلَيۡهِ
];
for (const [surah, ayah] of GENERAL_MUNFASIL_CASES) {
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasMadMunfasilSpan = /class="[^"]*\bmad-munfasil\b[^"]*"/.test(html);
  check(
    surah + ':' + ayah + ' -- general مد منفصل no longer renders any mad-munfasil span',
    !hasMadMunfasilSpan,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

// ---------------------------------------------------------------------
// 4. Sanity: كَلَّآ (kalla-madda-glyph) is a SEPARATE, always-مد-منفصل
//    feature untouched by this change -- must still render its own glyph
//    span (a different class from "mad-munfasil", never affected by it).
// ---------------------------------------------------------------------
console.log('\nكَلَّآ (kalla-madda-glyph) -- separate feature, must still render:');
{
  const [surah, ayah] = [83, 18]; // كَلَّآ ۖ إِنَّ كِتَٰبَ ٱلۡأَبۡرَارِ
  const text = getAyahText(surah, ayah);
  const html = RM.renderAyahTextWithHighlight(text, null);
  const hasKallaGlyph = /class="kalla-madda-glyph"/.test(html);
  check(
    surah + ':' + ayah + ' -- كَلَّآ still renders its own kalla-madda-glyph span',
    hasKallaGlyph,
    'rendered HTML snippet: ' + html.slice(0, 200)
  );
}

// ---------------------------------------------------------------------
// 5. UPDATE (direct follow-up request): كَلَّآ's OWN coloring
//    (body.show-khilaf-highlight .kalla-madda-glyph { color: ... }) has also
//    been removed from style.css, in both script modes -- it wasn't one
//    of the five curated khilaf tables, so it now stays plain ink too,
//    same as the general مد منفصل text. This is a CSS-level check (no
//    HTML class involved -- .kalla-madda-glyph itself is untouched,
//    confirmed above; only its color rule is gone).
// ---------------------------------------------------------------------
console.log('\nكَلَّآ coloring removed from style.css (CSS-level check):');
const cssSrc = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const kallaColorRuleGone = !/body\.show-khilaf-highlight\s+\.kalla-madda-glyph\s*\{[^}]*color/.test(cssSrc);
check(
  'style.css -- .kalla-madda-glyph no longer has a color rule under body.show-khilaf-highlight',
  kallaColorRuleGone,
  'style.css still appears to color .kalla-madda-glyph'
);

process.exit(fail === 0 ? 0 : 1);
