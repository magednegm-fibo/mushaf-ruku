// scan_alif_split.js
// Scans data.js for the same bug class as the known KNOWN_SPLIT_WORD_FRAGMENTS
// entries: a word whose leading "ا" (alif, possibly carrying a diacritic like
// فتحة/ألف خنجرية, and possibly preceded by a one-letter prefix و/ف) got
// separated from the rest of the word by a genuine U+0020 space, with the
// rest of the word starting with ل (lam) -- i.e. the "ال" definite-article
// shape (or the آتى/اَلَّا/اَكّٰلُوۡنَ family) broken across two tokens.
//
// This mirrors the exact shape of the already-confirmed fragments in
// readerManager.js:
//   "اَ لَّا", "اَ لَّذِيۡنَ", "اَ كّٰلُوۡنَ", "وَاَ لۡقَيۡنَا", "اٰ ..." (n/a here, no ل)
//
// Heuristic (intentionally narrow, to avoid flagging genuine two-word
// sequences like "قَالَ لَهُ" or "يَا لَيْتَ"):
//   - token1's BASE letters (diacritics stripped) are length 1 or 2
//   - token1's base letters end in ا
//   - if length 2, the first base letter must be و or ف (the only
//     confirmed prefix pattern so far)
//   - token2's first base letter is ل
//
// Output is a review list only -- nothing is written back to data.js or
// readerManager.js. Confirm each hit against the real mushaf, then add
// approved fragments to KNOWN_SPLIT_WORD_FRAGMENTS by hand.

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data.js');
const src = fs.readFileSync(dataPath, 'utf8');

// data.js does `window.JUZ_PAGES = [ ... ]` — grab the array literal via the
// browser-global assignment, evaluated in an isolated sandbox (no network,
// no other globals) rather than touched/parsed by hand.
const sandbox = { window: {} };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const pages = sandbox.window.JUZ_PAGES;
if (!Array.isArray(pages)) {
  console.error('Could not locate window.JUZ_PAGES array in data.js');
  process.exit(1);
}

function stripMarks(token) {
  return token.normalize('NFC').replace(/\p{M}/gu, '');
}

function isCandidateFirst(base) {
  if (base.length === 1) return base === 'ا';
  if (base.length === 2) return base[1] === 'ا' && (base[0] === 'و' || base[0] === 'ف');
  return false;
}

function isCandidateSecond(base) {
  return base.length > 0 && base[0] === 'ل';
}

function scanField(text, fieldName, surah, ayah, hits) {
  if (!text) return;
  const tokens = text.split(' '); // raw U+0020 split only, same signal the bug itself uses
  for (let i = 0; i < tokens.length - 1; i++) {
    const t1 = tokens[i];
    const t2 = tokens[i + 1];
    if (!t1 || !t2) continue;
    const b1 = stripMarks(t1);
    const b2 = stripMarks(t2);
    if (isCandidateFirst(b1) && isCandidateSecond(b2)) {
      hits.push({
        surah, ayah, field: fieldName,
        fragment: t1 + ' ' + t2,
        t1, t2,
        context: text
      });
    }
  }
}

const hits = [];
for (const page of pages) {
  if (!page.ayahs) continue;
  for (const a of page.ayahs) {
    scanField(a.textIndopak, 'textIndopak', a.surah, a.ayah, hits);
    scanField(a.text, 'text', a.surah, a.ayah, hits);
  }
}

// Group by unique fragment text so repeats across ayaat collapse to one
// review line, per how KNOWN_SPLIT_WORD_FRAGMENTS itself dedupes (a single
// fragment string covers every occurrence via .split(frag).join(...)).
const byFragment = new Map();
for (const h of hits) {
  if (!byFragment.has(h.fragment)) byFragment.set(h.fragment, []);
  byFragment.get(h.fragment).push(h);
}

// Read straight from readerManager.js rather than keeping a second,
// easily-stale copy of the list in this file — this must always reflect
// whatever KNOWN_SPLIT_WORD_FRAGMENTS actually contains right now.
const rmSrc = fs.readFileSync(path.join(__dirname, '..', 'readerManager.js'), 'utf8');
const rmMatch = rmSrc.match(/KNOWN_SPLIT_WORD_FRAGMENTS = \[(.*?)\];/s);
const alreadyKnown = new Set(rmMatch ? JSON.parse('[' + rmMatch[1] + ']') : []);

console.log('=== Candidate alif/hamza mid-word split fragments (review before adding) ===\n');
let newCount = 0;
for (const [fragment, occ] of byFragment.entries()) {
  const known = alreadyKnown.has(fragment);
  if (known) continue; // don't re-report what's already handled
  newCount++;
  const refs = occ.map(o => `${o.surah}:${o.ayah}(${o.field})`).join(', ');
  console.log(`FRAGMENT: "${fragment}"`);
  console.log(`  occurrences (${occ.length}): ${refs}`);
  console.log(`  sample context: ${occ[0].context}`);
  console.log('');
}

if (newCount === 0) {
  console.log('No new candidates found beyond the already-confirmed KNOWN_SPLIT_WORD_FRAGMENTS list.');
} else {
  console.log(`\nTotal new candidate fragments: ${newCount}`);
}
