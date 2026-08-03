#!/usr/bin/env node
// =============================================================================
// search-normalization-regression.js
// فحوصات طبقة التطبيع/البحث المتسامح — تُشغَّل من جذر المشروع:
//   node tests/search-normalization-regression.js
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

function load(name) {
  const code = fs.readFileSync(path.join(root, name), 'utf8');
  // data.js / searchManager.js attach to window/global
  const sandbox = { console, window: {}, self: {} };
  // Minimal eval in shared scope
  return code;
}

eval(fs.readFileSync(path.join(root, 'data.js'), 'utf8').replace(/window\./g, 'global.'));
eval(fs.readFileSync(path.join(root, 'searchManager.js'), 'utf8').replace(/window\./g, 'global.'));

const SM = global.SearchManager;
const PAGES = global.JUZ_PAGES || global.JUZ_AMMA_PAGES;
if (!PAGES || !PAGES.length) {
  console.error('FAIL: no PAGES loaded from data.js');
  process.exit(1);
}
SM.init(PAGES);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + name);
  } else {
    fail++;
    console.log('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
  }
}

console.log('Section N1 — mid-word rasm layout spaces (2:72 فادّارأتم)');
{
  const r = SM.searchAyahs('فادارأتم', false);
  check('tolerant فادارأتم finds 2:72', r.some(e => e.surah === 2 && e.ayah === 72), 'hits=' + r.length);
  const r2 = SM.searchAyahs('فاداراتم', false);
  check('tolerant فاداراتم finds 2:72', r2.some(e => e.surah === 2 && e.ayah === 72));
  const exact = SM.searchAyahs('فادارأتم', true);
  check('exact فادارأتم does not false-match via modern spelling', exact.length === 0, 'hits=' + exact.length);
}

console.log('Section N2 — إسرائيل (hamza-as-yeh interpretation)');
{
  const r = SM.searchAyahs('إسرائيل', false);
  check('tolerant إسرائيل ≥ 40 hits', r.length >= 40, 'hits=' + r.length);
  check('includes 2:40', r.some(e => e.surah === 2 && e.ayah === 40));
  const partial = SM.searchAyahs('اسر', false);
  check('partial اسر still works', partial.length >= 40);
  const exact = SM.searchAyahs('إسرائيل', true);
  check('exact إسرائيل stays rasm-strict (0 hits)', exact.length === 0, 'hits=' + exact.length);
}

console.log('Section N3 — no regression on common tolerant queries');
{
  check('شيء', SM.searchAyahs('شيء', false).length >= 10);
  check('الصلاة', SM.searchAyahs('الصلاة', false).length >= 5);
  check('الزكاة', SM.searchAyahs('الزكاة', false).length >= 3);
  check('الرحمن', SM.searchAyahs('الرحمن', false).length >= 5);
  check('الله', SM.searchAyahs('الله', false).length >= 50);
}

console.log('Section N4 — normalizeArabic strips layout controls, keeps real spaces');
{
  const N = SM.normalizeArabic;
  // Thin space must not survive as a boundary between ر and ت
  const withThin = 'فادر\u2009تم';
  check('U+2009 thin space stripped', N(withThin) === 'فادرتم', N(withThin));
  check('regular space preserved', N('فادر تم') === 'فادر تم', N('فادر تم'));
  check('word joiner stripped', N('فادر\u2060تم') === 'فادرتم', N('فادر\u2060تم'));
  check('ZWSP stripped', N('فادر\u200Bتم') === 'فادرتم', N('فادر\u200Bتم'));
}


console.log('Section N5 — شيء / شيئًا (tatweel-borne hamza + modern يئ)');
{
  const r = SM.searchAyahs('شيئا', false);
  check('tolerant شيئا finds hits', r.length >= 1, 'hits=' + r.length);
  check('tolerant شيئا includes 2:48', r.some(e => e.surah === 2 && e.ayah === 48), r.slice(0,5).map(e=>e.surah+':'+e.ayah).join(','));
  const r2 = SM.searchAyahs('شيئًا', false);
  check('tolerant شيئًا finds hits', r2.length >= 1, 'hits=' + r2.length);
  const r3 = SM.searchAyahs('شيا', false);
  check('tolerant شيا still finds hits', r3.length >= 1, 'hits=' + r3.length);
  const r4 = SM.searchAyahs('شيء', false);
  check('tolerant شيء still finds hits', r4.length >= 10, 'hits=' + r4.length);
  // Digraph rule unit checks
  const N = SM.normalizeArabic;
  check('يئ collapses to يء', N('شيئا') === 'شيءا', N('شيئا'));
  check('tatweel+hamza becomes ء', N('شَيۡـٔٗا') === 'شيءا', N('شَيۡـٔٗا'));
  check('lone ئ still → ي (أولئك)', N('أولئك') === 'اوليك', N('أولئك'));
}

console.log('\n==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail ? 1 : 0);
