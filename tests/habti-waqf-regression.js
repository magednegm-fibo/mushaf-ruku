#!/usr/bin/env node
// =============================================================================
// habti-waqf-regression.js — يتحقق من سلامة نظام الوقف الهبطي بالكامل:
// بيانات data/habti-stops.json، تزامنها مع habti-waqf-data.js المولَّد،
// وعدم وجود أي تعارض مع الأنظمة الأخرى (WAQF_POSITIONS، كلمات الخلاف
// البنفسجية، رؤوس الآي لغير الكوفيين). راجع docs/habti-waqf-store.md.
//   node tests/habti-waqf-regression.js
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

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

// --- تحميل data.js وتوكينة الآيات الحقيقية (نفس نسخة tools/tokenize.js) ---
eval(fs.readFileSync(path.join(root, 'data.js'), 'utf8').replace(/window\./g, 'global.'));
const PAGES = global.JUZ_PAGES;

const KNOWN_SPLIT_WORD_FRAGMENTS = ["اٰ تُوۡهُمۡ", "اٰ تَيۡتُمُوۡهُنَّ", "اٰ تُوا", "اٰ تُوۡهُنَّ", "اٰ لَۤاءَ", "اٰ تُہُمَا", "ذٰ لِكَ", "ذٰ لِكُ", "اَ لَّا", "اَ لَّذِيۡنَ", "اَ كّٰلُوۡنَ", "وَاَ لۡقَيۡنَا", "اَ لِيۡمٌ‏", "اَ لِيۡمٍ‏", "فَاَ لَّفَ", "اَ لِيۡمًا‏", "اَ لۡقٰٓى", "اَ لۡقٰٮهَاۤ", "اَ لِيۡمًا", "اَ لۡيَوۡمَ", "اَ لِيۡمٌۢ", "اَ لۡفًا", "اَ لِيۡمٍۙ‏", "اَ لۡحَمۡدُ", "اَ لَّنۡ", "اَ لَمۡ", "وَاَ لۡقِ", "اَ لِيۡمٍ‏", "اَ لۡمُلۡكُ", "اَ لِيۡمًا", "فَاَ لۡقٰى", "فَاَ لۡقِيۡهِ", "اَ لۡقِ", "اَ لۡفَ", "وَاَ لۡقٰى", "اَ لِيۡمًا‏", "اَ لۡحَـقۡتُمۡ", "اَ لۡوَانُهٗ", "اَ لَيۡسَ", "اَ لِيۡمٌۙ‏", "فَاَ لۡقِيٰهُ"];
const KNOWN_SPLIT_PLACEHOLDER = '\u2061';
function joinKnownSplitWords(s) {
  KNOWN_SPLIT_WORD_FRAGMENTS.forEach(function (frag) {
    s = s.split(frag).join(frag.replace(' ', KNOWN_SPLIT_PLACEHOLDER));
  });
  return s;
}
const MIDWORD_SPACE_PLACEHOLDER = '\u2060';
const MIDWORD_SPACE_REGEX = /\s(?=[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED])/g;
function tokenizeAyahWords(rawText) {
  let src = joinKnownSplitWords(rawText);
  src = src.replace(MIDWORD_SPACE_REGEX, MIDWORD_SPACE_PLACEHOLDER);
  return src.split(/\s+/).filter(Boolean);
}

const ayahTextMap = {};
PAGES.forEach(function (page) {
  page.ayahs.forEach(function (a) {
    ayahTextMap[a.surah + ':' + a.ayah] = a.text;
  });
});

console.log('Section H1 — data/habti-stops.json الصلابة البنيوية');
const store = JSON.parse(fs.readFileSync(path.join(root, 'data/habti-stops.json'), 'utf8'));
const stops = store.stops;
{
  check('عدد المواضع > 0 ومتوافق مع batches', stops.length === store.batches.reduce(function(s,b){return s+b.count;},0) && stops.length > 0, 'actual=' + stops.length);
  const sourceIds = stops.map(s => s.source_id);
  check('لا تكرار في source_id', new Set(sourceIds).size === sourceIds.length);
  const posKeys = stops.map(s => s.surah + ':' + s.ayah + ':' + s.position);
  check('لا تكرار في surah:ayah:position', new Set(posKeys).size === posKeys.length);
  const sortable = stops.map(s => [s.surah, s.ayah, s.position]);
  const isSorted = sortable.every((v, i) => i === 0 ||
    (v[0] > sortable[i-1][0]) ||
    (v[0] === sortable[i-1][0] && v[1] > sortable[i-1][1]) ||
    (v[0] === sortable[i-1][0] && v[1] === sortable[i-1][1] && v[2] > sortable[i-1][2]));
  check('مرتّبة تصاعديًا (surah, ayah, position)', isSorted);
  store.batches.forEach(function (b) {
    const actual = stops.filter(s => s.batch === b.id).length;
    check('batch "' + b.id + '".count مطابق (' + b.count + ')', actual === b.count, 'actual=' + actual);
  });
}

console.log('Section H2 — كل كلمة مطابقة فعليًا لـ data.js عند موضعها');
{
  stops.forEach(function (s) {
    const key = s.surah + ':' + s.ayah;
    const words = tokenizeAyahWords(ayahTextMap[key] || '');
    const idx = s.position - 1;
    const actualWord = words[idx];
    check(key + ':' + s.position + ' (' + s.word + ')', actualWord === s.word,
      'data.js has "' + actualWord + '"');
    check(key + ':' + s.position + ' ليست آخر كلمة في الآية (يمنع استبعادها من العرض)',
      idx !== words.length - 1, 'ayah has ' + words.length + ' words, idx=' + idx);
  });
}

console.log('Section H3 — habti-waqf-data.js متزامن مع data/habti-stops.json');
{
  const generated = fs.readFileSync(path.join(root, 'habti-waqf-data.js'), 'utf8');
  const match = generated.match(/window\.HABTI_WAQF_STOPS\s*=\s*(\[[\s\S]*?\]);/);
  check('habti-waqf-data.js يحتوي HABTI_WAQF_STOPS', !!match);
  if (match) {
    const embedded = JSON.parse(match[1]);
    check('عدد المواضع المُضمَّنة مطابق', embedded.length === stops.length, 'embedded=' + embedded.length + ' stops=' + stops.length);
    const embeddedMatches = embedded.every(function (e, i) {
      return e.surah === stops[i].surah && e.ayah === stops[i].ayah &&
        e.position === stops[i].position && e.word === stops[i].word;
    });
    check('كل سجل مُضمَّن مطابق تمامًا لسجله في habti-stops.json', embeddedMatches);
  }
}

console.log('Section H4 — لا تعارض مع WAQF_POSITIONS (ط ص م ز ق قف ج — علامات المدينة)');
{
  eval(fs.readFileSync(path.join(root, 'waqf-positions.js'), 'utf8').replace(/window\./g, 'global.'));
  const habtiKeys = new Set(stops.map(s => s.surah + ':' + s.ayah + ':' + s.position));
  // WAQFA (وقفة) مصدرها مصحف النسخ/الإندوباك وليست علامة مصحف المدينة؛
  // لا تُحسب تعارضًا يمنع الوقف الهبطي (قرار مباشر 2026-08-04 بخصوص 2:286:43).
  const MADINAH_TYPES = new Set(['TA_MUTLAQ','SAD_RUKHSA','WAQF_LAZIM','ZAY_JAWAZ','QAD_QILA','QIF','JEEM']);
  const conflicts = (global.WAQF_POSITIONS || []).filter(function (p) {
    if (!MADINAH_TYPES.has(p.type)) return false;
    return habtiKeys.has(p.surah + ':' + p.ayah + ':' + p.word);
  });
  check('صفر تعارضات مع WAQF_POSITIONS (علامات المدينة)', conflicts.length === 0,
    JSON.stringify(conflicts));
}

console.log('Section H5 — لا تعارض مع كلمات الخلاف البنفسجية (khilaf-word)');
{
  const src = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');
  function extractVar(name) {
    const m = src.indexOf('var ' + name + ' = {');
    if (m === -1) return {};
    const start = src.indexOf('{', m);
    let depth = 0, i = start;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return eval('(' + src.slice(start, i + 1) + ')');
  }
  const tables = ['SAKTA_HIGHLIGHT_WORDS', 'MUQATTAAT_MAD_WORDS', 'SEEN_AS_SAD_WORDS', 'MAD_FARQ_WORDS', 'TAJWEED_NOTE_WORDS'];
  const conflicts = [];
  stops.forEach(function (s) {
    const key = s.surah + ':' + s.ayah;
    const idx = s.position - 1;
    tables.forEach(function (t) {
      const idxs = extractVar(t)[key];
      if (idxs && idxs.indexOf(idx) !== -1) conflicts.push(key + ':' + s.position + ' (' + t + ')');
    });
  });
  // استثناء معتمد (قرار مباشر 2026-08-04): 68:1:1 نٓ — يُعرض الوقف الهبطي
  // (نجمة صه خضراء) مع الإبقاء على التلوين البنفسجي لمدّ فواتح السور.
  // النافذة: «خلاف مع روضة الحفاظ [صه]» (بنفسجي + أخضر).
  const ALLOWED_KHILAF_HABTI = new Set(['68:1:1']);
  const realConflicts = conflicts.filter(function (c) {
    const key = c.split(' ')[0]; // "68:1:1 (MUQATTAAT_MAD_WORDS)"
    return !ALLOWED_KHILAF_HABTI.has(key);
  });
  check('صفر تعارضات مع جداول الخلاف البنفسجية (ما عدا الاستثناءات المعتمدة)', realConflicts.length === 0, realConflicts.join(', '));
  // تأكيد أن الاستثناءات المعتمدة ما زالت في المخزن
  ALLOWED_KHILAF_HABTI.forEach(function (k) {
    const parts = k.split(':').map(Number);
    const found = stops.some(function (s) {
      return s.surah === parts[0] && s.ayah === parts[1] && s.position === parts[2];
    });
    check('الاستثناء المعتمد موجود في المخزن: ' + k, found);
  });
}

console.log('Section H6 — لا تعارض مع رؤوس الآي لغير الكوفيين');
{
  eval(fs.readFileSync(path.join(root, 'non-kufi-heads.js'), 'utf8').replace(/window\./g, 'global.'));
  const conflicts = stops.filter(function (s) {
    const key = s.surah + ':' + s.ayah + ':' + (s.position - 1);
    return !!global.NON_KUFI_HEADS_SYM_UTHMANI[key];
  }).map(s => s.surah + ':' + s.ayah + ':' + s.position);
  check('صفر تعارضات مع NON_KUFI_HEADS_SYM_UTHMANI', conflicts.length === 0, conflicts.join(', '));
}

console.log('Section H7 — تكامل style.css/reader-reminders.js/readerManager.js');
{
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  check('style.css يحتوي قاعدة اللون الأخضر لـ has-default-habti',
    /\.has-default-habti[\s\S]{0,300}?color:\s*#2E7D32/.test(css) ||
    /has-default-habti[^{]*\{[^}]*color:\s*#2E7D32/.test(css));
  const rr = fs.readFileSync(path.join(root, 'reader-reminders.js'), 'utf8');
  check('reader-reminders.js يحتوي مدخل صه/صالح للوقف',
    rr.includes("cls: 'has-default-habti'") && rr.includes("symbol: 'صه'") && rr.includes("label: 'صالح للوقف'"));
  const rm = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');
  check('readerManager.js يحتوي buildHabtiWordMap ومصدرها HABTI_WAQF_STOPS',
    rm.includes('function buildHabtiWordMap()') && rm.includes('window.HABTI_WAQF_STOPS'));
  check('index.html يحمّل habti-waqf-data.js',
    fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('habti-waqf-data.js'));
  check('sw.js يخزّن habti-waqf-data.js مؤقتًا للعمل بلا اتصال',
    fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes('habti-waqf-data.js'));
}

console.log('');
console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail > 0 ? 1 : 0);
