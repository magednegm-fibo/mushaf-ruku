#!/usr/bin/env node
// =============================================================================
// version-sync-regression.js — يمنع اختلاف رقم الإصدار بين الملفات التي
// يجب أن تحمله نفسه. مصدر الحقيقة الوحيد: version.js (self.APP_VERSION).
//
//   node tests/version-sync-regression.js
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

function readVersionJs() {
  const src = fs.readFileSync(path.join(root, 'version.js'), 'utf8');
  const m = src.match(/self\.APP_VERSION\s*=\s*['"]([\d.]+)['"]/);
  return m ? m[1] : null;
}

function readJsonVersion(rel) {
  try {
    const obj = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    return obj.version || null;
  } catch (e) {
    return null;
  }
}

console.log('version-sync-regression — root: ' + root);

const expected = readVersionJs();
check(
  'version.js يحتوي self.APP_VERSION بصيغة x.y.z',
  !!expected && /^\d+\.\d+\.\d+$/.test(expected),
  expected ? 'القيمة: ' + expected : 'غير موجود'
);

if (!expected) {
  console.log('\nالنتيجة: ' + pass + ' نجح، ' + fail + ' فشل');
  process.exit(1);
}

console.log('  مصدر الحقيقة: ' + expected);

const pkg = readJsonVersion('package.json');
check('package.json.version === version.js', pkg === expected, 'package.json=' + pkg);

const man = readJsonVersion('manifest.json');
check('manifest.json.version === version.js', man === expected, 'manifest.json=' + man);

const statusSrc = fs.readFileSync(path.join(root, 'PROJECT_STATUS.md'), 'utf8');
const statusM = statusSrc.match(/\*\*الإصدار الحالي:\*\*\s*([\d.]+)/);
const status = statusM ? statusM[1] : null;
check(
  'PROJECT_STATUS.md «الإصدار الحالي» === version.js',
  status === expected,
  'PROJECT_STATUS.md=' + status
);

const readmeSrc = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const readmeM1 = readmeSrc.match(/\*\*الإصدار:\*\*\s*([\d.]+)\s*—\s*الإصدار الرسمي المستقر/);
const readme1 = readmeM1 ? readmeM1[1] : null;
check(
  'README.md «**الإصدار:** …» === version.js',
  readme1 === expected,
  'README.md(الإصدار)=' + readme1
);

const readmeM2 = readmeSrc.match(/الإصدار الحالي الرسمي المستقر هو \*\*([\d.]+)\*\*/);
const readme2 = readmeM2 ? readmeM2[1] : null;
check(
  'README.md «الإصدار الحالي الرسمي المستقر» === version.js',
  readme2 === expected,
  'README.md(ملاحظة)=' + readme2
);

// sw.js يجب أن يستورد version.js (لا يحمل رقمًا ثابتًا)
const swSrc = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
check(
  'sw.js يستورد version.js عبر importScripts',
  /importScripts\s*\(\s*['"]\.\/version\.js['"]\s*\)/.test(swSrc),
  'لم يُعثر على importScripts(\'./version.js\')'
);
check(
  'sw.js يشتق CACHE من self.APP_VERSION (لا رقم ثابت)',
  /CACHE\s*=\s*['"]juzamma-v['"]\s*\+\s*self\.APP_VERSION/.test(swSrc),
  'نمط CACHE غير متوقع'
);

console.log('\nالنتيجة: ' + pass + ' نجح، ' + fail + ' فشل');
process.exit(fail > 0 ? 1 : 0);
