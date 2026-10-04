'use strict';
/**
 * CATT buildInput / restoreSkeleton word-boundary regression (v1.0.465).
 * Guards against AR_WORD_RE splitting diacritized words into letters
 * (e.g. مُحِيَ → "م ح ي") which breaks CATT and produces malformed restore.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var code = fs.readFileSync(path.join(root, 'tts-diacritizer.js'), 'utf8');

var helpers = code.match(/function stripArabicMarks[\s\S]*?function withTimeout/);
if (!helpers) {
  console.error('FAIL: helpers not found');
  process.exit(1);
}
var ctx = {};
vm.createContext(ctx);
vm.runInContext(
  helpers[0].replace(/function withTimeout[\s\S]*/, '') +
  '\nthis.stripArabicMarks = stripArabicMarks;' +
  '\nthis.AR_WORD_RE = AR_WORD_RE;' +
  '\nthis.buildInput = buildInput;' +
  '\nthis.restoreSkeleton = restoreSkeleton;',
  ctx
);

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.error('FAIL:', name, detail || ''); }
}

var cases = [
  ['مُحِيَ', 'محي'],
  ['اقتُلِعت', 'اقتلعت'],
  ['النُّطْفة', 'النطفة'],
  ['مَحْروز', 'محروز'],
  ['مُدّة', 'مدة'],
  ['قَدْرَه', 'قدره'],
  ['وأقسم بالرياح الشديدة الهبوب', 'وأقسم بالرياح الشديدة الهبوب'],
  ['فإذا النجوم مُحِيَ نورها وذهب ضوؤها', 'فإذا النجوم محي نورها وذهب ضوؤها'],
  ['وإذا الجبال اقتُلِعت من مكانها', 'وإذا الجبال اقتلعت من مكانها'],
];

cases.forEach(function(pair) {
  var orig = pair[0], expected = pair[1];
  var built = ctx.buildInput(orig);
  check('buildInput: ' + orig, built.input === expected, 'got: ' + built.input);
  var matches = orig.match(ctx.AR_WORD_RE) || [];
  check('count invariant: ' + orig, built.count === matches.length,
    'built=' + built.count + ' matches=' + matches.length);
  var restored = ctx.restoreSkeleton(orig, built.input);
  check('restore ok: ' + orig, restored !== null);
});

['محي', 'اقتلعت', 'النطفة', 'محروز'].forEach(function(w) {
  check('bare unchanged: ' + w, ctx.buildInput(w).input === w);
});

console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail ? 1 : 0);
