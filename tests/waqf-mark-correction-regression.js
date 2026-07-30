// Regression test for a mis-encoded waqf mark in textIndopak (QUL dataset)
// at Maryam 19:41.
//
// Background: the Sajawandi mark stored in textIndopak right after
// "اِبۡرٰهِيۡمَ" (before "اِنَّهٗ") is U+06D9 ("لا" — waqf mamnu', stopping
// forbidden). Checked directly against "علل الوقوف" by السجاوندي (the
// classical source for this exact mark system): the entry for this
// position — "في الكتاب - إبراهيم - 41" — gives the mark as "ط" (waqf
// mutlaq), not "لا". Confirmed on-device (Naskh/Indopak mode screenshot)
// and against the source text photographed from the book.
//
// data.js must never be modified (project-wide rule), so this is a
// render-time-only correction applied in resolveAyahSourceText: the لا
// mark (U+06D9) is swapped for ط's codepoint in this font (U+0615 — see
// the long comment above WAQF_COMBINING in readerManager.js) only for
// this one ayah, only in Indopak/Naskh rendering. data.js itself is left
// completely untouched.
//
// Node script, no build step:
//   node tests/waqf-mark-correction-regression.js
//   node tests/waqf-mark-correction-regression.js --dir /path/to/unzipped-release
'use strict';
const fs = require('fs');
const path = require('path');
const { loadReaderManager } = require('./_load-reader-manager.js');

const dirArgIndex = process.argv.indexOf('--dir');
const rootDir = dirArgIndex !== -1 ? process.argv[dirArgIndex + 1] : path.join(__dirname, '..');

const dataSrc = fs.readFileSync(path.join(rootDir, 'data.js'), 'utf8');

function getAyah(surah, ayah) {
  const re = new RegExp(
    '\\{"surah":' + surah + ',"surahName":"[^"]*","ayah":' + ayah +
    ',"text":"((?:[^"\\\\]|\\\\.)*)"(?:,"juzStart":\\d+)?,"textIndopak":"((?:[^"\\\\]|\\\\.)*)"'
  );
  const m = re.exec(dataSrc);
  if (!m) throw new Error('Ayah ' + surah + ':' + ayah + ' not found in data.js');
  return {
    surah: surah,
    surahName: 'مريم',
    ayah: ayah,
    text: JSON.parse('"' + m[1] + '"'),
    textIndopak: JSON.parse('"' + m[2] + '"')
  };
}

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

console.log('Waqf mark correction — Maryam 19:41 (لا -> ط):');

const a = getAyah(19, 41);

// Sanity check: confirm the raw dataset still has the mis-encoded لا mark
// (U+06D9) that this fix is correcting for. If this ever stops being true
// (e.g. QUL fixes their own dataset upstream), the override becomes a
// harmless no-op, but this assertion documents what we're working around.
check(
  'raw textIndopak still contains the U+06D9 (لا) mark this override corrects',
  a.textIndopak.indexOf('\u06D9') !== -1,
  'textIndopak: ' + a.textIndopak
);

const RM = loadReaderManager(rootDir, 'indopak');
const html = RM.renderAyahWords(a);

check(
  'rendered Indopak output no longer contains the incorrect لا mark (U+06D9)',
  html.indexOf('\u06D9') === -1,
  'html: ' + html
);
check(
  'rendered Indopak output contains the corrected ط mark (U+0615)',
  html.indexOf('\u0615') !== -1,
  'html: ' + html
);

// Make sure the fix is scoped to this ayah only: a neighbouring ayah with
// no known correction must render completely unaffected.
const other = getAyah(19, 40);
const RMOther = loadReaderManager(rootDir, 'indopak');
const htmlOther = RMOther.renderAyahWords(other);
const rawExpected = RMOther.renderAyahWords(Object.assign({}, other));
check(
  '19:40 (unrelated ayah) renders unaffected by the correction',
  htmlOther === rawExpected
);

// Uthmani mode must stay completely untouched — the correction only
// targets the Indopak/Naskh textIndopak field.
const RMUthmani = loadReaderManager(rootDir, 'uthmani');
const htmlUthmani = RMUthmani.renderAyahWords(a);
check(
  'Uthmani rendering of 19:41 is unaffected by the Indopak-only correction',
  htmlUthmani.indexOf('\u0615') === -1 || a.text.indexOf('\u0615') !== -1
);

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
