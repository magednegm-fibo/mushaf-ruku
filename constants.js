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

  window.MUSHAF_KEYS = {
    STORAGE_KEY: STORAGE_KEY,
    FAV_KEY: FAV_KEY,
    BOOKMARK_KEY: BOOKMARK_KEY,
    WAQF_KEY_LEGACY: WAQF_KEY_LEGACY,
    waqfKeyForStyle: waqfKeyForStyle
  };
})();
