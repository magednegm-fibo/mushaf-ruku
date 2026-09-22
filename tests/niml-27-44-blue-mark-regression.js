#!/usr/bin/env node
// Regression: النمل 27:44 — اللون الأزرق يجب أن يبقى على «قوارير» فقط.
// «مِّن» (word 16) يجب ألا تحصل على ط يدوي؛ «قوارير» (word 17) تبقى زرقاء
// بسبب رأس الآية لغير الكوفيين في مصحف المدينة.
'use strict';

const fs = require('fs');
const path = require('path');
const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const readerManager = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');
const nonKufi = fs.readFileSync(path.join(root, 'non-kufi-heads.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'data.js'), 'utf8');

// The erroneous manual TA_MUTLAQ entry must not return.
check(
  '27:44:16 («مِّن») has no manual TA_MUTLAQ entry',
  !readerManager.includes("'27:44:16': true")
);

// The actual Madinah blue head marker is word 17 = «قوارير».
check(
  '27:44:17 («قوارير») remains a blue non-Kufi head',
  nonKufi.includes('"27:44:17":"blue"')
);
check(
  '27:44:17 Uthmani base word is «قوارير»',
  nonKufi.includes('"27:44:17":"قوارير"')
);

// Guard the source word numbering used by the renderer.
const m = data.match(/\{"surah":27,"surahName":"النمل","ayah":44,"text":"([^"]+)"/);
const words = m ? m[1].split(' ') : [];
check('27:44 word 16 is «مِّن»', words[15] === 'مِّن', words[15]);
check('27:44 word 17 is «قَوَارِيرَۗ»', words[16] === 'قَوَارِيرَۗ', words[16]);

console.log('\n' + pass + ' نجح، ' + fail + ' فشل');
process.exit(fail === 0 ? 0 : 1);
