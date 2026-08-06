#!/usr/bin/env node
// =============================================================================
// no-sajawandi-heads-regression.js — يتحقق من سلامة
// data/no-sajawandi-heads.json (Single Source of Truth لرؤوس الآيات
// الدائرية): كل موضع فيه رأس آية صحيح موجود في data.js، وآخر كلمة في
// آيته خالية فعليًا من كل أنواع علامات الوقف السجاوندي الثمانية
// (WAQF_POSITIONS + الرموز الثمانية المباشرة)، بلا تكرار وبلا أي موضع
// حقيقي مفقود من القائمة.
//   node tests/no-sajawandi-heads-regression.js
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

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

// --- data.js ---
eval(fs.readFileSync(path.join(root, 'data.js'), 'utf8').replace(/window\./g, 'global.'));
const PAGES = global.JUZ_PAGES;
const ayahText = {};
PAGES.forEach(function (p) {
  p.ayahs.forEach(function (a) {
    const key = a.surah + ':' + a.ayah;
    if (!(key in ayahText)) ayahText[key] = a.text;
  });
});

// --- WAQF_POSITIONS ---
eval(fs.readFileSync(path.join(root, 'waqf-positions.js'), 'utf8').replace(/window\./g, 'global.'));
const WAQF_POSITIONS = global.WAQF_POSITIONS;
const waqfLookup = {};
WAQF_POSITIONS.forEach(function (p) {
  const key = p.surah + ':' + p.ayah + ':' + p.word;
  (waqfLookup[key] = waqfLookup[key] || []).push(p.type);
});

const SAJAWANDI_CODEPOINTS = [0x0615, 0x06D6, 0x06D7, 0x06D8, 0x06D9, 0x06DA, 0x06DB, 0x06DC];
// رموز PUA الخاصة بعلامات الوقف السجاوندي في خط PDMS Saleem (مصحف النسخ):
// E01A=ز، E01B=ص، E01C=ق، E01E=قف، E01F=وقفة.
// U+E022 زخرفة/خاتمة آية فقط وليست علامة وقف — لا تُحسب هنا.
const PUA_WAQF_MARKS = new Set([0xE01A, 0xE01B, 0xE01C, 0xE01E, 0xE01F]);
function hasDirectMark(word) {
  for (let i = 0; i < word.length; i++) {
    const cp = word.codePointAt(i);
    if (SAJAWANDI_CODEPOINTS.indexOf(cp) !== -1 || PUA_WAQF_MARKS.has(cp)) return true;
  }
  return false;
}

// راجع نص Indopak (المصدر الموثَّق فعليًا لهذه العلامات — راجع
// README-Ruku-Mushaf.md) أيضًا، وليس فقط WAQF_POSITIONS: ثبت عمليًا
// (سورة آل عمران آية 3 وحالات أخرى، 92 موضعًا إجمالًا) أن WAQF_POSITIONS
// وحدها قد تُفوِّت علامة ملتصقة بآخر كلمة في الآية بلا مسافة. هذا الفحص
// يمشي من آخر نص Indopak (بعد نزع علامات RTL/المسافات الزائدة) للخلف،
// جامعًا أي رموز تشكيل/علامات متتالية حتى أول حرف أساسي حقيقي.
const ayahIndopak = {};
PAGES.forEach(function (p) {
  p.ayahs.forEach(function (a) {
    const key = a.surah + ':' + a.ayah;
    if (!(key in ayahIndopak)) ayahIndopak[key] = a.textIndopak || '';
  });
});
const TRAILING_INVISIBLE = new Set([0x200f, 0x200e, 0xfeff, 0x200b, 0x200c, 0x200d]);
function indopakTailHasMark(indopakText) {
  let i = indopakText.length;
  while (i > 0 && (/\s/.test(indopakText[i - 1]) || TRAILING_INVISIBLE.has(indopakText.codePointAt(i - 1)))) i--;
  const t = indopakText.slice(0, i);
  if (!t) return false;
  let j = t.length - 1;
  let found = false;
  while (j >= 0) {
    const cp = t.codePointAt(j);
    const isMarkLike = SAJAWANDI_CODEPOINTS.indexOf(cp) !== -1 ||
      (cp >= 0x064B && cp <= 0x065F) || (cp >= 0x0610 && cp <= 0x061A) ||
      (cp >= 0x06D6 && cp <= 0x06ED) || (cp >= 0xE000 && cp <= 0xF8FF) ||
      cp === 0x0670 || TRAILING_INVISIBLE.has(cp);
    if (!isMarkLike) break;
    if (SAJAWANDI_CODEPOINTS.indexOf(cp) !== -1 || PUA_WAQF_MARKS.has(cp)) found = true;
    j--;
  }
  return found;
}

// --- الملف تحت الاختبار ---
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/no-sajawandi-heads.json'), 'utf8'));

check('العدد الإجمالي = 4039', data.length === 4039, 'العدد الفعلي: ' + data.length);

// كل عنصر شكله { surah, ayah } فقط — لا حقول زائدة (يبقى الملف بيانات صرفة)
let shapeOk = true;
data.forEach(function (item) {
  const keys = Object.keys(item).sort().join(',');
  if (keys !== 'ayah,surah') shapeOk = false;
});
check('كل عنصر { surah, ayah } فقط، بلا حقول زائدة', shapeOk);

// بلا تكرار
const seen = new Set();
let dupFound = null;
data.forEach(function (item) {
  const key = item.surah + ':' + item.ayah;
  if (seen.has(key) && !dupFound) dupFound = key;
  seen.add(key);
});
check('بلا أي تكرار', !dupFound, dupFound);

// كل موضع: رأس آية صحيح + آخر كلمة خالية فعليًا من كل علامات السجاوندي
let invalidCount = 0, firstInvalid = null;
data.forEach(function (item) {
  const key = item.surah + ':' + item.ayah;
  const text = ayahText[key];
  if (!text) { invalidCount++; if (!firstInvalid) firstInvalid = key + ' (آية غير موجودة)'; return; }
  const words = text.split(' ');
  const lastIdx = words.length;
  const lastWord = words[words.length - 1];
  const types = waqfLookup[key + ':' + lastIdx] || [];
  if (types.length > 0 || hasDirectMark(lastWord) || indopakTailHasMark(ayahIndopak[key] || '')) {
    invalidCount++;
    if (!firstInvalid) firstInvalid = key + ' (يحمل فعليًا: ' + (types.join(',') || 'رمز مباشر/Indopak') + ')';
  }
});
check('كل المواضع تجتاز شرط "بلا أي علامة سجاوندي" (WAQF_POSITIONS + مباشر + Indopak)', invalidCount === 0, invalidCount + ' موضعًا فشل، أول مثال: ' + firstInvalid);

// عكسيًا: لا يوجد موضع خارج الملف كان يستحق الدخول (اكتمال القائمة)
let missingCount = 0, firstMissing = null;
Object.keys(ayahText).forEach(function (key) {
  if (seen.has(key)) return;
  const text = ayahText[key];
  const words = text.split(' ');
  const lastIdx = words.length;
  const lastWord = words[words.length - 1];
  const types = waqfLookup[key + ':' + lastIdx] || [];
  if (types.length === 0 && !hasDirectMark(lastWord) && !indopakTailHasMark(ayahIndopak[key] || '')) {
    missingCount++;
    if (!firstMissing) firstMissing = key;
  }
});
check('لا يوجد أي موضع يستحق الإدراج وغائب عن الملف', missingCount === 0, missingCount + ' موضعًا مفقودًا، أول مثال: ' + firstMissing);

// حالات فعلية كانت مفوَّتة من WAQF_POSITIONS وحدها، واكتُشفت عبر Indopak —
// يجب أن تبقى مستبعدة دائمًا (انحدار دائم لهذه الفئة من الأخطاء)
const mustExcludeViaIndopak = [[3, 3], [2, 72], [2, 258], [4, 37], [91, 1], [91, 14], [3, 170], [5, 48], [39, 57], [51, 16], [74, 52]];
mustExcludeViaIndopak.forEach(function ([s, a]) {
  check('مستبعد بحق (Indopak فقط): ' + s + ':' + a, !seen.has(s + ':' + a));
});

// --- عيّنات مؤكَّدة يدويًا (مراجعة بصرية للمصحف المطبوع) ---
const mustInclude = [[1, 1], [1, 7]];
mustInclude.forEach(function ([s, a]) {
  check('موجود: ' + s + ':' + a, seen.has(s + ':' + a));
});
// 2:3 مستبعد عمدًا — آخر كلمته تحمل علامة "لا" فعليًا (راجع المحادثة المرجعية)
check('مستبعد بحق: 2:3 (يحمل علامة لا)', !seen.has('2:3'));

console.log('\\n' + pass + ' نجح، ' + fail + ' فشل');
process.exit(fail === 0 ? 0 : 1);
