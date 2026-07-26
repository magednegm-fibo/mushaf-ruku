// Regression test for extending SAKTA_HIGHLIGHT_WORDS / MUQATTAAT_MAD_WORDS /
// SEEN_AS_SAD_WORDS / MAD_FARQ_WORDS / TAJWEED_NOTE_WORDS ("مواضع اختلاف
// روضة الحفاظ" — disagreement points between the Rawdat al-Mu'addil and
// Shatibiyyah transmission paths) to Naskh/Indopak mode, not just Uthmani.
//
// Node script, no build step:
//   node tests/mad-munfasil-indopak-regression.js
//   node tests/mad-munfasil-indopak-regression.js --dir /path/to/unzipped-release
//
// Background: these five tables index words by position (tokenizeAyahWords()
// output) and were previously gated to Uthmani only, because Indopak's own
// tokenization was never checked against these specific ayahs. A full
// comparison (a.text vs a.textIndopak, tokenized independently) found that
// 22 of the 24 affected ayahs tokenize into the exact same word count/order
// in both scripts, so the same indices are safe to reuse directly — but two
// ayahs (2:245, 30:54) tokenize into MORE words in Indopak (extra
// standalone tokens for a rub'-el-hizb marker and floating waqf marks that
// aren't glued to a neighbour the way they are in the Uthmani text), which
// would silently highlight the WRONG word there if the same indices were
// reused blindly. This is exactly the class of bug this suite exists to
// catch, per the project's regression-test-first rule.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadReaderManager } = require('./_load-reader-manager.js');

const dirArgIndex = process.argv.indexOf('--dir');
const rootDir = dirArgIndex !== -1 ? process.argv[dirArgIndex + 1] : path.join(__dirname, '..');

const dataSrc = fs.readFileSync(path.join(rootDir, 'data.js'), 'utf8');
const dataText = dataSrc.slice(dataSrc.indexOf('=', dataSrc.indexOf('window.JUZ_PAGES')) + 1)
  .trim().replace(/;\s*$/, '');
const PAGES = JSON.parse(dataText);

function findAyah(surah, ayah) {
  for (const page of PAGES) {
    for (const a of (page.ayahs || [])) {
      if (a.surah === surah && a.ayah === ayah) return a;
    }
  }
  throw new Error('Ayah ' + surah + ':' + ayah + ' not found in data.js');
}

const RM_uthmani = loadReaderManager(rootDir, 'uthmani');
const RM_indopak = loadReaderManager(rootDir, 'indopak');

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
// 1. The 22 verified-safe ayahs: same word count/order in both scripts,
//    so the highlight must now appear in Indopak mode too, at the exact
//    same word index, with the matching CSS class.
// ---------------------------------------------------------------------
console.log('Disagreement-word highlighting now active in Naskh/Indopak mode:');
const SAFE_CASES = [
  ['75:27', [1, 2], 'sakta-word'],
  ['83:14', [1, 2], 'sakta-word'],
  ['36:52', [5, 6], 'sakta-word'],
  ['18:1', [10], 'sakta-word'],
  ['18:2', [0], 'sakta-word'],
  ['19:1', [0], 'muqattaat-mad-word'],
  ['42:2', [0], 'muqattaat-mad-word'],
  ['68:1', [0], 'muqattaat-mad-word'],
  ['36:1', [0], 'muqattaat-mad-word'],
  ['52:37', [6], 'seen-as-sad-word'],
  ['88:22', [2], 'seen-as-sad-word'],
  ['7:69', [21], 'seen-as-sad-word'],
  ['10:51', [6], 'mad-farq-word'],
  ['10:91', [0], 'mad-farq-word'],
  ['6:143', [9], 'mad-farq-word'],
  ['6:144', [7], 'mad-farq-word'],
  ['10:59', [13], 'mad-farq-word'],
  ['27:59', [8], 'mad-farq-word'],
  ['12:11', [5], 'tajweed-note-word'],
  ['26:63', [10], 'tajweed-note-word'],
  ['27:36', [7], 'tajweed-note-word'],
  ['76:4', [3], 'tajweed-note-word'],
];
for (const [key, idxs, cls] of SAFE_CASES) {
  const [surah, ayah] = key.split(':').map(Number);
  const a = findAyah(surah, ayah);
  const html = RM_indopak.renderAyahWords(a);
  const words = html.split(/(?<=<\/span>)\s+(?=<span)/); // rough per-word split
  for (const i of idxs) {
    const hasCls = new RegExp('data-key="' + surah + ':' + ayah + ':' + i + '"').test(html) &&
      new RegExp('class="quran-word[^"]*' + cls + '[^"]*"\\s+data-key="' + surah + ':' + ayah + ':' + i + '"').test(html);
    check(
      key + ' idx=' + i + ' — Indopak word carries .' + cls,
      hasCls,
      'rendered HTML: ' + html
    );
  }
}

// ---------------------------------------------------------------------
// 2. The unsafe-by-INDEX ayahs: Indopak tokenization diverges from
//    Uthmani's word count here, so the old word-index lookup must stay
//    disabled for both. 30:54 has no fallback and must stay fully
//    UN-highlighted. 2:245 has a dedicated text-based fallback instead
//    (see section 5 below) — checked here only for the OTHER unrelated
//    classes, to confirm the fallback didn't accidentally cross-wire
//    into some other table.
// ---------------------------------------------------------------------
console.log('\nUnsafe-by-index ayahs — must not use the old index lookup:');
{
  const a = findAyah(30, 54);
  const html = RM_indopak.renderAyahWords(a);
  const stillUncolored = html.indexOf('tajweed-note-word') === -1;
  check(
    '30:54 — Indopak rendering has NO .tajweed-note-word (no fallback exists for this ayah)',
    stillUncolored,
    'rendered HTML: ' + html
  );
}
{
  const a = findAyah(2, 245);
  const html = RM_indopak.renderAyahWords(a);
  const noUnrelatedClasses = !/sakta-word|muqattaat-mad-word|mad-farq-word|tajweed-note-word/.test(html);
  check(
    '2:245 — Indopak rendering has none of the OTHER (unrelated) disagreement classes',
    noUnrelatedClasses,
    'rendered HTML: ' + html
  );
}

// ---------------------------------------------------------------------
// 3. Sanity: Uthmani mode is completely unaffected by this change,
//    including the 2 "unsafe" ayahs (which must still highlight
//    correctly in Uthmani — only their Indopak rendering is excluded).
// ---------------------------------------------------------------------
console.log('\nUthmani mode unaffected (must still pass, including the 2 unsafe ayahs):');
const UTHMANI_SANITY_CASES = [
  ['75:27', [1, 2], 'sakta-word'],
  ['2:245', [13], 'seen-as-sad-word'],
  ['30:54', [4, 9, 16], 'tajweed-note-word'],
];
for (const [key, idxs, cls] of UTHMANI_SANITY_CASES) {
  const [surah, ayah] = key.split(':').map(Number);
  const a = findAyah(surah, ayah);
  const html = RM_uthmani.renderAyahWords(a);
  for (const i of idxs) {
    const hasCls = new RegExp('class="quran-word[^"]*' + cls + '[^"]*"\\s+data-key="' + surah + ':' + ayah + ':' + i + '"').test(html);
    check(
      key + ' idx=' + i + ' — Uthmani word still carries .' + cls,
      hasCls,
      'rendered HTML: ' + html
    );
  }
}

// ---------------------------------------------------------------------
// 4. Sanity: general مد منفصل (MAD_MUNFASIL_REGEX etc.) must remain
//    Uthmani-only — this change must not touch that separate gate.
// ---------------------------------------------------------------------
console.log('\nGeneral مد منفصل still excluded from Indopak (must remain untouched):');
{
  const a = findAyah(21, 25); // وَمَآ أَرۡسَلۡنَا ... general مد منفصل case
  const html = RM_indopak.renderAyahWords(a);
  const hasGeneralMunfasil = /class="mad-munfasil"/.test(html);
  check(
    '21:25 — general مد منفصل span absent from Indopak rendering',
    !hasGeneralMunfasil,
    'rendered HTML: ' + html
  );
}

// ---------------------------------------------------------------------
// 5. The 2:245 text-based fallback (وَيَبۡصُۜطُ): the word itself must
//    now be colored in Indopak mode via the fallback, WITHOUT reusing
//    the old (unsafe) index 13 and without affecting 2:245's other
//    words or 30:54 (which stays excluded, untouched by this fallback).
// ---------------------------------------------------------------------
console.log('\n2:245 Indopak fallback (وَيَبۡصُۜطُ located by text, not index):');
{
  const a = findAyah(2, 245);
  const html = RM_indopak.renderAyahWords(a);
  const hasSeenSadWord = /class="quran-word seen-as-sad-word"/.test(html);
  check(
    '2:245 — exactly one .seen-as-sad-word span present in Indopak rendering',
    (html.match(/class="quran-word seen-as-sad-word"/g) || []).length === 1,
    'rendered HTML: ' + html
  );
  const coloredSpanMatch = html.match(/<span class="quran-word seen-as-sad-word" data-key="2:245:(\d+)">([\s\S]*?)<span class="waqf-mark"/);
  check(
    '2:245 — the colored span\'s own text is وَيَبۡصُۜطُ (not some other word)',
    !!coloredSpanMatch && coloredSpanMatch[2].indexOf('\u0628\u06E1') !== -1 && coloredSpanMatch[2].indexOf('\u0637') !== -1, // بۡ...ط survives inside the span regardless of nested waqf-sign tags
    'rendered HTML: ' + html
  );
  // Old index 13 in the 18-token Indopak tokenization is "يَقۡبِضُ" (a
  // DIFFERENT word) -- confirm it did NOT get the class.
  const idx13NotColored = !new RegExp('class="quran-word seen-as-sad-word" data-key="2:245:13"').test(html);
  check(
    '2:245 — the old (unsafe) index 13 itself is not what carries the class',
    idx13NotColored,
    'rendered HTML: ' + html
  );
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
