// SearchManager: the search engine for this app, in one place. Holds two
// in-memory indexes — a surah-name jump table and a flat, normalized ayah
// index — and never rebuilds either one once built. Both are built lazily
// (see ensureSurahIndexBuilt/ensureAyahIndexBuilt) on first actual need
// rather than unconditionally at startup, since a given session may never
// touch search, the السور index panel, or "play whole surah" at all.
// Loaded before app.js (see index.html), exposed as window.SearchManager.
// Call SearchManager.init(PAGES) once before using anything else here.
(function(){
  'use strict';

  var PAGES = [];

  function init(pages){
    PAGES = pages || [];
  }

  // -----------------------------------------------------------------
  // Surah index: surah number -> first ruku-page index, plus an
  // ordered {surah, name, page} list for browsing/search-by-name.
  // -----------------------------------------------------------------
  var surahJumpMap = {};
  var surahOrder = [];
  var surahIndexBuilt = false;
  function ensureSurahIndexBuilt(){
    if(surahIndexBuilt) return;
    surahIndexBuilt = true;
    PAGES.forEach(function(p, i){
      p.ayahs.forEach(function(a){
        if(a.ayah === 1 && !(a.surah in surahJumpMap)){
          surahJumpMap[a.surah] = i;
          surahOrder.push({surah: a.surah, name: a.surahName, page: i});
        }
      });
    });
    surahOrder.sort(function(a,b){ return a.surah - b.surah; });
  }
  function getSurahOrder(){
    ensureSurahIndexBuilt();
    return surahOrder;
  }
  function getSurahStartPage(surahNum){
    ensureSurahIndexBuilt();
    return surahJumpMap[surahNum];
  }
  function searchSurahs(query){
    var list = getSurahOrder();
    if(!query) return list;
    return list.filter(function(s){ return s.name.indexOf(query) !== -1; });
  }

  // -----------------------------------------------------------------
  // Text normalization — strips diacritics (harakat, tanween, sukun,
  // shadda, Quranic annotation and small waqf marks) and folds letter
  // variants (alef forms, ta marbuta, alef maksura) so a search for a
  // plain-typed word like "الرحمن" matches the fully-vocalized Mushaf
  // text "ٱلرَّحۡمَٰنِ" regardless of which diacritics/marks sit on the
  // letters.
  // -----------------------------------------------------------------
  function normalizeArabic(s){
    return (s || '')
      .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED\u0670\u08F0-\u08FF\u06DF\u06E0-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '')
      .replace(/[\u0640]/g, '')            // tatweel
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[^\u0621-\u064A\s]/g, '')  // drop non-letter symbols (۩ ۞ ۚ ۖ ...)
      .replace(/\s+/g, ' ')
      .trim();
  }

  // -----------------------------------------------------------------
  // Ayah index: flat, search-friendly list of every ayah in the mushaf
  // (both script variants, pre-normalized), built once on first search
  // — not at startup — and kept in memory for the rest of the session.
  // -----------------------------------------------------------------
  var ayahIndex = [];
  var ayahIndexBuilt = false;
  function ensureAyahIndexBuilt(){
    if(ayahIndexBuilt) return;
    ayahIndexBuilt = true;
    PAGES.forEach(function(p, i){
      p.ayahs.forEach(function(a){
        ayahIndex.push({
          surah: a.surah, surahName: a.surahName, ayah: a.ayah, page: i,
          text: a.text, textIndopak: a.textIndopak || a.text,
          norm: normalizeArabic(a.text),
          normIndopak: normalizeArabic(a.textIndopak || a.text)
        });
      });
    });
  }

  var AYAH_SEARCH_LIMIT = 80; // keep the result list scrollable, not a full concordance
  function searchAyahs(query){
    ensureAyahIndexBuilt();
    var q = normalizeArabic(query);
    if(!q) return [];
    var out = [];
    for(var i = 0; i < ayahIndex.length && out.length < AYAH_SEARCH_LIMIT; i++){
      var e = ayahIndex[i];
      if(e.norm.indexOf(q) !== -1 || e.normIndopak.indexOf(q) !== -1) out.push(e);
    }
    return out;
  }

  // Builds a short snippet centred on the match so long ayaat don't force
  // the result list into a wall of text; falls back to the full ayah when
  // it's already short enough.
  function ayahSnippet(fullText, query){
    var SNIPPET_RADIUS = 40;
    if(fullText.length <= SNIPPET_RADIUS * 2) return fullText;
    var idx = normalizeArabic(fullText).indexOf(normalizeArabic(query));
    if(idx === -1) return fullText.slice(0, SNIPPET_RADIUS * 2) + '…';
    var start = Math.max(0, idx - SNIPPET_RADIUS);
    var end = Math.min(fullText.length, idx + query.length + SNIPPET_RADIUS);
    return (start > 0 ? '…' : '') + fullText.slice(start, end) + (end < fullText.length ? '…' : '');
  }

  // Locates which word(s) of the ayah actually contain the search match
  // (as opposed to just the ayah's first word), using the exact same
  // whitespace-splitting renderAyahWords (in app.js) uses, so the returned
  // indices line up with the real data-key word spans in the DOM. Returns
  // {start, end} word indices (inclusive), or null if it can't be found
  // (shouldn't normally happen since the ayah only got here by matching).
  function findMatchWordRange(fullText, query){
    var normQuery = normalizeArabic(query);
    if(!normQuery) return null;
    var words = fullText.split(/\s+/).filter(Boolean);
    var offsets = [];
    var acc = '';
    words.forEach(function(w, i){
      if(acc.length) acc += ' ';
      var start = acc.length;
      acc += normalizeArabic(w);
      offsets.push({start: start, end: acc.length, idx: i});
    });
    var pos = acc.indexOf(normQuery);
    if(pos === -1) return null;
    var endPos = pos + normQuery.length;
    var startIdx = null, endIdx = null;
    offsets.forEach(function(o){
      if(startIdx === null && o.start <= pos && pos < o.end) startIdx = o.idx;
      if(o.start < endPos && endPos <= o.end) endIdx = o.idx;
    });
    if(startIdx === null) startIdx = 0;
    if(endIdx === null || endIdx < startIdx) endIdx = startIdx;
    return {start: startIdx, end: endIdx};
  }

  window.SearchManager = {
    init: init,
    normalizeArabic: normalizeArabic,
    getSurahOrder: getSurahOrder,
    getSurahStartPage: getSurahStartPage,
    searchSurahs: searchSurahs,
    searchAyahs: searchAyahs,
    ayahSnippet: ayahSnippet,
    findMatchWordRange: findMatchWordRange
  };
})();
