#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

eval(fs.readFileSync(path.join(root, 'data.js'), 'utf8').replace(/window\./g, 'global.'));
const rows = require(path.join(root, 'madinah-sajawandi.js'));

const ALLOWED = new Set(['ط', 'ج', 'ص', 'ز', 'ق', 'قف', 'م']);
const EXPECTED_TOTAL = 5622;
const EXPECTED = { 'ط': 3520, 'ج': 1580, 'ز': 181, 'ص': 91, 'قف': 92, 'م': 85, 'ق': 73 };

const ayahWordCount = new Map();
for (const page of global.JUZ_PAGES) {
  for (const ay of (page.ayahs || [])) {
    const n = String(ay.text || '').split(/\s+/).filter(Boolean).length;
    ayahWordCount.set(ay.surah + ':' + ay.ayah, n);
  }
}

let errors = 0;
function fail(msg) { console.error('FAIL:', msg); errors++; }

if (!Array.isArray(rows) || !rows.length) fail('MADINAH_SAJAWANDI empty');

const counts = {};
const seen = new Map();
let invalidIndexes = 0;
let invalidMarks = 0;
let duplicates = 0;
let conflicts = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r || typeof r.s !== 'number' || typeof r.a !== 'number' || typeof r.w !== 'number' || typeof r.m !== 'string') {
    fail('row ' + i + ' invalid shape');
    continue;
  }
  if (r.s < 1 || r.s > 114) fail('invalid surah ' + r.s + ' at row ' + i);
  if (r.a < 1) fail('invalid ayah ' + r.a + ' at row ' + i);
  if (!ALLOWED.has(r.m)) { invalidMarks++; fail('invalid mark "' + r.m + '" at ' + r.s + ':' + r.a + ':' + r.w); }
  const key = r.s + ':' + r.a + ':' + r.w;
  if (seen.has(key)) {
    duplicates++;
    if (seen.get(key) !== r.m) conflicts++;
    fail('duplicate position ' + key + ' (' + seen.get(key) + ' vs ' + r.m + ')');
  } else {
    seen.set(key, r.m);
  }
  counts[r.m] = (counts[r.m] || 0) + 1;
  const n = ayahWordCount.get(r.s + ':' + r.a);
  if (n == null) fail('unknown ayah ' + r.s + ':' + r.a);
  else if (r.w < 1 || r.w > n) { invalidIndexes++; fail('word index out of range ' + key + ' (ayah has ' + n + ' words)'); }
}

if (rows.length !== EXPECTED_TOTAL) fail('total ' + rows.length + ' !== ' + EXPECTED_TOTAL);
for (const [sym, n] of Object.entries(EXPECTED)) {
  if ((counts[sym] || 0) !== n) fail('count ' + sym + ': ' + (counts[sym] || 0) + ' !== ' + n);
}

console.log('Total =', rows.length);
['ط','ج','ز','ص','قف','م','ق'].forEach(function(m){ console.log(m, '=', counts[m] || 0); });
console.log('Duplicates =', duplicates);
console.log('Conflicts =', conflicts);
console.log('Invalid indexes =', invalidIndexes);
console.log('Invalid marks =', invalidMarks);

if (errors === 0) {
  console.log('OK validation passed');
  process.exit(0);
}
console.error('FAILED with', errors, 'error(s)');
process.exit(1);
