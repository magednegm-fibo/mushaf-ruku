'use strict';
/**
 * ACTIVE: MADINAH_CIRCLE_HEADS is Source of Truth for ayah-number circle vs star.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

eval(fs.readFileSync(path.join(root, 'data.js'), 'utf8').replace(/window\./g, 'global.'));
eval(fs.readFileSync(path.join(root, 'madinah-circle-heads.js'), 'utf8').replace(/window\./g, 'global.').replace(/globalThis/g, 'global'));
const SET = global.MADINAH_CIRCLE_HEADS;

const uniq = new Set();
for (const page of global.JUZ_PAGES) {
  for (const ay of page.ayahs || []) uniq.add(ay.surah + ':' + ay.ayah);
}

const samplesCircle = ['1:1', '1:7', '2:5', '2:6', '2:7', '2:10'];
const samplesStar = ['1:2', '1:3', '1:4', '1:5', '1:6', '2:1'];

let invalid = 0;
for (const k of SET) {
  const m = /^(\d+):(\d+)$/.exec(k);
  if (!m) invalid++;
  else {
    const s = +m[1], a = +m[2];
    if (s < 1 || s > 114 || a < 1 || !uniq.has(k)) invalid++;
  }
}

console.log('=== MADINAH CIRCLE HEADS REGRESSION ===');
console.log('Circle count =', SET.size);
console.log('Invalid positions =', invalid);
samplesCircle.forEach(k => console.log('  CIRCLE', k, SET.has(k) ? 'Circle' : 'FAIL'));
samplesStar.forEach(k => console.log('  STAR  ', k, SET.has(k) ? 'FAIL' : 'Star'));

const circleOk = samplesCircle.every(k => SET.has(k));
const starOk = samplesStar.every(k => !SET.has(k));
const pass = SET.size === 4035 && invalid === 0 && circleOk && starOk;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
