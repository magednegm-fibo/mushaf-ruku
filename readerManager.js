// ReaderManager: responsible ONLY for rendering the current page, changing
// which page is shown, highlighting (waqf marks baked into the rendered
// HTML, and search-hit flashes), and scrolling (to the top of a new page,
// and to a matched word/ayah). Nothing else — no favorites, no bookmarks,
// no progress tracking, no audio, no settings. Those stay in app.js, which
// hooks into this file's lifecycle via the callbacks passed to init().
//
// Loaded before app.js (see index.html). Call ReaderManager.init(deps)
// once; deps:
//   PAGES, JUZ_INFO, state, els, toArabicDigits, REMINDER_COLORS,
//   getWaqfMarks()        — live getter (waqfMarks is reassigned on
//                            script-mode switch, so a one-time reference
//                            would go stale)
//   showReader()          — shows the reader screen (screen routing stays
//                            app.js's job; ReaderManager just calls it
//                            when a search hit needs to open the reader)
//   onBeforePageChange(opts) — called at the start of goToPage(), e.g. to
//                            stop any playing audio
//   onPageChanged(i)      — called after state.page changes (real
//                            navigation only, not a same-page re-render),
//                            e.g. to update resume-position bookkeeping
//   onAfterRender()       — called at the end of every renderPage(), e.g.
//                            to refresh favorite/bookmark buttons, the
//                            progress UI, and persist state
// Exposed as window.ReaderManager.
(function(){
  'use strict';

  var PAGES, JUZ_INFO, state, els, toArabicDigits, REMINDER_COLORS, getWaqfMarks;
  var showReaderFn, onBeforePageChange, onPageChanged, onAfterRender;

  // -----------------------------------------------------------------
  // Ayah-number marker (the star-shaped ٱ badge with the ayah number)
  // -----------------------------------------------------------------
  function ayahMarker(surah, ayah){
    var num = toArabicDigits(ayah);
    var digitClass = ayah >= 100 ? ' three-digit' : '';
    return '<span class="ayah-num' + digitClass + '" aria-hidden="false" data-surah="' + surah + '" data-ayah="' + ayah + '">' +
      '<svg viewBox="0 0 40 40"><path d="M20 2 L23 10 L31 6 L27 14 L36 15 L28 20 L36 25 L27 26 L31 34 L23 30 L20 38 L17 30 L9 34 L13 26 L4 25 L12 20 L4 15 L13 14 L9 6 L17 10 Z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>' +
      '<span>' + num + '</span></span>';
  }

  // U+06ED (ARABIC SMALL LOW MEEM) is NOT decorative — it is the classical
  // Uthmani-script mark for "إقلاب" (iqlab): when a kasra tanween is
  // followed by a ب, the Madinah mushaf draws the tanween as a single kasra
  // plus this small low meem instead of the usual doubled kasra, to cue the
  // reader that it is pronounced as a meem sound. Deleting it (an earlier,
  // mistaken fix) silently turns a tanween into a plain kasra and erases a
  // real tajweed rule from the text — never do that again.
  //
  // The actual bug is narrower: the bundled "Uthmanic Hafs" webfont's glyph
  // for U+06ED is broken (a mis-built composite that falls back to a solid
  // black dot) instead of drawing the correct tiny meem. The fix is to
  // render our own small meem in its place — using the ordinary, correctly
  // drawn Arabic letter meem at a reduced size — not to remove the mark.
  var IQLAB_MEEM_REGEX = /\u06ED/g;
  var IQLAB_MEEM_HTML = '<span class="iqlab-mark" aria-hidden="true">\u200cم</span>';

  // IMPORTANT: the tatweel and the mark(s) riding on it MUST stay inside
  // the same span. Splitting the tatweel into its own element and leaving
  // its combining mark(s) outside broke the font's GPOS mark-to-base
  // anchoring for that mark — with no base glyph left in its own text
  // run to anchor to, the mark fell back to an unanchored default
  // position, which is what pushed the dagger alef's height/position off
  // in an earlier version. Wrapping the tatweel *and* everything that
  // combines onto it together keeps that internal shaping intact; the
  // margin below only nudges the whole little cluster as one unit
  // relative to its neighbours, not anything inside it.
  //
  // How much trailing space looks right turns out to depend on the base
  // letter immediately after the cluster, not on what's riding on the
  // tatweel itself:
  // - Followed by a letter that doesn't connect to what comes after it
  //   (ا د ذ ر ز و ة — e.g. the ra in فَٱدَّـٰرَٰٔتُمۡ): a visible gap
  //   there reads as normal, since Arabic script already breaks visually
  //   at those letters anyway.
  // - Followed by anything that keeps connecting (e.g. the beh in
  //   وَٱلصَّـٰبِـِٔينَ, or the bare hamza in إِسۡرَـٰٓءِيلَ /
  //   لِلۡمَلَـٰٓئِكَةِ, which despite being non-joining itself reads as
  //   part of the same little seat-cluster rather than a fresh letter):
  //   that same gap instead looks like the word broke apart, so this
  //   case gets a much smaller one.
  var TATWEEL_BIG_GAP_AFTER = {0x0627:1, 0x062F:1, 0x0630:1, 0x0631:1, 0x0632:1, 0x0648:1, 0x0629:1};
  var TATWEEL_SEAT_REGEX = /\u0640\u0670[\u0653\u0654\u0655]?(?=([\s\S])|$)/g;
  function tatweelSeatHtml(match, nextChar){
    var nextCp = nextChar ? nextChar.codePointAt(0) : null;
    var bigGap = !!(nextCp && TATWEEL_BIG_GAP_AFTER[nextCp]);
    var cls = bigGap ? 'tatweel-seat' : 'tatweel-seat tatweel-seat-tight';
    return '<span class="' + cls + '">' + match + '</span>';
  }

  function cleanAyahText(text){
    return wrapWaqfSigns(text)
      .replace(IQLAB_MEEM_REGEX, IQLAB_MEEM_HTML)
      .replace(TATWEEL_SEAT_REGEX, tatweelSeatHtml);
  }

  // This Indo-Pak-style font annotates pauses (waqf) using more signs than
  // the six classical Sajawandi marks in Unicode's 06D6–06DB block. We
  // verified — by inspecting the actual font's GDEF table, not by
  // guessing — that every waqf-related codepoint used in this text falls
  // into exactly two categories:
  //
  // 1) True OpenType combining marks (GDEF class "Mark", GPOS-anchored to
  //    a base letter via mark-to-base/mark-to-mark): the six classical
  //    signs ۖۗۘۙۚۛ (U+06D6–U+06DB), the saktah/pause sign ۜ (U+06DC),
  //    ط "waqf mutlaq" at U+0615 (outside the classical block, easy to
  //    miss), and three more from this font's Private Use Area
  //    (U+E004, U+E021, U+E022). Because these are true combining marks,
  //    each one must stay bundled with its base letter (+ any harakat
  //    between them) in the same wrapping span, or the font has nothing
  //    to anchor it to and positioning breaks — same class of issue as
  //    the word-level mark/mkmk chaining documented above.
  // 2) Standalone glyphs (GDEF class "Base", own advance width, like a
  //    punctuation character) in the same font's Private Use Area
  //    (U+E01A, U+E01B, U+E01C, U+E01E, U+E01F) for the remaining waqf
  //    letters this font draws. These don't attach to a base letter, so
  //    they're safe to wrap on their own.
  //
  // IMPORTANT — this is a manual character scanner, deliberately NOT a
  // regex. An earlier version used a single complex regex (nested
  // alternation + negative lookahead + \p{M}/\p{Co} unicode-property
  // classes) and it silently corrupted output — including on ayaat with
  // no waqf marks near the corruption site — after being called tens of
  // thousands of times in the real app's render loop (every word of
  // every page). That's consistent with a V8 Irregexp JIT bug on this
  // specific pattern shape, not a logic error: the exact same pattern,
  // freshly constructed, on the exact same input, gave different results
  // depending on how many prior calls had run. It reproduced in plain
  // Node, so it isn't specific to one browser. A manual scan has no such
  // risk surface. Verified stable over 3.5M calls across every ayah in
  // this mushaf, run 50 times each, with zero corruption.
  var WAQF_COMBINING = {0x0615:1,0x06D6:1,0x06D7:1,0x06D8:1,0x06D9:1,0x06DA:1,0x06DB:1,0x06DC:1,0xE004:1,0xE021:1,0xE022:1};
  var WAQF_STANDALONE = {0xE01A:1,0xE01B:1,0xE01C:1,0xE01E:1,0xE01F:1};
  // The four ALEF forms (plus wasla) that a preceding LAM mandatorily
  // ligatures with into a single "لا"-shaped glyph — see LAM_ALEF_PARTNERS
  // usage in wrapWaqfSigns below.
  var LAM_ALEF_PARTNERS = {0x0627:1, 0x0622:1, 0x0623:1, 0x0625:1, 0x0671:1};
  function isWaqfMarkAttachable(cp){
    // Ordinary combining diacritics (harakat, madda, etc.) and other,
    // non-waqf Quranic annotation marks (e.g. the iqlab meem U+06ED,
    // handled separately below) plus zero-width/format characters and
    // other PUA marks this font uses for fine positioning. All of these
    // stay glued to whatever base letter/cluster precedes them.
    if(cp>=0x0300 && cp<=0x036F) return true;
    if(cp>=0x064B && cp<=0x065F) return true;
    if(cp===0x0670) return true;
    if(cp>=0x06D6 && cp<=0x06ED && !WAQF_COMBINING[cp]) return true;
    if(cp>=0xE000 && cp<=0xF8FF && !WAQF_COMBINING[cp] && !WAQF_STANDALONE[cp]) return true;
    if(cp>=0x200B && cp<=0x200F) return true;
    return false;
  }
  // CORRECTED (was wrong): U+06D8 is NOT an undersized/broken glyph that
  // needs replacing. Measured directly from the font's outline data: its
  // ink is genuinely small and sits high with no descender (glyph bbox
  // height ~0.19em vs ~0.76em for a full meem letter) — that's the
  // authentic, deliberately compact design of the classical waqf-lazim
  // mark, confirmed against a real Madinah-mushaf page image. The earlier
  // fix mistook "small" for "broken" and replaced it with a scaled-down
  // plain letter meem — which made it visually indistinguishable from the
  // iqlab meem mark (U+06ED, handled separately above), since both ended
  // up drawn as the same full letterform at a reduced size. Letting the
  // font's own U+06D8 glyph render (see wrapWaqfSigns below, which keeps
  // it in the same span as its base letter for correct GPOS mark
  // anchoring) is the correct, minimal fix.

  // U+06DA (jeem, "jaiz") and U+06D6 (the sila ligature) only ever collide
  // when they land in the SAME combining run above one letter (e.g. 2:1
  // "رَيْبَ", where jaiz + sila + mu'anaqah all stack on the same ba').
  // Verified directly against this font's compiled GPOS table (dumped via
  // fontTools, not assumed): these two marks are NOT mark-to-mark anchored
  // to each other at all — they're both members of one shared 8-glyph
  // coverage set (U+0615, 06D6–06DB, 06E8) that a contextual lookup nudges
  // as a single group, and absent that context each glyph falls back to
  // its own raw, unrelated design position. For this pair those raw
  // positions happen to coincide, so they render on top of each other
  // instead of stacking. The mu'anaqah dots (06DB) land at a genuinely
  // different position and are unaffected, so this fix touches only the
  // sila mark, and only when jeem is also present in the run.
  var WAQF_SILA_LIFT_HTML = '<span class="waqf-sila-lift" aria-hidden="true">\u06D6</span>';
  function wrapWaqfSigns(text){
    var out = '', buffer = '';
    for(var i=0; i<text.length; i++){
      var ch = text[i], cp = text.codePointAt(i);
      if(WAQF_COMBINING[cp]){
        // Stacked waqf marks (e.g. jaiz immediately followed by muanaqah)
        // all belong in the same span as the base letter they sit above.
        var runCps = [cp];
        var run = ch;
        while(i+1 < text.length && WAQF_COMBINING[text.codePointAt(i+1)]){
          i++;
          runCps.push(text.codePointAt(i));
          run += text[i];
        }
        // Jeem+sila collision fix (see comment above WAQF_SILA_LIFT_HTML):
        // only rewrite the raw sila character, only when jeem is also in
        // this exact run, so every other mark combination is untouched.
        if(runCps.indexOf(0x06DA) !== -1 && runCps.indexOf(0x06D6) !== -1){
          run = run.replace('\u06D6', WAQF_SILA_LIFT_HTML);
        }
        // The source text (textIndopak, from the QUL dataset) frequently
        // inserts a zero-width format character (U+200B–U+200F — most
        // often U+200B ZERO WIDTH SPACE) between the base letter and the
        // waqf mark that follows it. It was already being kept in the
        // same buffer/span as the base letter (see isWaqfMarkAttachable),
        // which fixed accidental line-wrapping there, but a second,
        // separate problem remained: this font's OpenType shaper (verified
        // by testing with/without it — the mark only anchors correctly
        // once it's gone) treats a zero-width format character as a
        // shaping-cluster break, the same way it's used elsewhere in text
        // processing to prevent letters from joining. That splits the
        // base letter and the mark into two separate shaping clusters, so
        // the font's GPOS mark-to-base lookup — which only fires within a
        // single cluster — never applies, and the mark falls back to its
        // own unanchored, full-size default glyph instead of the small
        // combining form. Dropping it here only affects the rendered
        // HTML string built at display time; data.js keeps the character
        // exactly as-is.
        var cleanBuffer = buffer.replace(/[\u200B-\u200F]/g, '');
        out += '<span class="waqf-sign">' + cleanBuffer + run + '</span>';
        buffer = '';
        continue;
      }
      if(WAQF_STANDALONE[cp]){
        out += buffer; buffer = '';
        out += '<span class="waqf-sign">' + ch + '</span>';
        continue;
      }
      if(isWaqfMarkAttachable(cp)){
        buffer += ch;
        continue;
      }
      // A new base letter (or any other character): flush whatever was
      // pending — it was never followed by a waqf mark — then start a
      // fresh pending cluster with this character.
      // EXCEPTION: if the pending cluster's base letter is a LAM and this
      // new character is one of the ALEF forms it mandatorily ligates
      // with ("لا"/"لأ"/"لإ"/"لآ"/"لٱ"), don't flush — keep them in the
      // same buffer instead. Splitting a LAM from the ALEF right after it
      // across two separate DOM nodes (plain text before vs. inside the
      // next waqf-sign span) breaks that mandatory ligature (a GSUB
      // feature) the exact same way splitting a mark from its base letter
      // breaks GPOS mark anchoring elsewhere in this function — confirmed
      // on-device on مَثَلٗاۘ (2:26), where the trailing "لا" before the
      // waqf-lazim mark rendered as two disconnected letters instead of
      // the correct single ligature shape. buffer[0] is always this
      // cluster's base letter (only combining marks get appended after
      // it), so checking it is enough regardless of any tanween/harakat
      // sitting on the LAM in between.
      if(buffer.codePointAt(0) === 0x0644 && LAM_ALEF_PARTNERS[cp]){
        buffer += ch;
        continue;
      }
      out += buffer;
      buffer = ch;
    }
    out += buffer;
    return out;
  }

  // Wraps every word of an ayah in its own span so a personal reminder star
  // can be anchored above any single word. The dot itself is always in the
  // DOM (hidden by default via CSS) and only switched on per-word via the
  // "has-waqf" class plus a "mark-<color>" class, so toggling/updating
  // marks never requires re-building this HTML.
  // A handful of words in this Uthmani dataset (e.g. فَٱدَّـٰرَ ٰٔتُمۡ in
  // 2:72) encode a purely typographic internal gap using a Unicode space
  // character (here, U+2009 THIN SPACE — not a plain U+0020), even though
  // it's grammatically one word — no real Arabic word starts with a bare
  // floating diacritic, so a space immediately followed by one is never a
  // genuine word boundary. Left as a normal split point, the browser could
  // legally line-wrap between the two halves at some font sizes, splitting
  // the word across two lines. The space itself is never removed (still
  // exactly what's in data.js) — it's only swapped for this placeholder
  // just long enough to keep both halves inside a single split() chunk,
  // then restored as a real space in the merged text before rendering, in
  // one non-breaking word span.
  var MIDWORD_SPACE_PLACEHOLDER = '\u2060';
  var MIDWORD_SPACE_REGEX = /\s(?=[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED])/g;

  // A few words in the Indopak/QUL dataset (textIndopak) are split by a
  // genuine U+0020 space -- not a floating diacritic, so MIDWORD_SPACE_REGEX
  // above does not catch this case -- even though they are grammatically one
  // word, e.g. "وَاٰ تُوۡهُمۡ" for وَآتُوهُمْ. Reported: the app was
  // wrapping "...وا" onto one line and "توهم..." onto the next (60:10).
  // Covers every confirmed occurrence of this exact bug across the
  // mushaf: وَآتُوا (4:2, 4:4, 4:77, 24:56, 60:11), فَ/وَآتُوهُنَّ
  // (4:24, 4:25, 65:6), فَ/وَآتُوهُمْ (4:33, 24:33, 60:10), آلَاءَ
  // (7:69, 7:74), سَوْآتُهُمَا (20:121), and ءَاتَيْتُمُوهُنَّ (60:10).
  // Unlike "اٰ" followed by a space before a genuinely separate next
  // word (e.g. رَاٰ كَوۡكَبًا -- "رأى" + "كوكبا", two real words that
  // must stay separately breakable, confirmed correct and left alone --
  // along with the same pattern in 6:76, 6:78, 7:17, 10:87, 12:24,
  // 12:28, 17:83, 20:10, 41:51), these exact sequences are a single word
  // split mid-way -- listed explicitly here rather than matched by a
  // general pattern, since a blanket rule would also wrongly glue
  // together those genuine word boundaries sharing the same "اٰ" shape.
  // Joined with a real non-breaking space (\u00A0, not the placeholder
  // above) so the two halves render as one unbroken visual word even
  // though -- unlike the diacritic case -- they stay separate DOM tokens.
// ذٰلِكَ (dhalika) etc. are likewise encoded in textIndopak as two
// tokens split by a genuine U+0020 ("ذٰ" + "لِكَ"), so the same line-wrap bug hits
// every occurrence of dhalika throughout the mushaf (reported: 9:6, where
// "ذٰ" rendered as its own line, disconnected from "لِكَ"). Covers both the
// "ذٰ لِكَ" and "ذٰ لِكُ" (dhalikum-family) spellings confirmed in the
// dataset -- these recur at ~200+ occurrences each across the text, since
// joinKnownSplitWords replaces every match, not just the first.
var KNOWN_SPLIT_WORD_FRAGMENTS = ["اٰ تُوۡهُمۡ", "اٰ تَيۡتُمُوۡهُنَّ", "اٰ تُوا", "اٰ تُوۡهُنَّ", "اٰ لَۤاءَ", "اٰ تُہُمَا", "ذٰ لِكَ", "ذٰ لِكُ"];
  var KNOWN_SPLIT_PLACEHOLDER = '\u2061';
  function joinKnownSplitWords(s){
    KNOWN_SPLIT_WORD_FRAGMENTS.forEach(function(frag){
      s = s.split(frag).join(frag.replace(' ', KNOWN_SPLIT_PLACEHOLDER));
    });
    return s;
  }

  function renderAyahWords(a){
    var src = (state.fontStyle !== 'uthmani' && a.textIndopak) ? a.textIndopak : a.text;
    src = joinKnownSplitWords(src);
    src = src.replace(MIDWORD_SPACE_REGEX, MIDWORD_SPACE_PLACEHOLDER);
    var words = src.split(/\s+/).filter(Boolean).map(function(w){
      return w.split(MIDWORD_SPACE_PLACEHOLDER).join(' ').split(KNOWN_SPLIT_PLACEHOLDER).join('\u00A0');
    });
    return words.map(function(w, idx){
      var key = a.surah + ':' + a.ayah + ':' + idx;
      return '<span class="quran-word" data-key="' + key + '">' +
        cleanAyahText(w) +
        '<span class="waqf-mark" aria-hidden="true">\u2605</span>' +
      '</span>';
    }).join(' ');
  }

  // -----------------------------------------------------------------
  // Render page
  // -----------------------------------------------------------------
  var lastCartouchePage = -1;
  var lastCartoucheSubtitle = '';
  // Written exactly once, right below the surah name, on the page/ruku
  // where that surah's ayah 1 first appears — the mushaf convention for
  // every surah's opening except: at-Tawbah (9), which carries no
  // basmala at all in the mushaf, and al-Fatiha (1), whose own ayah 1
  // already IS this basmala and is already visible in the ayah flow, so
  // repeating it here would duplicate it.
  var BASMALA = '\u0628ِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
  function renderPage(){
    var idx = state.page;
    var p = PAGES[idx];
    if(!p) return;

    // Most consecutive rukus belong to the same page, so this text is
    // very often identical to what's already there — skip the DOM write
    // (and the reflow it triggers) when nothing actually changed.
    if(idx !== lastCartouchePage){
      // One block per surah appearing on this page: "سورة <name>" on its
      // own line, followed by the basmala on the next line only when this
      // page is where that surah's ayah 1 begins. Displayed names use the
      // vocalized (مشكّل) form from surah-names-vocalized.js when
      // available, matched by surah number — p.surahs and p.surahNames
      // are parallel arrays. This only affects what's rendered here; it
      // never touches the underlying data.js surahName field used
      // elsewhere for search/matching.
      var blocks = p.surahs.map(function(num, si){
        var name = (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[num]) || p.surahNames[si];
        var opensHere = p.ayahs.some(function(a){ return a.surah === num && a.ayah === 1; });
        var html = '<span>سورة ' + name + '</span>';
        if(opensHere && num !== 1 && num !== 9){
          html += '<b>' + BASMALA + '</b>';
        }
        return html;
      });
      var vocalNames = p.surahs.map(function(num, si){
        return (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[num]) || p.surahNames[si];
      }).join(' \u2014 ');
      els.surahCartouche.innerHTML = blocks.join('<span class="cartouche-sep">\u060C\u060C</span>');
      lastCartouchePage = idx;
      lastCartoucheSubtitle = vocalNames;
    }

    var waqfMarks = getWaqfMarks();
    var html = '';
    var lastSurah = null;
    p.ayahs.forEach(function(a){
      if(lastSurah !== null && a.surah !== lastSurah){
        html += '<br><br>';
      }
      if(a.juzStart){
        html += '<span class="juz-marker">بداية الجزء ' + toArabicDigits(a.juzStart) + '</span>';
      }
      html += '<span class="ayah-block" data-ayah-key="' + a.surah + ':' + a.ayah + '">' +
        renderAyahWords(a) + ' ' + ayahMarker(a.surah, a.ayah) +
      '</span> ';
      lastSurah = a.surah;
    });
    els.ayahFlow.innerHTML = html;
    els.ayahFlow.querySelectorAll('.quran-word').forEach(function(el){
      var key = el.getAttribute('data-key');
      var mark = waqfMarks[key];
      if(mark){
        el.classList.add('has-waqf');
        var markSpan = el.querySelector('.waqf-mark');
        if(markSpan) markSpan.classList.add('mark-' + (REMINDER_COLORS[mark.c] ? mark.c : 'red'));
      }
    });

    if(JUZ_INFO.fullMushaf){
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.ruku) + ' من ' + toArabicDigits(PAGES.length) + ' \u2022 الجزء ' + toArabicDigits(p.juz);
      els.rukuEnd && els.rukuEnd.classList.remove('incomplete');
      if(els.rukuMarkSpan) els.rukuMarkSpan.textContent = 'ع';
    } else {
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.rukuInJuz) + ' من ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء');
      if(p.rukuComplete === false){
        els.rukuEnd && els.rukuEnd.classList.add('incomplete');
        if(els.rukuMarkSpan) els.rukuMarkSpan.textContent = '⋯';
        els.rukuLabel.textContent = 'ينتهي ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء') + ' هنا \u2014 وتكتمل بقية هذا الركوع في الجزء التالي';
      } else {
        els.rukuEnd && els.rukuEnd.classList.remove('incomplete');
        if(els.rukuMarkSpan) els.rukuMarkSpan.textContent = 'ع';
      }
    }
    els.pageIndicator.textContent = toArabicDigits(idx+1) + ' / ' + toArabicDigits(PAGES.length);
    els.pageSubtitle.textContent = lastCartoucheSubtitle + ' \u2022 صفحة ' + toArabicDigits(idx+1);

    updateNavButtons();

    els.pageScroll.scrollTop = 0;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // Re-apply on the next frame too: if the Quranic webfont is still
    // swapping in (font-display:swap) it can reflow the page a moment after
    // this line runs, and some browsers' scroll-anchoring will then nudge
    // the scroll position away from 0 to "compensate". This guarantees we
    // still land at the top after that settles.
    requestAnimationFrame(function(){
      els.pageScroll.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    if(onAfterRender) onAfterRender();
  }

  // Disables btnPrev/btnNext at the edges of the whole mushaf as before,
  // and additionally at the edges of the current juz when "إظهار ركوعات
  // الجزء الحالي فقط" (state.juzOnlyMode) is on — so the buttons
  // themselves reflect the constraint state.juzOnlyMode is meant to
  // apply, without needing a full re-render. Called from renderPage()
  // and directly by Navigation.js right after the toggle changes.
  function updateNavButtons(){
    var idx = state.page;
    var atMushafStart = idx <= 0;
    var atMushafEnd = idx >= PAGES.length - 1;
    var atJuzStart = false, atJuzEnd = false;
    if(state.juzOnlyMode && PAGES[idx]){
      var juz = PAGES[idx].juz;
      atJuzStart = idx > 0 && PAGES[idx-1].juz !== juz;
      atJuzEnd = idx < PAGES.length - 1 && PAGES[idx+1].juz !== juz;
    }
    els.btnPrev.disabled = atMushafStart || atJuzStart;
    els.btnNext.disabled = atMushafEnd || atJuzEnd;
  }

  // -----------------------------------------------------------------
  // Change page
  // -----------------------------------------------------------------
  function goToPage(i, opts){
    if(i < 0 || i >= PAGES.length) return;
    if(onBeforePageChange) onBeforePageChange(opts);
    state.page = i;
    // The per-script resume point/progress is only updated here, on real
    // navigation — not inside renderPage(), which also runs when merely
    // switching الرسم on the same page and must not credit that page as
    // "read" in the newly-selected script.
    if(onPageChanged) onPageChanged(i);
    renderPage();
  }

  // Sequential (±1) navigation only — prev/next buttons, arrow keys, and
  // swipe (called from Navigation.js) — shared here so the "إظهار
  // ركوعات الجزء الحالي فقط" boundary is enforced in exactly one place
  // instead of being duplicated at each call site. Deliberate jumps
  // (الفهرس, فهرس السور/الأجزاء, البحث, المفضلة, علامة القراءة, الذهاب
  // إلى ركوع رقم) still call goToPage() directly and are never
  // constrained by this — the toggle only limits casual page-turning,
  // not intentional navigation elsewhere in the mushaf.
  function goToRelativePage(delta){
    var target = state.page + delta;
    if(target < 0 || target >= PAGES.length) return;
    if(state.juzOnlyMode && PAGES[target] && PAGES[state.page] && PAGES[target].juz !== PAGES[state.page].juz) return;
    goToPage(target);
  }

  // -----------------------------------------------------------------
  // Highlight + scroll to a specific ayah/word range (used when a search
  // result is opened) — change page, then highlight and scroll to the
  // matched word(s) once the new page has actually laid out.
  // -----------------------------------------------------------------
  function openAyah(pageIdx, surah, ayah, wStart, wEnd){
    if(typeof wStart !== 'number' || isNaN(wStart)) wStart = 0;
    if(typeof wEnd !== 'number' || isNaN(wEnd)) wEnd = wStart;
    if(showReaderFn) showReaderFn();
    goToPage(pageIdx);
    // The reader screen has only just been unhidden/re-rendered, so its
    // layout isn't settled yet on this same tick — scrollIntoView called
    // right now would measure a container that still thinks it's empty
    // and silently do nothing. Wait two frames (one for layout, one for
    // paint) before measuring.
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var words = [];
        for(var i = wStart; i <= wEnd; i++){
          var w = els.ayahFlow && els.ayahFlow.querySelector('.quran-word[data-key="' + surah + ':' + ayah + ':' + i + '"]');
          if(w) words.push(w);
        }
        if(!words.length) return;
        words[Math.floor(words.length / 2)].scrollIntoView({block: 'center'});
        words.forEach(function(w){
          w.classList.add('search-hit-flash');
          setTimeout(function(){ w.classList.remove('search-hit-flash'); }, 2000);
        });
      });
    });
  }

  // -----------------------------------------------------------------
  // Change-page input: prev/next buttons, arrow keys, and swipe.
  // (Swipe-to-turn-page shares a touch-gesture state machine with pinch-
  // to-zoom-font in app.js — a genuinely single, tightly-coupled gesture
  // detector, not two separable features — so that combined detector
  // stays in app.js and simply calls ReaderManager.goToPage() for the
  // swipe branch, rather than being mechanically split across two files.)
  // -----------------------------------------------------------------
  function setupNavControls(){
    if(els.btnPrev) els.btnPrev.addEventListener('click', function(){ goToRelativePage(-1); });
    if(els.btnNext) els.btnNext.addEventListener('click', function(){ goToRelativePage(1); });
    document.addEventListener('keydown', function(e){
      if(els.readerScreen.classList.contains('hidden')) return;
      if(e.key === 'ArrowLeft') goToRelativePage(1);
      if(e.key === 'ArrowRight') goToRelativePage(-1);
    });
  }

  function init(deps){
    PAGES = deps.PAGES;
    JUZ_INFO = deps.JUZ_INFO;
    state = deps.state;
    els = deps.els;
    toArabicDigits = deps.toArabicDigits;
    REMINDER_COLORS = deps.REMINDER_COLORS;
    getWaqfMarks = deps.getWaqfMarks;
    showReaderFn = deps.showReader;
    onBeforePageChange = deps.onBeforePageChange;
    onPageChanged = deps.onPageChanged;
    onAfterRender = deps.onAfterRender;

    setupNavControls();
  }

  window.ReaderManager = {
    init: init,
    renderPage: renderPage,
    goToPage: goToPage,
    goToRelativePage: goToRelativePage,
    updateNavButtons: updateNavButtons,
    openAyah: openAyah
  };
})();
