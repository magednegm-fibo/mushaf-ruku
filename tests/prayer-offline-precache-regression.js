#!/usr/bin/env node
// =============================================================================
// prayer-offline-precache-regression.js
//
// يمنع رجوع regression على مسار offline لـ Prayer/Qibla.
//
// الواقع الحالي (1.0.648+ / متوافق مع 1.0.651):
//   - prayer.js يُحمَّل مع الصفحة من index.html (sync) — موثوق بعد مسح البيانات
//   - app.js يهيئ Prayer عبر safeInit('Prayer') عند الإقلاع
//   - prayer.js ليس Lazy-loaded عبر LazyLoader.load('prayer.js')
//   - prayer.js يبقى في Service Worker DYNAMIC_ASSETS (install precache)
//     لضمان التوفر offline (تحديثات SW / كاش)
//
// القاعدة:
//   - prayer.js = Core → sync في index.html + safeInit + precache في sw.js
//   - reader-tafsir.js = واجهة أساسية → sync + precache
//   - radio-player.js = تنفيذ كسول عند التاب + precache للملف (واجهة)
//   - quran-tashkeel-dictionary / tts-diacritizer = غير-Core ويجوز بقاؤها
//     خارج precache
//
// ملاحظة: أي تعليق قديم يقول «prayer.js Lazy-loaded» أصبح غير صحيح بعد
// 1.0.648 ولا يجب إعادته — هذا الملف يفرض البنية الحالية صراحةً.
//
// تشغيل:
//   node tests/prayer-offline-precache-regression.js
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

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

// استخراج مصفوفة DYNAMIC_ASSETS من sw.js بدون eval كامل
function extractDynamicAssets(swSource) {
  const start = swSource.indexOf('const DYNAMIC_ASSETS');
  if (start < 0) return null;
  const bracket = swSource.indexOf('[', start);
  if (bracket < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = bracket; i < swSource.length; i++) {
    const ch = swSource[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const body = swSource.slice(bracket + 1, end);
  const assets = [];
  const re = /['"](\.\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(body))) assets.push(m[1]);
  return assets;
}

console.log('prayer-offline-precache-regression\n');

// ---- 1. prayer.js موجود على القرص ----
{
  const p = path.join(root, 'prayer.js');
  check('prayer.js exists on disk', fs.existsSync(p));
}

// ---- 2. precache في sw.js ----
{
  const sw = read('sw.js');
  const assets = extractDynamicAssets(sw);
  check('DYNAMIC_ASSETS parsed from sw.js', Array.isArray(assets) && assets.length > 0,
    assets ? 'len=' + assets.length : 'parse failed');

  if (assets) {
    check(
      'prayer.js is in DYNAMIC_ASSETS (install precache)',
      assets.indexOf('./prayer.js') !== -1,
      'assets sample: ' + assets.slice(0, 8).join(', ')
    );

    // تأكيد أن التعليق أو القائمة لا تستثني prayer عن طريق الخطأ
    const prayerLineCommentedOut = /^\s*\/\/\s*['"]\.\/prayer\.js['"]/m.test(
      sw.slice(sw.indexOf('const DYNAMIC_ASSETS'))
    );
    check('prayer.js is not merely a commented-out entry', !prayerLineCommentedOut);

    // radio-player.js: يُنفَّذ كسولًا عند التاب لكن الملف precache منذ 1.0.651
    check(
      'radio-player.js is in DYNAMIC_ASSETS (precache UI shell)',
      assets.indexOf('./radio-player.js') !== -1
    );

    // reader-tafsir.js واجهة أساسية
    check(
      'reader-tafsir.js is in DYNAMIC_ASSETS (precache UI shell)',
      assets.indexOf('./reader-tafsir.js') !== -1
    );
  }
}

// ---- 3. index.html يحمّل prayer.js مع الصفحة (ليس lazy) ----
{
  const html = read('index.html');
  const syncPrayer = /<script[^>]+src=["'][^"']*prayer\.js["']/i.test(html);
  check('index.html sync-loads prayer.js (core UI)', syncPrayer);

  const syncTafsir = /<script[^>]+src=["'][^"']*reader-tafsir\.js["']/i.test(html);
  check('index.html sync-loads reader-tafsir.js', syncTafsir);

  // يجب ألا يُحمَّل prayer كسطر script متزامن فقط عبر تعليق — بل وسم فعلي
  check(
    'index.html does not claim prayer is deferred-only without script tag',
    syncPrayer
  );

  const hasLazyLoader = /<script[^>]+src=["'][^"']*lazy-loader\.js["']/i.test(html);
  check('index.html includes lazy-loader.js', hasLazyLoader);
}

// ---- 4. app.js يهيئ Prayer عند الإقلاع (ليس LazyLoader.load) ----
{
  const app = read('app.js');
  check('app.js defines ensurePrayer', /function\s+ensurePrayer\s*\(/.test(app));
  check(
    'app.js safeInit Prayer at startup',
    /safeInit\(\s*['"]Prayer['"]/.test(app)
  );
  check(
    'prayer.js is not lazy-loaded via LazyLoader.load',
    !/LazyLoader\.load\(\s*['"]prayer\.js['"]\s*\)/.test(app)
  );
}

// ---- 5. reader-guide يستدعي ensurePrayer عند تبويب الصلاة ----
{
  const guide = read('reader-guide.js');
  check(
    'reader-guide.js calls ensurePrayer on salah tab',
    /ensurePrayer/.test(guide)
  );
}

// ---- 6. محاكاة مسار offline: الملف في قائمة precache = متاح بعد install ----
// (بدون متصفح: نثبت العقدة الحرجة وهي إدراج الملف في addAll)
{
  const sw = read('sw.js');
  const usesAddAll = /cache\.addAll\s*\(\s*STATIC_ASSETS\.concat\(\s*DYNAMIC_ASSETS\s*\)\s*\)/.test(sw)
    || /cache\.addAll\s*\([^)]*DYNAMIC_ASSETS/.test(sw);
  check('sw.js install uses cache.addAll with DYNAMIC_ASSETS', usesAddAll);

  const assets = extractDynamicAssets(sw) || [];
  const coreOffline = ['./prayer.js'];
  const missing = coreOffline.filter(function (a) { return assets.indexOf(a) === -1; });
  check(
    'core offline modules all precached: ' + coreOffline.join(', '),
    missing.length === 0,
    missing.length ? 'missing: ' + missing.join(', ') : ''
  );
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
