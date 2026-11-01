'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const reader = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'settings.js'), 'utf8');
const checks = [
  ['disabled reminder setting forces all ayah heads to circles', /function shouldRenderAyahHeadAsCircle\(surah, ayah\)\s*\{\s*if\(state && state\.showWaqfMarksUthmani === false\) return true;\s*return isMadinahCircleHead\(surah, ayah\);\s*\}/.test(reader)],
  ['enabled reminder setting retains source-of-truth position set', /return isMadinahCircleHead\(surah, ayah\);/.test(reader)],
  ['initial render and refresh both use the same shape decision', (reader.match(/shouldRenderAyahHeadAsCircle\(surah, ayah\)/g) || []).length >= 2 && /shouldRenderAyahHeadAsCircle\(s, a\)/.test(reader)],
  ['settings change refreshes currently rendered ayah heads', /window\.ReaderManager\.refreshAyahMarkerShapes\(\)/.test(settings)],
  ['setting remains responsible for existing reminder visibility', /classList\.toggle\('hide-waqf-marks', !show\)/.test(settings)]
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`Result: ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
