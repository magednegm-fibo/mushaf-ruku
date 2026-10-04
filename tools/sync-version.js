#!/usr/bin/env node
// =============================================================================
// sync-version.js — مصدر الحقيقة الوحيد لرقم الإصدار هو version.js.
// يقرأ الرقم من هناك ويحدّث كل الملفات التي يجب أن تحمله نفسه:
//   package.json, manifest.json, PROJECT_STATUS.md, README.md
//
// الاستخدام:
//   node tools/sync-version.js              # يزامن الملفات على الرقم الحالي
//   node tools/sync-version.js 1.0.705      # يكتب الرقم الجديد في version.js ثم يزامن
//   node tools/sync-version.js --check      # يتحقق فقط (exit 1 عند اختلاف)
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const VERSION_RE = /^\d+\.\d+\.\d+$/;

function readVersionJs() {
  const src = fs.readFileSync(path.join(root, 'version.js'), 'utf8');
  const m = src.match(/self\.APP_VERSION\s*=\s*['"]([\d.]+)['"]/);
  if (!m) throw new Error('تعذّر قراءة self.APP_VERSION من version.js');
  return m[1];
}

function writeVersionJs(ver) {
  const file = path.join(root, 'version.js');
  let src = fs.readFileSync(file, 'utf8');
  const next = src.replace(
    /self\.APP_VERSION\s*=\s*['"][\d.]+['"]/,
    "self.APP_VERSION = '" + ver + "'"
  );
  if (next === src) throw new Error('فشل تحديث version.js — لم يُعثر على نمط APP_VERSION');
  fs.writeFileSync(file, next, 'utf8');
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function writeJson(rel, obj) {
  fs.writeFileSync(path.join(root, rel), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function updatePackageJson(ver) {
  const pkg = readJson('package.json');
  if (pkg.version === ver) return false;
  pkg.version = ver;
  writeJson('package.json', pkg);
  return true;
}

function updateManifestJson(ver) {
  const man = readJson('manifest.json');
  if (man.version === ver) return false;
  man.version = ver;
  writeJson('manifest.json', man);
  return true;
}

function updateProjectStatus(ver) {
  const file = path.join(root, 'PROJECT_STATUS.md');
  let src = fs.readFileSync(file, 'utf8');
  const re = /(\*\*الإصدار الحالي:\*\*\s*)[\d.]+/;
  if (!re.test(src)) throw new Error('لم يُعثر على سطر «الإصدار الحالي» في PROJECT_STATUS.md');
  const next = src.replace(re, '$1' + ver);
  if (next === src) return false;
  fs.writeFileSync(file, next, 'utf8');
  return true;
}

function updateReadme(ver) {
  const file = path.join(root, 'README.md');
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;

  // **الإصدار:** 1.0.704 — الإصدار الرسمي المستقر (Stable Release)
  const re1 = /(\*\*الإصدار:\*\*\s*)[\d.]+(\s*—\s*الإصدار الرسمي المستقر)/;
  if (re1.test(src)) {
    const n = src.replace(re1, '$1' + ver + '$2');
    if (n !== src) { src = n; changed = true; }
  }

  // **ملاحظة:** الإصدار الحالي الرسمي المستقر هو **1.0.704** (...)
  const re2 = /(الإصدار الحالي الرسمي المستقر هو \*\*)[\d.]+(\*\*)/;
  if (re2.test(src)) {
    const n = src.replace(re2, '$1' + ver + '$2');
    if (n !== src) { src = n; changed = true; }
  }

  if (changed) fs.writeFileSync(file, src, 'utf8');
  return changed;
}

function collectVersions() {
  const fromJs = readVersionJs();
  const pkg = readJson('package.json').version;
  const man = readJson('manifest.json').version;

  const statusSrc = fs.readFileSync(path.join(root, 'PROJECT_STATUS.md'), 'utf8');
  const statusM = statusSrc.match(/\*\*الإصدار الحالي:\*\*\s*([\d.]+)/);
  const status = statusM ? statusM[1] : null;

  const readmeSrc = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const readmeM1 = readmeSrc.match(/\*\*الإصدار:\*\*\s*([\d.]+)\s*—\s*الإصدار الرسمي المستقر/);
  const readmeM2 = readmeSrc.match(/الإصدار الحالي الرسمي المستقر هو \*\*([\d.]+)\*\*/);
  const readme1 = readmeM1 ? readmeM1[1] : null;
  const readme2 = readmeM2 ? readmeM2[1] : null;

  return {
    'version.js': fromJs,
    'package.json': pkg,
    'manifest.json': man,
    'PROJECT_STATUS.md': status,
    'README.md (الإصدار:)': readme1,
    'README.md (ملاحظة)': readme2,
  };
}

function checkOnly() {
  const map = collectVersions();
  const expected = map['version.js'];
  let ok = true;
  console.log('مصدر الحقيقة (version.js): ' + expected);
  for (const [file, ver] of Object.entries(map)) {
    if (file === 'version.js') continue;
    if (ver === expected) {
      console.log('  OK   ' + file + ' → ' + ver);
    } else {
      ok = false;
      console.log('  FAIL ' + file + ' → ' + (ver == null ? '(غير موجود)' : ver) + '  (متوقع ' + expected + ')');
    }
  }
  return ok;
}

function sync(ver) {
  const changed = [];
  if (updatePackageJson(ver)) changed.push('package.json');
  if (updateManifestJson(ver)) changed.push('manifest.json');
  if (updateProjectStatus(ver)) changed.push('PROJECT_STATUS.md');
  if (updateReadme(ver)) changed.push('README.md');
  return changed;
}

// --- CLI ---
const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const bumpArg = args.find(function (a) { return VERSION_RE.test(a); });

if (checkMode) {
  const ok = checkOnly();
  process.exit(ok ? 0 : 1);
}

if (bumpArg) {
  if (!VERSION_RE.test(bumpArg)) {
    console.error('رقم إصدار غير صالح: ' + bumpArg + ' (المتوقع x.y.z)');
    process.exit(1);
  }
  writeVersionJs(bumpArg);
  console.log('version.js → ' + bumpArg);
}

const ver = readVersionJs();
const changed = sync(ver);
if (changed.length === 0) {
  console.log('كل الملفات متزامنة بالفعل على ' + ver);
} else {
  console.log('تم تزامن الإصدار ' + ver + ' في: ' + changed.join(', '));
}

// تحقق نهائي
if (!checkOnly()) {
  console.error('فشل التحقق النهائي بعد التزامن.');
  process.exit(1);
}
process.exit(0);
