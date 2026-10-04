#!/usr/bin/env node
// =============================================================================
// tokenize.js — نسخة طبق الأصل من دالة tokenizeAyahWords() الحقيقية في
// readerManager.js، لغرض واحد فقط: التحقق من صحة مواضع الكلمات في
// qcf-words.json مقابل نص data.js الفعلي، قبل أي بناء لخط QCF المُجمَّع.
//
// هذا الملف نسخة يدوية، لا استيراد مباشر، لأن readerManager.js مكتوب
// كـ IIFE مغلق لا يُصدِّر tokenizeAyahWords للخارج. إن عُدِّلت هذه الدالة
// يومًا داخل readerManager.js (نادر جدًا، توثيقها الداخلي صريح أنها
// "المكان الوحيد" الذي يقرر تقطيع الكلمات)، يجب نسخ التعديل هنا يدويًا
// أيضًا — ابحث عن "function tokenizeAyahWords" في readerManager.js
// للمقارنة عند الشك.
//
// الاستخدام (يُستدعى من build_qcf_font.py تلقائيًا، لا حاجة لتشغيله يدويًا):
//   node tokenize.js /path/to/data.js '[[2,40],[2,43]]'
//   -> يطبع JSON: {"2:40": ["word0","word1",...], "2:43": [...]}
// =============================================================================

var fs = require('fs');

var dataJsPath = process.argv[2];
var targetsJson = process.argv[3];

if (!dataJsPath || !targetsJson) {
  console.error('usage: node tokenize.js <path-to-data.js> <json-array-of-[surah,ayah]>');
  process.exit(1);
}

var targets = JSON.parse(targetsJson);

// --- نسخة طبق الأصل من readerManager.js — لا تُعدَّل هنا وحدها ---
var KNOWN_SPLIT_WORD_FRAGMENTS = ["اٰ تُوۡهُمۡ", "اٰ تَيۡتُمُوۡهُنَّ", "اٰ تُوا", "اٰ تُوۡهُنَّ", "اٰ لَۤاءَ", "اٰ تُہُمَا", "ذٰ لِكَ", "ذٰ لِكُ", "اَ لَّا", "اَ لَّذِيۡنَ", "اَ كّٰلُوۡنَ", "وَاَ لۡقَيۡنَا", "اَ لِيۡمٌ‏", "اَ لِيۡمٍ‏", "فَاَ لَّفَ", "اَ لِيۡمًا‏", "اَ لۡقٰٓى", "اَ لۡقٰٮهَاۤ", "اَ لِيۡمًا", "اَ لۡيَوۡمَ", "اَ لِيۡمٌۢ", "اَ لۡفًا", "اَ لِيۡمٍۙ‏", "اَ لۡحَمۡدُ", "اَ لَّنۡ", "اَ لَمۡ", "وَاَ لۡقِ", "اَ لِيۡمٍ‏", "اَ لۡمُلۡكُ", "اَ لِيۡمًا", "فَاَ لۡقٰى", "فَاَ لۡقِيۡهِ", "اَ لۡقِ", "اَ لۡفَ", "وَاَ لۡقٰى", "اَ لِيۡمًا‏", "اَ لۡحَـقۡتُمۡ", "اَ لۡوَانُهٗ", "اَ لَيۡسَ", "اَ لِيۡمٌۙ‏", "فَاَ لۡقِيٰهُ"];
var KNOWN_SPLIT_PLACEHOLDER = '\u2061';
function joinKnownSplitWords(s) {
  KNOWN_SPLIT_WORD_FRAGMENTS.forEach(function (frag) {
    s = s.split(frag).join(frag.replace(' ', KNOWN_SPLIT_PLACEHOLDER));
  });
  return s;
}
var MIDWORD_SPACE_PLACEHOLDER = '\u2060';
var MIDWORD_SPACE_REGEX = /\s(?=[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED])/g;
function tokenizeAyahWords(rawText) {
  var src = joinKnownSplitWords(rawText);
  src = src.replace(MIDWORD_SPACE_REGEX, MIDWORD_SPACE_PLACEHOLDER);
  return src.split(/\s+/).filter(Boolean);
}
// --- نهاية النسخة طبق الأصل ---

var raw = fs.readFileSync(dataJsPath, 'utf8').replace('window.JUZ_PAGES', 'var __DATA');
eval(raw);

var wanted = {};
targets.forEach(function (t) { wanted[t[0] + ':' + t[1]] = true; });

var out = {};
__DATA.forEach(function (page) {
  page.ayahs.forEach(function (a) {
    var key = a.surah + ':' + a.ayah;
    if (wanted[key]) {
      out[key] = tokenizeAyahWords(a.text);
    }
  });
});

console.log(JSON.stringify(out));
