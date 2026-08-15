'use strict';
/**
 * Regression: tatweel-seat is platform-gated.
 * - iOS / iPadOS: identity (no mid-word span) for WebKit joining
 * - Android / Desktop: v1.0.420 span + classes unchanged
 * wrapWaqfSigns is not modified by this path.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var rm = fs.readFileSync(path.join(root, 'readerManager.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.error('FAIL:', name, detail != null ? detail : ''); }
}

function loadWithNav(nav) {
  var start = rm.indexOf('var TATWEEL_BIG_GAP_AFTER');
  var end = rm.indexOf('function cleanAyahText');
  if (start < 0 || end < 0) throw new Error('block not found');
  var block = rm.slice(start, end).replace(/^  /gm, '');
  var sandbox = {
    console: console,
    navigator: nav
  };
  vm.createContext(sandbox);
  vm.runInContext(
    block +
      '\nthis.TATWEEL_SEAT_REGEX = TATWEEL_SEAT_REGEX;' +
      '\nthis.tatweelSeatHtml = tatweelSeatHtml;' +
      '\nthis.IS_IOS_IPADOS = IS_IOS_IPADOS;',
    sandbox
  );
  return sandbox;
}

var words = [
  'أُوْلَـٰٓئِكَ',
  'يَـٰٓأَيُّهَا',
  'ٱلصَّـٰلِحَٰتِ',
  'قَوَّـٰمِينَ',
  'ٱلرَّـٰحِمِينَ',
  'فَٱدَّـٰرَٰٔتُمۡ'
];

// --- iPhone ---
var ios = loadWithNav({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  platform: 'iPhone',
  maxTouchPoints: 5
});
check('iPhone detected as iOS', ios.IS_IOS_IPADOS === true);
words.forEach(function (w) {
  var out = w.replace(ios.TATWEEL_SEAT_REGEX, ios.tatweelSeatHtml);
  check('iPhone ' + w + ' identity (no span)', out === w && out.indexOf('<') === -1, out);
});

// --- iPadOS desktop UA ---
var ipadOs = loadWithNav({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5
});
check('iPadOS MacIntel+touch detected as iOS', ipadOs.IS_IOS_IPADOS === true);
check(
  'iPadOS أولائك identity',
  'أُوْلَـٰٓئِكَ'.replace(ipadOs.TATWEEL_SEAT_REGEX, ipadOs.tatweelSeatHtml) === 'أُوْلَـٰٓئِكَ'
);

// --- Android (must NOT be treated as iOS) ---
var android = loadWithNav({
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
  platform: 'Linux armv8l',
  maxTouchPoints: 5
});
check('Android NOT detected as iOS', android.IS_IOS_IPADOS === false);
var androidOut = 'أُوْلَـٰٓئِكَ'.replace(android.TATWEEL_SEAT_REGEX, android.tatweelSeatHtml);
check(
  'Android أولائك has tatweel-seat span (v1.0.420)',
  androidOut.indexOf('tatweel-seat') !== -1 && androidOut.indexOf('ـٰٓ') !== -1,
  androidOut
);
check(
  'Android أولائك is tight class',
  androidOut.indexOf('tatweel-seat-tight') !== -1,
  androidOut
);

// --- Desktop Chrome ---
var desktop = loadWithNav({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  platform: 'Win32',
  maxTouchPoints: 0
});
check('Desktop NOT detected as iOS', desktop.IS_IOS_IPADOS === false);
var deskOut = 'أُوْلَـٰٓئِكَ'.replace(desktop.TATWEEL_SEAT_REGEX, desktop.tatweelSeatHtml);
check('Desktop أولائك has tatweel-seat span', deskOut.indexOf('tatweel-seat') !== -1, deskOut);
check(
  'Desktop matches Android span structure',
  deskOut === androidOut,
  deskOut + ' vs ' + androidOut
);

// --- Baseline CSS preserved ---
check('CSS .tatweel-seat still has scaleX(0.55)', /transform:\s*scaleX\(0\.55\)/.test(css));
check('CSS .tatweel-seat still has margin-inline', /\.tatweel-seat\{[\s\S]*?margin-inline/.test(css));
check('CSS .tatweel-seat-tight present', /\.tatweel-seat-tight/.test(css));

// --- Words without tatweel unchanged on both ---
['ٱلتَّوَّٰبِينَ', 'ٱلرَّٰسِخُونَ'].forEach(function (w) {
  check('iPhone ' + w + ' unchanged', w.replace(ios.TATWEEL_SEAT_REGEX, ios.tatweelSeatHtml) === w);
  check('Android ' + w + ' unchanged', w.replace(android.TATWEEL_SEAT_REGEX, android.tatweelSeatHtml) === w);
});

// --- big-gap path still on Android (را after seat) ---
var fad = 'فَٱدَّـٰرَٰٔتُمۡ'.replace(android.TATWEEL_SEAT_REGEX, android.tatweelSeatHtml);
check('Android فادّار uses plain tatweel-seat (big gap)', fad.indexOf('tatweel-seat-tight') === -1 && fad.indexOf('tatweel-seat') !== -1, fad);

console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail ? 1 : 0);
