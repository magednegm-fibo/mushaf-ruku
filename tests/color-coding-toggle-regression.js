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
  'applyWaqfVisibility no longer touches body.show-mad-munfasil (decoupled — purple stays on regardless)',
  !/function applyWaqfVisibility[\s\S]{0,400}?show-mad-munfasil/.test(settingsSrc),
  ''
);
check(
  'applyMadMunfasilVisibility always adds body.show-mad-munfasil unconditionally',
  /function applyMadMunfasilVisibility\s*\(\)\s*\{\s*document\.body\.classList\.add\(['"]show-mad-munfasil['"]\)/.test(settingsSrc),
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
  'hide-waqf-marks hides has-default-waqf stars',
  /body\.hide-waqf-marks[\s\S]{0,400}?\.has-default-waqf[\s\S]{0,80}?display\s*:\s*none\s*!important/.test(styleSrc)
  || /body\.hide-waqf-marks[\s\S]{0,500}?\.has-default-waqf\s+\.waqf-mark/.test(styleSrc),
  ''
);
check(
  'hide-waqf-marks covers has-default-jeem',
  /body\.hide-waqf-marks[\s\S]{0,800}?\.has-default-jeem/.test(styleSrc),
  ''
);
check(
  'hide-waqf-marks no longer neutralizes --mad-munfasil (purple قصر المنفصل stays colored regardless of the toggle)',
  !/html\s+body\.hide-waqf-marks\s*\{\s*--mad-munfasil\s*:\s*inherit/.test(styleSrc)
    && !/body\.hide-waqf-marks\.show-mad-munfasil/.test(styleSrc),
  ''
);
check(
  'style.css no longer uses body.hide-color-coding',
  !/hide-color-coding/.test(styleSrc),
  ''
);
check(
  'default Sajawandi stars still defined (on when toggle is on)',
  /\.quran-word\.has-default-waqf:not\(\.has-waqf\)\s*\.waqf-mark[\s\S]{0,120}?color\s*:\s*#1565C0/i.test(styleSrc),
  ''
);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
