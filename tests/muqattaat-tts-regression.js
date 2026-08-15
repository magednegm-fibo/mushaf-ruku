// Regression: Surah muqatta'at expansion for TTS only (v1.0.405).
// Does not touch displayed text. Only expands whole-token forms when
// (surah, ayah) is a known muqatta'at ayah.
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var code = fs.readFileSync(path.join(root, 'reader-tafsir.js'), 'utf8');

// Extract MUQATTAAT_BY_AYAH and expandMuqattaatForTts by evaluating a
// minimal sandbox of the IIFE body pieces we need.
var m = code.match(/var MUQATTAAT_BY_AYAH = \{[\s\S]*?\};/);
if (!m) {
  console.error('FAIL: MUQATTAAT_BY_AYAH not found');
  process.exit(1);
}
var fn = code.match(/function expandMuqattaatForTts\(text, surah, ayah\)\{[\s\S]*?\n  \}/);
if (!fn) {
  console.error('FAIL: expandMuqattaatForTts not found');
  process.exit(1);
}

var sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(m[0] + '\n' + fn[0] + '\nthis.expand = expandMuqattaatForTts; this.MAP = MUQATTAAT_BY_AYAH;', sandbox);

var expand = sandbox.expand;
var MAP = sandbox.MAP;
var pass = 0, fail = 0;

function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.error('FAIL:', name); }
}

// Expected expansions from the product list
var expected = {
  '2:1':  ['الم', 'أَلِف لَامْ مِيمْ'],
  '3:1':  ['الم', 'أَلِف لَامْ مِيمْ'],
  '7:1':  ['المص', 'أَلِف لَامْ مِيمْ صَادْ'],
  '10:1': ['الر', 'أَلِف لَامْ رَا'],
  '13:1': ['المر', 'أَلِف لَامْ مِيمْ رَا'],
  '19:1': ['كهيعص', 'كَافْ هَا يَا عَيْنْ صَادْ'],
  '20:1': ['طه', 'طَا هَا'],
  '26:1': ['طسم', 'طَا سِينْ مِيمْ'],
  '27:1': ['طس', 'طَا سِينْ'],
  '36:1': ['يس', 'يَا سِينْ'],
  '38:1': ['ص', 'صَادْ'],
  '40:1': ['حم', 'حَا مِيمْ'],
  '42:1': ['حم', 'حَا مِيمْ'],
  '42:2': ['عسق', 'عَيْنْ سِينْ قَافْ'],
  '50:1': ['ق', 'قَافْ'],
  '68:1': ['ن', 'نُونْ']
};

Object.keys(expected).forEach(function (key) {
  var form = expected[key][0];
  var spoken = expected[key][1];
  var parts = key.split(':');
  var surah = parseInt(parts[0], 10);
  var ayah = parseInt(parts[1], 10);
  var out = expand(form, surah, ayah);
  check(key + ' standalone → ' + spoken, out === spoken);
});

// Must NOT expand on wrong ayah
check('الم on 2:2 unchanged', expand('الم', 2, 2) === 'الم');
check('الم on 3:5 unchanged', expand('الم', 3, 5) === 'الم');
check('ص on 2:1 unchanged', expand('ص', 2, 1) === 'ص');
check('ن on 1:1 unchanged', expand('ن', 1, 1) === 'ن');
check('ق on 3:1 unchanged', expand('ق', 3, 1) === 'ق');

// Must NOT expand substring of longer word
check('المؤمنين on 3:1 not broken', expand('المؤمنين', 3, 1) === 'المؤمنين');
check('النار on 3:1 not broken', expand('النار', 3, 1) === 'النار');
check('صار on 38:1 not broken', expand('صار', 38, 1) === 'صار');
check('نور on 68:1 not broken', expand('نور', 68, 1) === 'نور');
check('قال on 50:1 not broken', expand('قال', 50, 1) === 'قال');

// Sentence with muqatta'at token at start of tafsir for 3:1
var tafsir31 = 'الم الله لا إله إلا هو الحي القيوم.';
var out31 = expand(tafsir31, 3, 1);
check('3:1 tafsir expands الم only', out31.indexOf('أَلِف لَامْ مِيمْ') === 0 && out31.indexOf('الله') !== -1);

// Same sentence on wrong ayah — no expand
check('same text on 3:2 no expand', expand(tafsir31, 3, 2) === tafsir31);

// null meta path
check('null surah no change', expand('الم', null, 1) === 'الم');
check('missing map no change', expand('xyz', 99, 1) === 'xyz');

// punctuation preserved
var p = expand('الم، تفسير.', 3, 1);
check('punctuation kept', p.indexOf('،') !== -1 && p.indexOf('.') !== -1);


// Ash-Shura عسق must expand on 42:1 and 42:2
check('42:2 عسق → عَيْنْ سِينْ قَافْ', expand('عسق', 42, 2) === 'عَيْنْ سِينْ قَافْ');
check('42:1 عسق → عَيْنْ سِينْ قَافْ', expand('عسق', 42, 1) === 'عَيْنْ سِينْ قَافْ');
check('42:1 حم → حَا مِيمْ', expand('حم', 42, 1) === 'حَا مِيمْ');
check('42:3 عسق unchanged', expand('عسق', 42, 3) === 'عسق');

console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail ? 1 : 0);
