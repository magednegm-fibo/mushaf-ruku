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
      // ک (U+06A9 KEHEH) is the QUL Indopak dataset's own typographic variant
      // of ك (U+0643 KAF) — used inconsistently within individual words
      // (e.g. فَسَيَكۡفِيۡکَهُمُ at 2:137, وَاشۡکُرُوۡا at 2:152; 149
      // occurrences total in data.js). Without this mapping it fell through
      // to the "drop non-letter symbols" line below and was silently
      // deleted instead of normalized, corrupting the word by one letter
      // and breaking every substring match that needed it — this is the
      // shared root cause behind both regression cases, not two separate
      // per-word bugs.
      .replace(/ک/g, 'ك')
      // Same class of bug, different Perso-Arabic typesetting variants used
      // by this dataset — each verified in context (grep across data.js)
      // to consistently stand in for one single standard letter, with no
      // ambiguity, before being added here:
      .replace(/ی/g, 'ي')  // FARSI YEH (U+06CC) — e.g. عَلَیْکُمْ
      .replace(/ڪ/g, 'ك')  // SWASH KAF (U+06AA) — e.g. الۡڪِتٰبُ, ڪَفَرُوۡا
      .replace(/ہ/g, 'ه')  // HEH GOAL (U+06C1) — e.g. اَخَاہُ, بِّہِمۡ
      .replace(/ھ/g, 'ه')  // HEH DOACHASHMEE (U+06BE) — e.g. اَحۡيَاھُمۡ
      .replace(/ے/g, 'ي')  // YEH BARREE (U+06D2) — e.g. عَسَے for عَسَى
      .replace(/ﺎ/g, 'ا')  // ARABIC LETTER ALEF FINAL FORM (U+FE8E) — a pure
                            // OpenType presentation-form glyph, unlike the
                            // Perso-Arabic variants above; by Unicode design
                            // a presentation form is always the same letter
                            // as its base form, never ambiguous. One stray
                            // occurrence in data.js (4:4), likely a
                            // copy/paste artifact from the source dataset.
      // NOT mapped: ٴ (U+0674 ARABIC LETTER HIGH HAMZA) — tried this first,
      // caught by testing before shipping it. It looks like a clear hamza
      // substitute at a glance, but this dataset uses it in two genuinely
      // different roles: a real standalone hamza that should be preserved
      // (دِفۡ ٴٌ = دِفۡءٞ) AND a seated hamza standing in for a hamza-on-alef
      // that the existing إأآٱ rule normalizes away to plain ا instead of
      // keeping (لَاَمۡلَــٴَــنَّ = لَأَمۡلَأَنَّ) or for a hamza-on-yeh
      // that the existing ئ rule normalizes to ي, not ء (شَاطِیٴِ =
      // الشَّاطِئِ). One regex can't route to three different targets by
      // context, so — same as dotless beh — this stays unmapped rather than
      // silently producing a wrong match in two out of three of its uses.
      // NOT mapped: ٮ (U+066E DOTLESS BEH, 1029 occurrences) — checked in
      // context and it is genuinely ambiguous in this dataset, sometimes a
      // hamza-seat (اُولٰٓٮِٕكَ = أُولَـٰٓئِكَ) and sometimes a plain
      // alef-maksura/yeh substitute (فَسَوّٰٮهُنَّ = فَسَوَّىٰهُنَّ) with
      // no single reliable target — does not meet the "clear letter-form
      // equivalent" bar the other mappings above do, so it's left dropped
      // rather than guessed at.
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
  // (as opposed to just the ayah's first word). Tokenizes via
  // ReaderManager.tokenizeAyahWords() — the SAME function readerManager.js
  // itself uses to decide what counts as a "word" when it builds the
  // .quran-word spans (see renderAyahWords in readerManager.js) — instead
  // of splitting independently here, so the returned indices always line
  // up with the real data-key word spans in the DOM, even on ayaat whose
  // Indopak text encodes a waqf mark as its own space-delimited token
  // (e.g. 2:137) where a naive whitespace split disagrees with the DOM's
  // actual word count. Falls back to a plain whitespace split only if
  // ReaderManager hasn't loaded for some reason, so this never hard-fails.
  // Returns {start, end} word indices (inclusive), or null if it can't be
  // found (shouldn't normally happen since the ayah only got here by
  // matching).
  function findMatchWordRange(fullText, query){
    var normQuery = normalizeArabic(query);
    if(!normQuery) return null;
    var words = (window.ReaderManager && window.ReaderManager.tokenizeAyahWords)
      ? window.ReaderManager.tokenizeAyahWords(fullText)
      : fullText.split(/\s+/).filter(Boolean);
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
