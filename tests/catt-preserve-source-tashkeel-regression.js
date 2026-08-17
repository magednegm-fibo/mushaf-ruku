'use strict';
/** Preserve SOURCE tashkeel over CATT — v1.0.468 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var code = fs.readFileSync(path.join(__dirname, '..', 'tts-diacritizer.js'), 'utf8');
var helpers = code.match(/function stripArabicMarks[\s\S]*?function withTimeout/);
if (!helpers) { console.error('FAIL helpers'); process.exit(1); }
var ctx = {};
vm.createContext(ctx);
vm.runInContext(
  helpers[0].replace(/function withTimeout[\s\S]*/, '') +
  '\nthis.AR_WORD_RE=AR_WORD_RE;this.buildInput=buildInput;' +
  'this.restoreSkeleton=restoreSkeleton;this.preserveSourceTashkeel=preserveSourceTashkeel;' +
  'this.wordHasTashkeel=wordHasTashkeel;',
  ctx
);
var pass=0, fail=0;
function check(n,c,d){ if(c){pass++;console.log('PASS',n);}else{fail++;console.error('FAIL',n,d||'');} }
[['مُحِيَ','مَحِيَ','مُحِيَ'],['النُّطْفة','النَطفة','النُّطْفة'],['مَحْروز','مَحروز','مَحْروز'],['مُدّة','مَدة','مُدّة'],['قَدْرَه','قِدره','قَدْرَه']].forEach(function(p){
  check('preserve '+p[0], ctx.restoreSkeleton(p[0],p[1])===p[2]);
});
var src='وبالسُّحب التي تحمل الماء الغزير.';
var catt='وَبِالسَّحْبِ الَّتِي تَحْمِلُ الْمَاءَ الْغَزِيرَ.';
var out=ctx.restoreSkeleton(src,catt);
check('suhub preserved', out&&out.indexOf('السُّحب')!==-1&&out.indexOf('السَّحْب')===-1, out);
check('unmarked from CATT', out&&out.indexOf('الَّتِي')!==-1, out);
check('cache heal', (function(){var h=ctx.preserveSourceTashkeel(src,catt);return h&&h.indexOf('السُّحب')!==-1;})());
check('unmarked sentence', ctx.restoreSkeleton('التي تحمل','الَّتِي تَحْمِلُ')&&true);
console.log('==== TOTAL: PASS='+pass+' FAIL='+fail+' ====');
process.exit(fail?1:0);
