// Regression: unified marks visibility toggle (1.0.149+)
// "علامات تذكير الوقف" controls personal stars and Sajawandi
// default stars together. The purple قصر المنفصل highlight is
// independent and always on (decoupled 2026-07-30).
// The separate "تفعيل الترميز اللوني" control was removed.

'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function read(f){ return fs.readFileSync(path.join(root, f), 'utf8'); }

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const htmlSrc = read('index.html');
const appSrc = read('app.js');
const settingsSrc = read('settings.js');
const styleSrc = read('style.css');

console.log('\nUnified marks visibility (waqfToggle):');

check(
  'index.html has waqfToggle checkbox',
  /<input type="checkbox" id="waqfToggle"/.test(htmlSrc),
  ''
);
check(
  'index.html no longer has colorCodingToggle',
  !/id="colorCodingToggle"/.test(htmlSrc),
  ''
);
check(
  'index.html label is علامات تذكير الوقف',
  />علامات تذكير الوقف</.test(htmlSrc),
  ''
);
check(
  'app.js registers els.waqfToggle',
  /waqfToggle:\s*document\.getElementById\(['"]waqfToggle['"]\)/.test(appSrc),
  ''
);
check(
  'app.js no longer registers colorCodingToggle',
  !/colorCodingToggle/.test(appSrc),
  ''
);
check(
  'settings.js defines applyWaqfVisibility()',
  /function applyWaqfVisibility\s*\(/.test(settingsSrc),
  ''
);
check(
  'settings.js no longer defines applyColorCoding()',
  !/function applyColorCoding\s*\(/.test(settingsSrc),
  ''
);
check(
  'applyWaqfVisibility toggles body.hide-waqf-marks',
  /classList\.toggle\(['"]hide-waqf-marks['"]\s*,\s*!show\)/.test(settingsSrc),
  ''
);
check(
  'waqfToggle change handler updates visibility state',
  /els\.waqfToggle[\s\S]{0,200}?state\[currentWaqfVisibilityKey\(\)\]\s*=\s*els\.waqfToggle\.checked/.test(settingsSrc),
  ''
);


check(
  'applyWaqfVisibility no longer touches body.show-khilaf-highlight (decoupled — purple stays on regardless)',
  !/function applyWaqfVisibility[\s\S]{0,400}?show-khilaf-highlight/.test(settingsSrc),
  ''
);
check(
  'applyKhilafHighlightVisibility always adds body.show-khilaf-highlight unconditionally',
  /function applyKhilafHighlightVisibility\s*\(\)\s*\{\s*document\.body\.classList\.add\(['"]show-khilaf-highlight['"]\)/.test(settingsSrc),
  ''
);

console.log('\nstyle.css gating under body.hide-waqf-marks:');

check(
  'hide-waqf-marks hides personal has-waqf marks',
  /body\.hide-waqf-marks\s+\.quran-word\.has-waqf\s+\.waqf-mark/.test(styleSrc)
    && /body\.hide-waqf-marks[\s\S]{0,600}?display\s*:\s*none\s*!important/.test(styleSrc),
  ''
);
check(
  'hide-waqf-marks resets has-default-waqf word-text color to ink (no more star to hide — طلب مباشر 2026-07-31)',
  /body\.hide-waqf-marks[\s\S]{0,900}?\.has-default-waqf:not\(\.has-waqf\)[\s\S]{0,700}?color\s*:\s*inherit\s*!important/.test(styleSrc),
  ''
);
check(
  'hide-waqf-marks covers has-default-jeem',
  /body\.hide-waqf-marks[\s\S]{0,800}?\.has-default-jeem/.test(styleSrc),
  ''
);
check(
  'hide-waqf-marks no longer neutralizes --khilaf-highlight (purple قصر المنفصل stays colored regardless of the toggle)',
  !/html\s+body\.hide-waqf-marks\s*\{\s*--khilaf-highlight\s*:\s*inherit/.test(styleSrc)
    && !/body\.hide-waqf-marks\.show-khilaf-highlight/.test(styleSrc),
  ''
);
check(
  'style.css no longer uses body.hide-color-coding',
  !/hide-color-coding/.test(styleSrc),
  ''
);
check(
  'default Sajawandi marks color the word TEXT, not a star (طلب مباشر 2026-07-31 — رجوع لتلوين الكلمة، إلغاء النجمة). Selector now also carries :not(.khilaf-word) from the later purple/khilaf-overlap feature (2026-08-01), so the regex allows that optional token instead of requiring a comma right after :not(.has-waqf).',
  /\.quran-word\.has-default-waqf:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*,[\s\S]{0,140}?\{\s*color\s*:\s*#1565C0/i.test(styleSrc)
    && /\.quran-word\.has-default-waqf:not\(\.has-waqf\)(?::not\(\.khilaf-word\))?\s*\.waqf-mark[\s\S]{0,600}?display\s*:\s*none\s*!important/i.test(styleSrc),
  ''
);
check(
  'Madinah-mushaf default-Sajawandi-colored words enlarge 1.1em',
  /body\.uthmani-font\s+\.quran-word\.has-default-waqf:not\(\.has-waqf\)\s*,[\s\S]{0,600}?\{\s*font-size\s*:\s*1\.1em/.test(styleSrc),
  ''
);
check(
  'default-marked word enlargement (1.1em) never double-scales a nested native .waqf-sign — verified via the base rule instead of an explicit nested override: body.uthmani-font .waqf-sign is font-size:1em (a relative unit), so nested inside any enlarged ancestor it always renders at exactly the ancestor\'s computed size with no extra multiplication. The old explicit ".has-default-waqf ... .waqf-sign{font-size:1em}" sub-rule was intentionally deleted as redundant once this was confirmed (see style.css comment) — this check was updated to match that cleanup instead of expecting the removed selector.',
  /body\.uthmani-font\s+\.waqf-sign\s*\{\s*font-size\s*:\s*1em/.test(styleSrc),
  ''
);
check(
  'hide-waqf-marks also resets the has-default-* word enlargement back to normal size',
  /body\.hide-waqf-marks\.uthmani-font\s+\.quran-word\.has-default-waqf:not\(\.has-waqf\)\s*,[\s\S]{0,600}?\{\s*font-size\s*:\s*1em/.test(styleSrc),
  ''
);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
