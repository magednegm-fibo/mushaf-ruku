'use strict';
/**
 * ACTIVE official regression: table (5622) === rendered Madinah coloring + specials + khilaf exclusions.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

eval(fs.readFileSync(path.join(root, 'data.js'), 'utf8').replace(/window\./g, 'global.'));
const rows = require(path.join(root, 'madinah-sajawandi.js'));

const ALLOWED = new Set(['ط','ج','ص','ز','ق','قف','م']);
const EXPECTED = { 'ط':3520, 'ج':1571, 'ز':174, 'ص':90, 'قف':92, 'م':85, 'ق':59 };

const table = new Map();
const counts = {};
let duplicates = 0, conflicts = 0, invalidIndexes = 0, invalidMarks = 0;

const ayahLen = new Map();
for (const page of global.JUZ_PAGES) {
  for (const ay of (page.ayahs || [])) {
    ayahLen.set(ay.surah + ':' + ay.ayah, String(ay.text || '').split(/\s+/).filter(Boolean).length);
  }
}

for (const r of rows) {
  const key = r.s + ':' + r.a + ':' + r.w;
  if (!ALLOWED.has(r.m)) invalidMarks++;
  if (table.has(key)) {
    duplicates++;
    if (table.get(key) !== r.m) conflicts++;
  } else table.set(key, r.m);
  counts[r.m] = (counts[r.m] || 0) + 1;
  const n = ayahLen.get(r.s + ':' + r.a) || 0;
  if (r.w < 1 || r.w > n) invalidIndexes++;
}

// Simulate NEW render: uthmani tokenize + table lookup (1-based)
const rendered = new Map();
for (const page of global.JUZ_PAGES) {
  for (const ay of (page.ayahs || [])) {
    const words = String(ay.text || '').split(/\s+/).filter(Boolean);
    for (let idx = 0; idx < words.length; idx++) {
      const key = ay.surah + ':' + ay.ayah + ':' + (idx + 1);
      const m = table.get(key);
      if (m) rendered.set(key, m);
    }
  }
}

let samePos = 0, sameMark = 0, diffs = 0;
for (const [k, m] of table) {
  if (!rendered.has(k)) diffs++;
  else { samePos++; if (rendered.get(k) === m) sameMark++; else diffs++; }
}
for (const [k] of rendered) {
  if (!table.has(k)) diffs++;
}

const specialExpect = {
  '4:171:28':'ج','7:187:15':'م','12:96:9':'ج','47:4:20':'ج',
  '27:44:17':'ط','65:2:24':'ط'
};
const specialAbsent = ['2:245:14','7:69:22','18:1:11','36:1:1','36:52:6','52:37:7'];
let specialOk = true;
for (const [k, exp] of Object.entries(specialExpect)) {
  if (rendered.get(k) !== exp) specialOk = false;
}
for (const k of specialAbsent) {
  if (rendered.has(k)) specialOk = false;
}

console.log('=== FINAL MADINAH SAJAWANDI REGRESSION ===');
console.log('');
console.log('Table entries:', rows.length);
console.log('');
console.log('Rendered colored positions:', rendered.size);
console.log('');
console.log('Same positions:', samePos);
console.log('Same marks:', sameMark);
console.log('');
console.log('Differences:', diffs);
console.log('');
console.log('Duplicates:', duplicates);
console.log('Conflicts:', conflicts);
console.log('Invalid indexes:', invalidIndexes);
console.log('Invalid marks:', invalidMarks);
console.log('');
['ط','ج','ز','ص','قف','م','ق'].forEach(m => console.log(m + ' =', counts[m] || 0));
console.log('');
console.log('Special cases:', specialOk ? 'PASS' : 'FAIL');
const pass = rows.length === 5622 && rendered.size === 5622 && diffs === 0 &&
  duplicates === 0 && conflicts === 0 && invalidIndexes === 0 && invalidMarks === 0 && specialOk;
console.log('');
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
