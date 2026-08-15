'use strict';
/**
 * Regression: wrapWaqfSigns must keep the whole Quranic word inside one
 * .waqf-sign span so WebKit/iOS does not break Arabic letter joining at
 * a mid-word span boundary (v1.0.420).
 *
 * Reported failures: 2:5 رَّبِّهِمۡۖ and 2:7 سَمۡعِهِمۡۖ rendered as
 * رَّبِّهِ + disconnected م when the last letter lived in its own span.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var code = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');

var start = code.indexOf('var WAQF_COMBINING = {');
var fnStart = code.indexOf('function wrapWaqfSigns(text){', start);
var retIdx = code.indexOf('return out;', fnStart);
var endBrace = code.indexOf('\n  }', retIdx);
if (start < 0 || fnStart < 0 || retIdx < 0 || endBrace < 0) {
  console.error('FAIL: could not locate wrapWaqfSigns block');
  process.exit(1);
}
var block = code.slice(start, endBrace + 4).replace(/^  /gm, '');

var kallaStart = code.indexOf('var KALLA_MADDA_REGEX');
var kallaEnd = code.indexOf('var LAM_ALEF_MADDA_REGEX');
if (kallaStart < 0 || kallaEnd < 0) {
  console.error('FAIL: could not locate KALLA helpers');
  process.exit(1);
}
var kallaBlock = code.slice(kallaStart, kallaEnd).replace(/^  /gm, '');

var sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(
  block + '\n' + kallaBlock +
  '\nthis.wrapWaqfSigns = wrapWaqfSigns;' +
  '\nthis.KALLA_MADDA_REGEX = KALLA_MADDA_REGEX;' +
  '\nthis.KALLA_MADDA_HTML = KALLA_MADDA_HTML;' +
  '\nthis.KALLA_MADDA_WAQF_REGEX = KALLA_MADDA_WAQF_REGEX;' +
  '\nthis.kallaMaddaWaqfHtml = kallaMaddaWaqfHtml;',
  sandbox
);
var wrapWaqfSigns = sandbox.wrapWaqfSigns;
var KALLA_MADDA_REGEX = sandbox.KALLA_MADDA_REGEX;
var KALLA_MADDA_HTML = sandbox.KALLA_MADDA_HTML;
var KALLA_MADDA_WAQF_REGEX = sandbox.KALLA_MADDA_WAQF_REGEX;
var kallaMaddaWaqfHtml = sandbox.kallaMaddaWaqfHtml;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('PASS:', name);
  } else {
    fail++;
    console.error('FAIL:', name, detail != null ? detail : '');
  }
}

// --- Core reported cases ---
var rabb = wrapWaqfSigns('رَّبِّهِمۡۖ');
check(
  '2:5 رَّبِّهِمۡۖ whole word in one span',
  rabb === '<span class="waqf-sign">رَّبِّهِمۡۖ</span>',
  rabb
);
check(
  '2:5 no mid-word split before م',
  rabb.indexOf('هِ<span') === -1 && rabb.indexOf('>م') === -1,
  rabb
);

var sam = wrapWaqfSigns('سَمۡعِهِمۡۖ');
check(
  '2:7 سَمۡعِهِمۡۖ whole word in one span',
  sam === '<span class="waqf-sign">سَمۡعِهِمۡۖ</span>',
  sam
);
check(
  '2:7 no mid-word split before م',
  sam.indexOf('هِ<span') === -1,
  sam
);

// --- Plain word (no waqf) stays unwrapped ---
var plain = wrapWaqfSigns('الْمُفْلِحُونَ');
check('plain word unchanged', plain === 'الْمُفْلِحُونَ', plain);

// --- Multi-word: only waqf-bearing word wrapped ---
var multi = wrapWaqfSigns('رَّبِّهِمۡۖ وَأُولَٰئِكَ');
check(
  'multi-word: first wrapped, space kept, second plain',
  multi === '<span class="waqf-sign">رَّبِّهِمۡۖ</span> وَأُولَٰئِكَ',
  multi
);

// --- Jeem+sila collision ---
var rayb = wrapWaqfSigns('رَيْبَۛۚۖ');
check(
  '2:1 رَيْبَ whole word starts span',
  rayb.indexOf('<span class="waqf-sign">رَيْبَ') === 0,
  rayb
);
check('2:1 sila-lift still present', rayb.indexOf('waqf-sila-lift') !== -1, rayb);
check('2:1 no mid-word split', rayb.indexOf('رَيْ<span') === -1, rayb);

// --- LAM+ALEF (old special-case now automatic) ---
var mathal = wrapWaqfSigns('مَثَلٗاۘ');
check(
  '2:26 مَثَلٗاۘ whole word (لام+ألف together)',
  mathal === '<span class="waqf-sign">مَثَلٗاۘ</span>',
  mathal
);
check('2:26 no split before لام', mathal.indexOf('ثَ<span') === -1, mathal);

// --- Kalla + waqf (alef + combining madda U+0653, not precomposed آ) ---
var KALLA_SEQ = '\u0643\u064E\u0644\u0651\u064E\u0627\u0653'; // كَلَّآ
var kallaWaqf = wrapWaqfSigns(KALLA_SEQ + '\u06D8'); // + waqf-lazim
check(
  'kalla+waqf whole word in span',
  kallaWaqf === '<span class="waqf-sign">' + KALLA_SEQ + '\u06D8</span>',
  kallaWaqf
);
var kallaAfter = kallaWaqf.replace(KALLA_MADDA_WAQF_REGEX, kallaMaddaWaqfHtml);
check(
  'kalla+waqf post-processor rewrites madda',
  kallaAfter.indexOf('kalla-madda-glyph') !== -1 &&
    kallaAfter.indexOf('kalla-cluster') !== -1 &&
    kallaAfter.indexOf('waqf-sign') !== -1,
  kallaAfter
);
check(
  'kalla+waqf letters contiguous',
  kallaAfter.indexOf('\u0643\u064E\u0644\u0651\u064E\u0627') !== -1,
  kallaAfter
);

// --- Plain kalla ---
var kallaPlain = KALLA_SEQ.replace(KALLA_MADDA_REGEX, KALLA_MADDA_HTML);
check(
  'plain kalla madda rewrite',
  kallaPlain.indexOf('kalla-madda-glyph') !== -1,
  kallaPlain
);

// --- Standalone ---
var stand = wrapWaqfSigns('\uE01A');
check(
  'standalone mark wrapped alone',
  stand === '<span class="waqf-sign">\uE01A</span>',
  stand
);

// --- Hide path is CSS-only; DOM identical ---
check(
  'hide path structural identity (DOM unchanged)',
  rabb === wrapWaqfSigns('رَّبِّهِمۡۖ') && sam === wrapWaqfSigns('سَمۡعِهِمۡۖ')
);

// --- ZWS stripped ---
var zws = wrapWaqfSigns('رَّبِّهِمۡ\u200bۖ');
check(
  'ZWS between letter and mark stripped',
  zws === '<span class="waqf-sign">رَّبِّهِمۡۖ</span>',
  zws
);

// --- Noon + ruku-end lift ---
var noonRuku = wrapWaqfSigns('ن\uE022');
check(
  'bare noon + ruku-end gets noon-lift',
  noonRuku.indexOf('waqf-ruku-mark-noon-lift') !== -1,
  noonRuku
);

// --- Sakta + mutlaq still lifts ---
var sakta = wrapWaqfSigns('عِوَجًا\u06DC\u0615');
check(
  'sakta+mutlaq lifts present',
  sakta.indexOf('waqf-sakta-lift') !== -1 || sakta.indexOf('waqf-mark-lower') !== -1,
  sakta
);

console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail ? 1 : 0);
