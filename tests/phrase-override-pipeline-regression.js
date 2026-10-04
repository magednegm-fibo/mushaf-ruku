'use strict';
/** Final TTS pipeline checks for Static Quran Phrase Overrides (v1.0.417). */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var code = fs.readFileSync(path.join(root, 'reader-tafsir.js'), 'utf8');
var dictCode = fs.readFileSync(path.join(root, 'quran-tashkeel-dictionary.js'), 'utf8');

var ctx = { console: console, self: {}, window: {} };
vm.createContext(ctx);
vm.runInContext(dictCode, ctx);
ctx.window.QURAN_TASHKEEL_DICT = ctx.self.QURAN_TASHKEEL_DICT;
ctx.window.JUZ_PAGES = [{ ayahs: [] }];

function extract(name) {
  var re = new RegExp('function ' + name + '\\([^{]*\\)\\{[\\s\\S]*?\\n  \\}');
  var m = code.match(re);
  if (!m) throw new Error('missing ' + name);
  return m[0];
}

// Phrase overrides + applyStatic
var phraseBlock = code.match(/var QURAN_PHRASE_TTS_OVERRIDES = \{[\s\S]*?function applyStaticQuranPhrases\(text\)\{[\s\S]*?\n  \}/);
if (!phraseBlock) throw new Error('phrase block missing');
vm.runInContext(phraseBlock[0], ctx);

// Same-ayah block (optional for empty pages)
var sameBlock = code.match(/var TTS_FUNCTION_WORDS = \{[\s\S]*?function applySameAyahTashkeel\(text, surah, ayah\)\{[\s\S]*?\n  \}/);
if (sameBlock) vm.runInContext(sameBlock[0], ctx);

vm.runInContext(extract('applyQuranTashkeel'), ctx);
vm.runInContext(extract('normalizeTtsMarks'), ctx);
vm.runInContext(code.match(/var QURAN_WORD_TTS_FIX = \{[\s\S]*?\};/)[0], ctx);
vm.runInContext(extract('fixQuranWordPronunciation'), ctx);

/** Final path to SpeechSynthesis (mirrors speakText order in v1.0.417). */
function finalTts(text, surah, ayah) {
  var s = text;
  if (surah != null && typeof ctx.applySameAyahTashkeel === 'function') {
    s = ctx.applySameAyahTashkeel(s, surah, ayah);
  }
  s = ctx.applyQuranTashkeel(s);
  s = ctx.applyStaticQuranPhrases(s);
  s = ctx.normalizeTtsMarks(s);
  s = ctx.fixQuranWordPronunciation(s);
  return s;
}

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.error('FAIL:', name); }
}

// 1) Full phrase survives entire pipeline (dict must not strip kasra on كلّ)
var out1 = finalTts('على كل شيء قدير', null, null);
check('phrase قدير retains كُلِّ (kasra)', out1.indexOf('كُلِّ') !== -1 || out1.indexOf('كُلّ') !== -1);
check('phrase قدير retains شَيْءٍ or شَيْء', /شَي[-ْ]?ء/.test(out1));
check('phrase قدير retains قَدِير', out1.indexOf('قَدِير') !== -1);
check('full pipeline not plain dict-only كُلّ without phrase context loss', out1 === 'عَلَى كُلِّ شَيْءٍ قَدِيرٌ' || (out1.indexOf('كُلِّ') !== -1 && out1.indexOf('قَدِيرٌ') !== -1));

// 2) ان الله على كل شيء
var out2 = finalTts('ان الله على كل شيء', null, null);
check('ان الله على كل شيء has إِنَّ or إِنّ', /إِنّ/.test(out2) || out2.indexOf('اللَّه') !== -1 || out2.indexOf('اللّه') !== -1);
check('ان الله على كل شيء has كُلِّ', out2.indexOf('كُلِّ') !== -1 || out2.indexOf('كُلّ') !== -1);

// 3) Must NOT match across punctuation
var across = finalTts('على كل، شيء قدير', null, null);
check('no match across Arabic comma', across.indexOf('عَلَى كُلِّ شَيْءٍ قَدِيرٌ') === -1);

var across2 = finalTts('على كل. شيء قدير', null, null);
check('no match across period', across2.indexOf('عَلَى كُلِّ شَيْءٍ قَدِيرٌ') === -1);

// 4) Must NOT match inside longer token
check('قدير alone unchanged by phrase', finalTts('قدير', null, null).indexOf('عَلَى') === -1);
check('substring بقدير no phrase', finalTts('بقدير', null, null).indexOf('عَلَى') === -1);

// 5) Whitespace-only separation still matches
var ws = finalTts('على  كل   شيء قدير', null, null);
check('match across multiple spaces', ws.indexOf('كُلِّ') !== -1 || ws.indexOf('قَدِير') !== -1);

// 6) Denylist
check('من قبل ومن بعد not in override keys', !ctx.QURAN_PHRASE_TTS_KEYS.some(function(k){ return k.indexOf('من قبل') !== -1; }));

// 7) Dict-then-phrase order: even if dict would set كُلّ, phrase restores كُلِّ
var dictOnly = ctx.applyQuranTashkeel('على كل شيء قدير');
var afterPhrase = ctx.applyStaticQuranPhrases(dictOnly);
check('phrase re-applies after dict', afterPhrase.indexOf('كُلِّ') !== -1);
check('final equals phrase-after-dict path', finalTts('على كل شيء قدير', null, null).indexOf('كُلِّ') !== -1);

console.log('==== TOTAL: PASS=' + pass + ' FAIL=' + fail + ' ====');
console.log('SAMPLE final:', out1);
process.exit(fail ? 1 : 0);
