'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var code = fs.readFileSync(path.join(root, 'reader-tafsir.js'), 'utf8');
var dictCode = fs.readFileSync(path.join(root, 'quran-tashkeel-dictionary.js'), 'utf8');
var data = fs.readFileSync(path.join(root, 'data.js'), 'utf8');

var m12 = data.match(/\{"surah":12,"surahName":"يوسف","ayah":4,"text":"([^"]+)"/);
if (!m12) throw new Error('12:4 not in data.js');
var ayahText = m12[1];

var ctx = { console: console, self: {}, window: {} };
vm.createContext(ctx);
vm.runInContext(dictCode, ctx);
ctx.window.QURAN_TASHKEEL_DICT = ctx.self.QURAN_TASHKEEL_DICT;
ctx.window.JUZ_PAGES = [{ ayahs: [{ surah: 12, ayah: 4, text: ayahText }] }];

var block = code.match(/var TTS_FUNCTION_WORDS = \{[\s\S]*?function applySameAyahTashkeel\(text, surah, ayah\)\{[\s\S]*?\n  \}/);
if (!block) throw new Error('same-ayah block missing');
vm.runInContext(block[0], ctx);

function extract(name) {
  var re = new RegExp('function ' + name + '\\([^{]*\\)\\{[\\s\\S]*?\\n  \\}');
  var mm = code.match(re);
  if (!mm) throw new Error('missing ' + name);
  return mm[0];
}
vm.runInContext(extract('applyQuranTashkeel'), ctx);
vm.runInContext(code.match(/var QURAN_WORD_TTS_FIX = \{[\s\S]*?\};/)[0], ctx);
vm.runInContext(extract('normalizeTtsMarks'), ctx);
vm.runInContext(extract('fixQuranWordPronunciation'), ctx);

function pipeline(text, surah, ayah) {
  var s = text;
  if (surah != null) s = ctx.applySameAyahTashkeel(s, surah, ayah);
  s = ctx.applyQuranTashkeel(s);
  s = ctx.normalizeTtsMarks(s);
  s = ctx.fixQuranWordPronunciation(s);
  return s;
}

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.error('FAIL:', name); }
}

var map = ctx._getAyahWordMap(12, 4);
check('قال → from ayah', ctx.applySameAyahTashkeel('قال', 12, 4).indexOf('قَال') !== -1);
check('يوسف → from ayah', ctx.applySameAyahTashkeel('يوسف', 12, 4).indexOf('يُوسُف') !== -1);
check('لأبيه → from ayah', ctx.applySameAyahTashkeel('لأبيه', 12, 4) === 'لِأَبِيهِ' || ctx.applySameAyahTashkeel('لأبيه',12,4).indexOf('أَبِيه')!==-1);
check('رأيت → from ayah', ctx.applySameAyahTashkeel('رأيت', 12, 4).indexOf('رَأَي') !== -1);

['من','ما','إن','أن','في','على','إلى','عن','لا','لم','لن','هل','هو','هي','هم','هن','نحن','أنت','أنتم','هذا','هذه','ذلك','التي','الذي','الذين'].forEach(function(w){
  var pk = ctx._ttsPlainKey(w);
  check('excluded function: ' + w, !!ctx.TTS_FUNCTION_WORDS[pk] || !!ctx.TTS_FUNCTION_WORDS[w]);
  check(w + ' not in content map', !map[pk]);
});

check('القرآن override wins', pipeline('القرآن', 12, 4).indexOf('قُرْ') !== -1);
check('النبي override wins', /النَّبِي/.test(pipeline('النبي', 12, 4)));
check('لغة override wins', pipeline('لغة', 12, 4).indexOf('لُغَة') !== -1);
check('exact-only keys differ', ctx._ttsPlainKey('المؤمنين') !== ctx._ttsPlainKey('مؤمن'));
check('no meta leaves plain path', pipeline('كلمةعادية', null, null).indexOf('كلمة') !== -1);


check('كنت remains in function list', !!ctx.TTS_FUNCTION_WORDS['كنت']);
check('كان NOT in function list', !ctx.TTS_FUNCTION_WORDS['كان']);
check('بين NOT in function list', !ctx.TTS_FUNCTION_WORDS['بين']);
check('كل NOT in function list', !ctx.TTS_FUNCTION_WORDS['كل']);
check('بعض NOT in function list', !ctx.TTS_FUNCTION_WORDS['بعض']);
check('غير NOT in function list', !ctx.TTS_FUNCTION_WORDS['غير']);
check('مع NOT in function list', !ctx.TTS_FUNCTION_WORDS['مع']);
console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
process.exit(fail ? 1 : 0);
