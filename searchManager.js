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
  // Matches on the normalized surah name (same normalizeArabic() pipeline
  // used everywhere else in this file) rather than the raw string, so a
  // plain-typed query like "النساء" still matches even if the underlying
  // surahName ever carries diacritics/letter-variants. No separate
  // normalization logic here — reuses normalizeArabic().
  //
  // `exact` (defaults to false, so existing callers that never pass it
  // keep the old substring behavior) makes this honor the SAME
  // word-boundary contract as exact-mode ayah search — see
  // findBoundedIndex() below, reused here rather than reimplemented.
  // Fixes a real correctness bug: with "مطابقة تامة" (exact match)
  // switched on, searching "الكافر" was still surfacing surah 109
  // "الكافرون" as a surah-name match, because searchSurahs() never
  // received the exact flag at all and always did plain substring/
  // prefix matching — "الكافر" is a literal prefix of "الكافرون", so it
  // "matched" even though they're different words, silently
  // contradicting what ayah search already enforced in exact mode. See
  // tests/search-regression.js Section F.
  function searchSurahs(query, exact){
    var list = getSurahOrder();
    var q = normalizeArabic(query);
    if(!q) return list;
    return list.filter(function(s){
      var normName = normalizeArabic(s.name);
      return exact ? (findBoundedIndex(normName, q) !== -1) : (normName.indexOf(q) !== -1);
    });
  }

  // -----------------------------------------------------------------
  // Unified search (البحث الموحّد): a single query box searches BOTH
  // surah names and ayah text, surah matches first. This is purely an
  // additional combination of the two existing, independent search
  // sources above (searchSurahs / searchAyahs) — it does not introduce
  // any new normalization or matching logic of its own, per the
  // project's "one normalization pipeline" design. UI layers (see
  // navigation.js) render `.surahs` as surah-index cards and `.ayahs`
  // exactly like a plain searchAyahs() result list. `exact` applies
  // identically to both sources (see searchSurahs's own doc comment for
  // why this matters) — one "مطابقة تامة" switch, one consistent
  // meaning across the whole unified result, not just the ayah half.
  // -----------------------------------------------------------------
  function searchUnified(query, exact){
    var q = normalizeArabic(query);
    return {
      surahs: q ? searchSurahs(query, exact) : [],
      ayahs: searchAyahs(query, exact)
    };
  }

  // -----------------------------------------------------------------
  // Text normalization — strips diacritics (harakat, tanween, sukun,
  // shadda, Quranic annotation and small waqf marks) and folds letter
  // variants (alef forms, ta marbuta, alef maksura) so a search for a
  // plain-typed word like "الرحمن" matches the fully-vocalized Mushaf
  // text "ٱلرَّحۡمَٰنِ" regardless of which diacritics/marks sit on the
  // letters.
  // -----------------------------------------------------------------
  // Core diacritic-stripping + letter-variant-folding pipeline shared by
  // both normalization modes below. daggerAlifTo controls the one
  // genuinely ambiguous step: what a dagger alif (\u0670) becomes.
  //   '' (stripped)  -- the ayah's literal rasm: no letter there at all.
  //   'ا' (inserted) -- the letter the pronunciation implies, which is
  //                    how a person would normally type the word.
  // Every OTHER step here (harakat, tatweel, hamza-seat/ta marbuta/alef
  // maksura folding, Perso-Arabic letter variants) is unambiguous and
  // shared by both modes.
  // -----------------------------------------------------------------
  // Type-safe string coercion. `s || ''` (used everywhere below before
  // this fix) only guards against FALSY inputs (null/undefined/''/0) —
  // any truthy non-string (a number, boolean, plain object, array...)
  // sails straight through and crashes the very next `.replace()` call
  // with "X.replace is not a function". In normal use every query
  // originates from a DOM <input>.value (always a string already), so
  // this never fires from the UI — but SearchManager's functions are a
  // public API (used directly by tests, and potentially by future
  // callers such as a deep-link handler), and a search box should never
  // throw on bad input, only ever return "no results". See
  // tests/search-regression.js Section E for the regression cases this
  // guards.
  // -----------------------------------------------------------------
  function toSearchString(s){
    return (typeof s === 'string') ? s : (s == null ? '' : String(s));
  }

  function normalizeArabicCore(s, daggerAlifTo){
    return toSearchString(s)
      .replace(/\u0670/g, daggerAlifTo)
      .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED\u08F0-\u08FF\u06DF\u06E0-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '')
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
  // "مطابقة تامة" (exact match) mode: the TRUE rasm as written, dagger
  // alif treated as no letter — this is what makes exact mode able to
  // isolate a specific spelling variant (e.g. "سبحان" written outright
  // only at 17:93, vs the dagger-alif spelling everywhere else).
  function normalizeArabic(s){
    return normalizeArabicCore(s, '');
  }
  // Normal/tolerant search's second interpretation: dagger alif treated
  // as the letter its pronunciation implies. A data-driven sweep of the
  // whole dataset (comparing every word that appears BOTH ways somewhere
  // in the Quran) found 578+ distinct words affected -- far too many to
  // hand-list -- so rather than building or maintaining any such table,
  // searchAyahs()/findMatchWordRange() below just try BOTH
  // interpretations for every word, every time, and accept either one
  // that matches. This can never lose a result to an unlisted exception,
  // since nothing is listed -- every word is covered by construction.
  function normalizeArabicAlifInserted(s){
    return normalizeArabicCore(s, 'ا');
  }
  // Third interpretation: a handful of famous words (الصلاة، الزكاة،
  // الحياة...) are written in classical Quranic rasm with a waw standing
  // in for the alif itself -- "الصلوٰة" rather than "الصلاٰة" -- and this
  // is IDENTICAL in both mushaf scripts (confirmed: Uthmani and Indopak
  // both write و immediately followed by dagger alif here), so comparing
  // the two scripts against each other can never surface it — both
  // agree with each other and disagree with how the word is normally
  // typed. Collapsing that و+dagger-alif pair to a plain ا before the
  // usual pipeline runs fixes it.
  //
  // SCOPED to only fire when the dagger alif is immediately followed by
  // ة (ta marbuta) — verified by an index-based (not visual/copy-paste —
  // RTL combining-mark rendering is unreliable for that, learned the
  // hard way earlier in this project) scan of every true و+dagger-alif
  // adjacency in the dataset: 175 occurrences are this ة-suffixed
  // pattern (صلاة/زكاة/حياة/غداة/مشكاة family) and collapsing them is
  // correct. The other 327 are NOT safe to collapse — و there is a real
  // letter that must stay: followed by ت it's the السماوات plural
  // pattern (سَمَاوَات genuinely needs the و), followed by ى it's a
  // alif-maqsura-ending root where و is a true root letter (التقوى،
  // الهوى، النجوى — normal spelling keeps the و, "تقوى" not "تقاى"),
  // followed by ه it's the same (مأواهم، هواه). An earlier unscoped
  // version of this function collapsed ALL of them, silently corrupting
  // those 327 words into forms nobody would ever type — masked because
  // those specific words still happened to resolve via the OTHER two
  // interpretations, but a real false-positive risk regardless. See
  // tests/search-regression.js Section A4 for the regression cases that
  // pin this down.
  function normalizeArabicWawAlifCollapsed(s){
    return normalizeArabicCore(toSearchString(s).replace(/و\u0670(?=ة)/g, 'ا'), 'ا');
  }

  // -----------------------------------------------------------------
  // Ayah index: flat, search-friendly list of every ayah in the mushaf
  // (both script variants, pre-normalized), built once on first search
  // — not at startup — and kept in memory for the rest of the session.
  // normStrict/normIndopakStrict: dagger alif = no letter (true rasm) —
  // used for مطابقة تامة. normIns/normIndopakIns and normWaw/
  // normIndopakWaw are tolerant search's other two interpretations (see
  // searchAyahs below).
  // -----------------------------------------------------------------
  var ayahIndex = [];
  var ayahIndexBuilt = false;
  function ensureAyahIndexBuilt(){
    if(ayahIndexBuilt) return;
    ayahIndexBuilt = true;
    PAGES.forEach(function(p, i){
      p.ayahs.forEach(function(a){
        var indopak = a.textIndopak || a.text;
        ayahIndex.push({
          surah: a.surah, surahName: a.surahName, ayah: a.ayah, page: i,
          text: a.text, textIndopak: indopak,
          normStrict: normalizeArabic(a.text),
          normIndopakStrict: normalizeArabic(indopak),
          normIns: normalizeArabicAlifInserted(a.text),
          normIndopakIns: normalizeArabicAlifInserted(indopak),
          normWaw: normalizeArabicWawAlifCollapsed(a.text),
          normIndopakWaw: normalizeArabicWawAlifCollapsed(indopak)
        });
      });
    });
  }

  // For "مطابقة تامة" (exact match) mode: query must occur at word
  // boundaries in the normalized text — space or string start/end on
  // both sides — not just anywhere inside a longer word. E.g. exact
  // "له" won't match inside "الله" or "لهم". Returns the index of the
  // first bounded match, or -1. Shared by searchAyahs and
  // findMatchWordRange so both modes agree on exactly which occurrence
  // counts as "the" match.
  function findBoundedIndex(text, query){
    var idx = text.indexOf(query);
    while(idx !== -1){
      var beforeOk = idx === 0 || text.charAt(idx - 1) === ' ';
      var afterPos = idx + query.length;
      var afterOk = afterPos === text.length || text.charAt(afterPos) === ' ';
      if(beforeOk && afterOk) return idx;
      idx = text.indexOf(query, idx + 1);
    }
    return -1;
  }

  var AYAH_SEARCH_LIMIT = 80; // keep the result list scrollable, not a full concordance
  function searchAyahs(query, exact){
    ensureAyahIndexBuilt();
    var q = normalizeArabic(query);
    if(!q) return [];
    var out = [];
    for(var i = 0; i < ayahIndex.length && out.length < AYAH_SEARCH_LIMIT; i++){
      var e = ayahIndex[i];
      var hit = exact
        ? (findBoundedIndex(e.normStrict, q) !== -1 || findBoundedIndex(e.normIndopakStrict, q) !== -1)
        : (e.normStrict.indexOf(q) !== -1 || e.normIndopakStrict.indexOf(q) !== -1
           || e.normIns.indexOf(q) !== -1 || e.normIndopakIns.indexOf(q) !== -1
           || e.normWaw.indexOf(q) !== -1 || e.normIndopakWaw.indexOf(q) !== -1);
      if(hit) out.push(e);
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
  // matching). Tries the strict (true-rasm) interpretation first, then —
  // for tolerant mode only — the other two, mirroring exactly how
  // searchAyahs() above decided this ayah was a hit in the first place.
  function findMatchWordRange(fullText, query, exact){
    var normQuery = normalizeArabic(query);
    if(!normQuery) return null;
    var words = (window.ReaderManager && window.ReaderManager.tokenizeAyahWords)
      ? window.ReaderManager.tokenizeAyahWords(fullText)
      : fullText.split(/\s+/).filter(Boolean);
    function tryInterpretation(normalizer){
      var offsets = [];
      var acc = '';
      words.forEach(function(w, i){
        if(acc.length) acc += ' ';
        var start = acc.length;
        acc += normalizer(w);
        offsets.push({start: start, end: acc.length, idx: i});
      });
      var pos = exact ? findBoundedIndex(acc, normQuery) : acc.indexOf(normQuery);
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
    var range = tryInterpretation(normalizeArabic);
    if(!range && !exact){
      range = tryInterpretation(normalizeArabicAlifInserted) || tryInterpretation(normalizeArabicWawAlifCollapsed);
    }
    return range || null;
  }

  window.SearchManager = {
    init: init,
    normalizeArabic: normalizeArabic,
    getSurahOrder: getSurahOrder,
    getSurahStartPage: getSurahStartPage,
    searchSurahs: searchSurahs,
    searchAyahs: searchAyahs,
    searchUnified: searchUnified,
    ayahSnippet: ayahSnippet,
    findMatchWordRange: findMatchWordRange,
    AYAH_SEARCH_LIMIT: AYAH_SEARCH_LIMIT
  };
})();
