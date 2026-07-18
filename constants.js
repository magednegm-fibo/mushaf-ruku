// Centralized localStorage key constants. Previously these were declared
// directly inside app.js's closure; moved here so every key string that
// the app reads/writes exists in exactly one place, making it easy to
// audit what's stored and avoiding any risk of two different parts of the
// app drifting to slightly different key strings for the same data.
// Loaded before app.js (see index.html) and exposed as window.MUSHAF_KEYS.
(function(){
  'use strict';

  var STORAGE_KEY = 'juzamma_v1';
  var FAV_KEY = 'quranRuku_favorites_v1';
  var BOOKMARK_KEY = 'quranRuku_bookmark_v1';
  // Marks are stored per script mode (see waqfKeyForStyle below) so a
  // reminder placed on the Madinah mushaf doesn't appear on the Naskh
  // Ta'liq mushaf, or vice versa — the two are independent readings of
  // the same ayaat, with independent word positions.
  var WAQF_KEY_LEGACY = 'quranRuku_waqfMarks_v1';
  function waqfKeyForStyle(style){
    return WAQF_KEY_LEGACY + '_' + (style === 'uthmani' ? 'uthmani' : 'indopak');
  }

  // منازل القرآن السبعة (تقسيم "فاتحون" التقليدي): رقم سورة بداية كل
  // منزل. مصدر واحد مشترك بين navigation.js (فلترة الفهرس ورؤوس المنازل
  // في فهرس السور) و readerManager.js (تقييد التنقّل بالسحب عند اختيار
  // "ركوعات المَنزِل الحالي" في نطاق العرض) — بدل تكرار نفس الأرقام في
  // أكتر من ملف.
  var MANZIL_STARTS = [1, 5, 10, 17, 26, 37, 50];
  // Given a surah number, returns {start, end} — the surah-number range
  // of the manzil it falls in. end is 114 (سورة الناس) for the last
  // manzil since there's no next boundary to subtract from.
  function getManzilRange(surahNum){
    var start = MANZIL_STARTS[0];
    for(var i = 0; i < MANZIL_STARTS.length; i++){
      if(MANZIL_STARTS[i] <= surahNum) start = MANZIL_STARTS[i];
      else break;
    }
    var idx = MANZIL_STARTS.indexOf(start);
    var end = (idx < MANZIL_STARTS.length - 1) ? (MANZIL_STARTS[idx + 1] - 1) : 114;
    return {start: start, end: end};
  }

  window.MUSHAF_KEYS = {
    STORAGE_KEY: STORAGE_KEY,
    FAV_KEY: FAV_KEY,
    BOOKMARK_KEY: BOOKMARK_KEY,
    WAQF_KEY_LEGACY: WAQF_KEY_LEGACY,
    waqfKeyForStyle: waqfKeyForStyle
  };
  window.MANZIL_STARTS = MANZIL_STARTS;
  window.getManzilRange = getManzilRange;
})();
