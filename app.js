(function(){
  'use strict';

  var PAGES = window.JUZ_PAGES || window.JUZ_AMMA_PAGES || [];
  var JUZ_INFO = window.JUZ_INFO || {name: 'جزء عمّ', shortName: 'جزء عمّ', rukuCount: PAGES.length, ayahCount: 0};
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

  var state = loadState();
  var favorites = loadFavorites();
  var bookmark = loadBookmark();
  var waqfMarks = loadWaqfMarks();
  var pendingFavPage = null;

  var els = {
    pageScroll: document.getElementById('pageScroll'),
    surahCartouche: document.getElementById('surahCartouche'),
    ayahFlow: document.getElementById('ayahFlow'),
    rukuLabel: document.getElementById('rukuLabel'),
    pageIndicator: document.getElementById('pageIndicator'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnIndex: document.getElementById('btnIndex'),
    btnCloseIndex: document.getElementById('btnCloseIndex'),
    indexPanel: document.getElementById('indexPanel'),
    indexList: document.getElementById('indexList'),
    btnSettings: document.getElementById('btnSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    settingsPanel: document.getElementById('settingsPanel'),
    fontMinus: document.getElementById('fontMinus'),
    fontPlus: document.getElementById('fontPlus'),
    fontSizeLabel: document.getElementById('fontSizeLabel'),
    nightToggle: document.getElementById('nightToggle'),

    homeScreen: document.getElementById('homeScreen'),
    readerScreen: document.getElementById('readerScreen'),
    btnHome: document.getElementById('btnHome'),
    btnContinue: document.getElementById('btnContinue'),
    homeProgressFill: document.getElementById('homeProgressFill'),
    homeProgressPercent: document.getElementById('homeProgressPercent'),
    homeProgressText: document.getElementById('homeProgressText'),
    stripFill: document.getElementById('stripFill'),
    settingsProgress: document.getElementById('settingsProgress'),
    btnResetProgress: document.getElementById('btnResetProgress'),

    tileSurah: document.getElementById('tileSurah'),
    tileJuz: document.getElementById('tileJuz'),
    tileSearch: document.getElementById('tileSearch'),
    tileFavorites: document.getElementById('tileFavorites'),
    tileSettings: document.getElementById('tileSettings'),

    surahPanel: document.getElementById('surahPanel'),
    surahList: document.getElementById('surahList'),
    btnCloseSurah: document.getElementById('btnCloseSurah'),

    juzPanel: document.getElementById('juzPanel'),
    juzList: document.getElementById('juzList'),
    btnCloseJuz: document.getElementById('btnCloseJuz'),

    searchPanel: document.getElementById('searchPanel'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    btnCloseSearch: document.getElementById('btnCloseSearch'),

    favoritesPanel: document.getElementById('favoritesPanel'),
    favoritesList: document.getElementById('favoritesList'),
    btnCloseFavorites: document.getElementById('btnCloseFavorites'),

    btnFavorite: document.getElementById('btnFavorite'),
    favModal: document.getElementById('favModal'),
    favNameInput: document.getElementById('favNameInput'),
    favModalCancel: document.getElementById('favModalCancel'),
    favModalSave: document.getElementById('favModalSave'),

    btnBookmark: document.getElementById('btnBookmark'),
    bookmarkCard: document.getElementById('bookmarkCard'),
    bookmarkCardText: document.getElementById('bookmarkCardText'),
    toast: document.getElementById('toast'),

    btnGoto: document.getElementById('btnGoto'),
    gotoModal: document.getElementById('gotoModal'),
    gotoInput: document.getElementById('gotoInput'),
    gotoModalCancel: document.getElementById('gotoModalCancel'),
    gotoModalGo: document.getElementById('gotoModalGo'),
    gotoError: document.getElementById('gotoError'),

    waqfMenu: document.getElementById('waqfMenu'),
    waqfMenuItem: document.getElementById('waqfMenuItem'),
    waqfMenuIcon: document.getElementById('waqfMenuIcon'),
    waqfMenuLabel: document.getElementById('waqfMenuLabel'),
    waqfColorMenu: document.getElementById('waqfColorMenu'),
    waqfDeleteMenu: document.getElementById('waqfDeleteMenu'),
    waqfDeleteMenuItem: document.getElementById('waqfDeleteMenuItem'),
    waqfToggle: document.getElementById('waqfToggle'),
    pinchZoomToggle: document.getElementById('pinchZoomToggle'),
    wakeLockToggle: document.getElementById('wakeLockToggle'),
    wakeLockRow: document.getElementById('wakeLockRow'),
    btnExportWaqf: document.getElementById('btnExportWaqf'),
    importWaqfInput: document.getElementById('importWaqfInput')
  };

  var ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function toArabicDigits(n){
    return String(n).split('').map(function(c){
      return /[0-9]/.test(c) ? ARABIC_DIGITS[+c] : c;
    }).join('');
  }

  function loadState(){
    var DEFAULTS = {page:0, fontSizeUthmani:28, fontSizeIndopak:28, night:false, furthestUthmani:0, furthestIndopak:0, lastPageUthmani:0, lastPageIndopak:0, fontStyle:'uthmani', showWaqfMarksUthmani:true, showWaqfMarksIndopak:true, pinchZoomEnabled:true, keepScreenAwake:false};
    var result = DEFAULTS;
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(raw) result = Object.assign({}, DEFAULTS, JSON.parse(raw));
    }catch(e){}
    // Migration: older saved states had a single shared `fontSize` field.
    // Carry that value over into the size for whichever script mode was
    // active, so upgrading doesn't silently reset the reader's chosen size.
    if(result.fontSize !== undefined){
      var migratedKey = result.fontStyle === 'uthmani' ? 'fontSizeUthmani' : 'fontSizeIndopak';
      result[migratedKey] = result.fontSize;
      delete result.fontSize;
    }
    // Migration: older saved states had a single shared `showWaqfMarks`
    // toggle. Carry that value over into both script modes so upgrading
    // doesn't silently reveal/hide marks the reader didn't ask to change.
    if(result.showWaqfMarks !== undefined){
      result.showWaqfMarksUthmani = result.showWaqfMarks;
      result.showWaqfMarksIndopak = result.showWaqfMarks;
      delete result.showWaqfMarks;
    }
    // Migration: older saved states had a single shared `furthest` (reading
    // progress) field, and "continue last reading" always resumed at the
    // single shared `page`. Seed both script modes' progress and last-read
    // page from those old shared values — otherwise reading progress and
    // the resume point would appear reset to zero after upgrading, even
    // though the reader has already read that far.
    if(result.furthest !== undefined){
      result.furthestUthmani = result.furthest;
      result.furthestIndopak = result.furthest;
      delete result.furthest;
    }
    if(result.page){
      result.lastPageUthmani = result.lastPageUthmani || result.page;
      result.lastPageIndopak = result.lastPageIndopak || result.page;
    }
    return result;
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  function loadFavorites(){
    try{
      var raw = localStorage.getItem(FAV_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return [];
  }
  function saveFavorites(){
    try{ localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }catch(e){}
  }

  // The saved reading bookmark (علامة القراءة) is kept independently per
  // script mode, same as reading progress — a bookmark placed while reading
  // Uthmani shouldn't jump you around when you're in Indopak, and vice versa.
  // The card stays hidden until the reader actually saves one; there is no
  // default position.
  function currentBookmarkKey(){
    return state.fontStyle === 'uthmani' ? 'uthmani' : 'amiri';
  }
  function loadBookmark(){
    try{
      var raw = localStorage.getItem(BOOKMARK_KEY);
      if(raw){
        var parsed = JSON.parse(raw);
        // Migration: older saved data was a single flat {page, ts} bookmark
        // shared across both scripts. Seed both script slots from it once,
        // so upgrading doesn't make an existing bookmark disappear.
        if(parsed && typeof parsed.page === 'number'){
          return {uthmani: parsed, amiri: parsed};
        }
        return {uthmani: parsed.uthmani || null, amiri: parsed.amiri || null};
      }
    }catch(e){}
    return {uthmani: null, amiri: null};
  }
  function saveBookmarkToStorage(){
    try{ localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmark)); }catch(e){}
  }

  // ---- علامات التذكير الشخصية (per-word colored reminder marks) ----
  // Stored as a flat map: { "surah:ayah:wordIndex": {c: 'red'|'green'|'blue', t: timestamp} }.
  // Purely a personal reading aid layered on top of the Qur'an text — it
  // never touches or alters a.text itself. The app assigns no meaning to
  // any color; each reader decides for themselves what red/green/blue
  // means to them.
  var REMINDER_COLORS = {red:1, green:1, blue:1};
  function loadWaqfMarks(){
    var marks = {};
    var key = waqfKeyForStyle(state.fontStyle);
    try{
      var raw = localStorage.getItem(key);
      if(raw){
        marks = JSON.parse(raw) || {};
      }else{
        // One-time migration, run independently the first time EACH script
        // mode is loaded after this update: earlier versions kept a single
        // shared list under WAQF_KEY_LEGACY. Seed this mode's new,
        // independent list from that shared snapshot so existing marks
        // don't silently disappear; from this point on the two modes
        // diverge as the reader edits each separately.
        var legacyRaw = localStorage.getItem(WAQF_KEY_LEGACY);
        if(legacyRaw){
          try{ marks = JSON.parse(legacyRaw) || {}; }catch(e){ marks = {}; }
        }
      }
    }catch(e){}
    // Migrate marks saved by the older single-color "waqf star" version
    // (a bare timestamp number) to the new {c, t} shape, defaulting to
    // red so nobody's existing marks silently disappear after the update.
    var changed = false;
    Object.keys(marks).forEach(function(k){
      if(typeof marks[k] === 'number'){
        marks[k] = {c: 'red', t: marks[k]};
        changed = true;
      }
    });
    try{ localStorage.setItem(key, JSON.stringify(marks)); }catch(e){}
    return marks;
  }
  function saveWaqfMarks(){
    try{ localStorage.setItem(waqfKeyForStyle(state.fontStyle), JSON.stringify(waqfMarks)); }catch(e){}
  }
  // Reads a given script mode's marks straight from storage, without
  // touching the in-memory waqfMarks (which only ever holds the active
  // mode's marks). Used by export/import so both mushafs' marks can be
  // handled together even though only one mode is loaded at a time.
  function readWaqfMarksFromStorage(style){
    try{
      var raw = localStorage.getItem(waqfKeyForStyle(style));
      return raw ? (JSON.parse(raw) || {}) : {};
    }catch(e){ return {}; }
  }
  function writeWaqfMarksToStorage(style, marks){
    try{ localStorage.setItem(waqfKeyForStyle(style), JSON.stringify(marks)); }catch(e){}
  }
  function updateWordMarkUI(key){
    var safeKey = key.replace(/"/g, '\\"');
    var wordEl = els.pageScroll.querySelector('.quran-word[data-key="' + safeKey + '"]');
    if(!wordEl) return;
    var mark = waqfMarks[key];
    wordEl.classList.toggle('has-waqf', !!mark);
    var markSpan = wordEl.querySelector('.waqf-mark');
    if(markSpan){
      markSpan.classList.remove('mark-red', 'mark-green', 'mark-blue');
      if(mark) markSpan.classList.add('mark-' + (REMINDER_COLORS[mark.c] ? mark.c : 'red'));
    }
  }
  function addWaqfMark(key, color){
    waqfMarks[key] = {c: REMINDER_COLORS[color] ? color : 'red', t: Date.now()};
    saveWaqfMarks();
    updateWordMarkUI(key);
    showToast('تمت إضافة علامة التذكير');
  }
  function removeWaqfMark(key){
    delete waqfMarks[key];
    saveWaqfMarks();
    updateWordMarkUI(key);
    showToast('تم حذف علامة التذكير');
  }
  // Whether reminder marks are shown is remembered independently per script
  // mode too, matching how the marks themselves are already stored per
  // mode (see waqfKeyForStyle) — hiding marks in one script shouldn't hide
  // them in the other.
  function currentWaqfVisibilityKey(){
    return state.fontStyle === 'uthmani' ? 'showWaqfMarksUthmani' : 'showWaqfMarksIndopak';
  }
  function applyWaqfVisibility(){
    document.body.classList.toggle('hide-waqf-marks', state[currentWaqfVisibilityKey()] === false);
    if(els.waqfToggle) els.waqfToggle.checked = state[currentWaqfVisibilityKey()] !== false;
  }

  var toastTimer = null;
  function showToast(msg){
    if(!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ els.toast.classList.remove('show'); }, 1800);
  }

  // ---- إبقاء الشاشة مضاءة (Screen Wake Lock) ----
  var WAKE_LOCK_SUPPORTED = 'wakeLock' in navigator;
  var wakeLockSentinel = null;
  function releaseWakeLock(){
    if(wakeLockSentinel){
      wakeLockSentinel.release().catch(function(){});
      wakeLockSentinel = null;
    }
  }
  function requestWakeLock(){
    if(!WAKE_LOCK_SUPPORTED || !state.keepScreenAwake) return;
    navigator.wakeLock.request('screen').then(function(sentinel){
      wakeLockSentinel = sentinel;
      // The OS/browser releases the lock on its own if the page is hidden
      // (e.g. switching apps); listen so it's re-acquired automatically
      // when the reader comes back, without needing to retoggle the setting.
      wakeLockSentinel.addEventListener('release', function(){ wakeLockSentinel = null; });
    }).catch(function(){
      // Can fail for reasons outside our control (low battery mode, some
      // in-app browsers, etc.) — fail silently rather than nag the reader.
    });
  }
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible') requestWakeLock();
  });
  if(els.wakeLockToggle && !WAKE_LOCK_SUPPORTED){
    // Feature isn't available in this browser/WebView — disable the
    // control instead of offering a setting that silently does nothing.
    els.wakeLockToggle.disabled = true;
    if(els.wakeLockRow) els.wakeLockRow.title = 'غير مدعوم في هذا المتصفح';
  }

  function ayahMarker(surah, ayah){
    var num = toArabicDigits(ayah);
    var digitClass = ayah >= 100 ? ' three-digit' : '';
    return '<span class="ayah-num' + digitClass + '" aria-hidden="false">' +
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
  // The waqf-lazim mark's own glyph (U+06D8) is drawn abnormally small in
  // this font — measured directly from the font's outline data, its ink
  // is roughly 2.5x smaller than the other five combining waqf marks in
  // the same font. Scaling the whole letter+mark span (like we do for the
  // others) can't fix that: it would need to blow the span up ~2.5x more
  // just to match, which would make the base letter comically oversized.
  // So — same fix as the iqlab meem above — draw our own small meem in
  // its place instead of relying on the font's undersized glyph.
  var WAQF_LAZIM_HTML = '<span class="waqf-lazim-glyph" aria-hidden="true">م</span>';

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
        var run = (cp === 0x06D8) ? WAQF_LAZIM_HTML : ch;
        while(i+1 < text.length && WAQF_COMBINING[text.codePointAt(i+1)]){
          i++;
          runCps.push(text.codePointAt(i));
          run += (text.codePointAt(i) === 0x06D8) ? WAQF_LAZIM_HTML : text[i];
        }
        // Jeem+sila collision fix (see comment above WAQF_SILA_LIFT_HTML):
        // only rewrite the raw sila character, only when jeem is also in
        // this exact run, so every other mark combination is untouched.
        if(runCps.indexOf(0x06DA) !== -1 && runCps.indexOf(0x06D6) !== -1){
          run = run.replace('\u06D6', WAQF_SILA_LIFT_HTML);
        }
        out += '<span class="waqf-sign">' + buffer + run + '</span>';
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
      out += buffer;
      buffer = ch;
    }
    out += buffer;
    return out;
  }

  function cleanAyahText(text){
    return wrapWaqfSigns(text).replace(IQLAB_MEEM_REGEX, IQLAB_MEEM_HTML);
  }

  // Wraps every word of an ayah in its own span so a personal reminder star
  // can be anchored above any single word. The dot itself is always in the
  // DOM (hidden by default via CSS) and only switched on per-word via the
  // "has-waqf" class plus a "mark-<color>" class, so toggling/updating
  // marks never requires re-building this HTML.
  function renderAyahWords(a){
    var src = (state.fontStyle !== 'uthmani' && a.textIndopak) ? a.textIndopak : a.text;
    var words = src.split(/\s+/).filter(Boolean);
    return words.map(function(w, idx){
      var key = a.surah + ':' + a.ayah + ':' + idx;
      return '<span class="quran-word" data-key="' + key + '">' +
        cleanAyahText(w) +
        '<span class="waqf-mark" aria-hidden="true">\u2605</span>' +
      '</span>';
    }).join(' ');
  }

  // "استكمال آخر قراءة" — both the visual bar/percentage and the resume
  // point — are tracked per script mode, and reflect the reader's current
  // (last-visited) position, moving up *and down* as they navigate, rather
  // than only ever climbing to the furthest point ever reached.
  function currentLastPageKey(){
    return state.fontStyle === 'uthmani' ? 'lastPageUthmani' : 'lastPageIndopak';
  }
  function progressRatio(){
    var reached = (state[currentLastPageKey()] || 0) + 1;
    return Math.min(1, reached / PAGES.length);
  }
  function updateProgressUI(){
    var ratio = progressRatio();
    var pct = Math.round(ratio * 100);
    var reachedCount = (state[currentLastPageKey()] || 0) + 1;
    if(els.homeProgressFill) els.homeProgressFill.style.width = pct + '%';
    if(els.homeProgressPercent) els.homeProgressPercent.textContent = toArabicDigits(pct) + '٪';
    if(els.homeProgressText) els.homeProgressText.textContent = 'قرأ ' + toArabicDigits(reachedCount) + ' من ' + toArabicDigits(PAGES.length) + ' ركوعًا';
    if(els.stripFill) els.stripFill.style.width = (((state.page||0)+1)/PAGES.length*100) + '%';
    if(els.settingsProgress) els.settingsProgress.textContent = toArabicDigits(pct) + '٪';
  }

  function isFavorited(pageIdx){
    return favorites.some(function(f){ return f.page === pageIdx; });
  }
  function updateFavButton(){
    if(!els.btnFavorite) return;
    els.btnFavorite.classList.toggle('active', isFavorited(state.page));
  }

  function updateBookmarkButton(){
    if(!els.btnBookmark) return;
    var b = bookmark[currentBookmarkKey()];
    els.btnBookmark.classList.toggle('active', !!b && b.page === state.page);
  }

  function updateBookmarkCard(){
    if(!els.bookmarkCard) return;
    var b = bookmark[currentBookmarkKey()];
    if(!b || !PAGES[b.page]){
      els.bookmarkCard.classList.add('hidden');
      return;
    }
    els.bookmarkCard.classList.remove('hidden');
    var p = PAGES[b.page];
    var surahName = p.ayahs[0].surahName;
    var rukuLabel = JUZ_INFO.fullMushaf ? p.ruku : p.rukuInJuz;
    if(els.bookmarkCardText){
      els.bookmarkCardText.textContent = surahName + ' \u2022 الركوع ' + toArabicDigits(rukuLabel);
    }
  }

  function render(){
    var idx = state.page;
    var p = PAGES[idx];
    if(!p) return;

    var names = p.surahNames.join(' \u2014 ');
    els.surahCartouche.innerHTML = '<span>سورة</span><b>' + names + '</b>';

    var html = '';
    var lastSurah = null;
    p.ayahs.forEach(function(a){
      if(lastSurah !== null && a.surah !== lastSurah){
        html += '<br><br>';
      }
      if(a.juzStart){
        html += '<span class="juz-marker">بداية الجزء ' + toArabicDigits(a.juzStart) + '</span>';
      }
      html += renderAyahWords(a) + ' ' + ayahMarker(a.surah, a.ayah) + ' ';
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

    var rukuMarkSpan = document.querySelector('#rukuEnd .ruku-mark span');
    if(JUZ_INFO.fullMushaf){
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.ruku) + ' من ' + toArabicDigits(PAGES.length) + ' \u2022 الجزء ' + toArabicDigits(p.juz);
      document.getElementById('rukuEnd').classList.remove('incomplete');
      if(rukuMarkSpan) rukuMarkSpan.textContent = 'ع';
    } else {
      els.rukuLabel.textContent = 'نهاية الركوع رقم ' + toArabicDigits(p.rukuInJuz) + ' من ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء');
      if(p.rukuComplete === false){
        document.getElementById('rukuEnd').classList.add('incomplete');
        if(rukuMarkSpan) rukuMarkSpan.textContent = '⋯';
        els.rukuLabel.textContent = 'ينتهي ' + (window.JUZ_INFO ? window.JUZ_INFO.name : 'الجزء') + ' هنا \u2014 وتكتمل بقية هذا الركوع في الجزء التالي';
      } else {
        document.getElementById('rukuEnd').classList.remove('incomplete');
        if(rukuMarkSpan) rukuMarkSpan.textContent = 'ع';
      }
    }
    els.pageIndicator.textContent = toArabicDigits(idx+1) + ' / ' + toArabicDigits(PAGES.length);
    els.pageSubtitle.textContent = names + ' \u2022 صفحة ' + toArabicDigits(idx+1);

    els.btnPrev.disabled = idx <= 0;
    els.btnNext.disabled = idx >= PAGES.length - 1;

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
    updateFavButton();
    updateBookmarkButton();
    updateProgressUI();
    saveState();
  }

  function goTo(i){
    if(i < 0 || i >= PAGES.length) return;
    state.page = i;
    // The per-script resume point/progress is only updated here, on real
    // navigation — not inside render(), which also runs when merely
    // switching الرسم on the same page and must not credit that page as
    // "read" in the newly-selected script.
    state[currentLastPageKey()] = i;
    render();
  }

  function showReader(){
    var wasHome = !els.homeScreen.classList.contains('hidden');
    els.homeScreen.classList.add('hidden');
    els.readerScreen.classList.remove('hidden');
    if(wasHome){
      history.pushState({tag:'reader'}, '');
    }
  }
  function showHome(){
    updateProgressUI();
    updateBookmarkCard();
    els.readerScreen.classList.add('hidden');
    els.homeScreen.classList.remove('hidden');
  }
  function openReaderAt(i){
    showReader();
    goTo(i);
  }

  els.btnPrev.addEventListener('click', function(){ goTo(state.page - 1); });
  els.btnNext.addEventListener('click', function(){ goTo(state.page + 1); });
  els.btnHome.addEventListener('click', function(){
    if(history.state && history.state.tag === 'reader'){
      history.back();
    } else {
      showHome();
    }
  });
  els.btnContinue.addEventListener('click', function(){ openReaderAt(state[currentLastPageKey()] || 0); });

  (function swipeAndPinch(){
    // RTL page-turn convention used throughout this app: dragging the finger
    // to the right (dx > 0) advances forward (like turning a page in an
    // Arabic book), dragging left goes back. This must stay in sync with the
    // ArrowLeft/ArrowRight handling below. If a deployed copy (e.g. on
    // GitHub Pages) ever behaves the other way round, it is running an
    // older/different app.js than this one — redeploy this exact file.
    var startX = null, startY = null;
    var frame = document.querySelector('.page-frame');

    // Two-finger pinch zoom: reuses the exact same per-script-mode font size
    // (via currentFontSizeKey) used by the "+"/"−" buttons in الإعدادات, so
    // pinching and those buttons always agree, each script mode keeps its
    // own remembered size, and switching mode never carries a pinched size
    // over to the other script. Can be turned off from الإعدادات
    // (state.pinchZoomEnabled) for readers who trigger it by accident while
    // turning pages with two fingers.
    var FONT_MIN = 18, FONT_MAX = 44;
    var pinching = false;
    var pinchStartDist = null;
    var pinchStartFontSize = null;

    function touchDistance(t1, t2){
      var dx = t1.clientX - t2.clientX;
      var dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onPinchMove(e){
      if(!pinching || e.touches.length !== 2) return;
      e.preventDefault(); // stop the browser from also trying its own zoom
      var dist = touchDistance(e.touches[0], e.touches[1]);
      var ratio = dist / pinchStartDist;
      var key = currentFontSizeKey();
      var newSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(pinchStartFontSize * ratio)));
      if(newSize !== state[key]){
        state[key] = newSize;
        applyFontSize();
      }
    }

    function endPinch(){
      pinching = false;
      pinchStartDist = null;
      frame.removeEventListener('touchmove', onPinchMove, {passive:false});
      saveState();
      showToast('حجم الخط: ' + toArabicDigits(state[currentFontSizeKey()]));
    }

    frame.addEventListener('touchstart', function(e){
      if(e.touches.length === 2 && state.pinchZoomEnabled !== false){
        pinching = true;
        startX = null; startY = null; // a pinch is never a one-finger swipe
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartFontSize = state[currentFontSizeKey()];
        // Only registered for the brief duration of an actual pinch, so
        // ordinary one-finger scrolling never has a non-passive touchmove
        // listener in its way (that alone is enough to make Chrome/Android
        // hand scrolling off to the main thread and feel noticeably heavier).
        frame.addEventListener('touchmove', onPinchMove, {passive:false});
      } else if(e.touches.length === 1 && !pinching){
        var t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
      }
    }, {passive:true});

    frame.addEventListener('touchend', function(e){
      if(pinching){
        if(e.touches.length < 2) endPinch();
        return; // releasing a pinch is never a page-turn swipe
      }
      if(startX === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5){
        if(dx > 0) goTo(state.page + 1);
        else goTo(state.page - 1);
      }
      startX = null; startY = null;
    }, {passive:true});
  })();

  document.addEventListener('keydown', function(e){
    if(els.readerScreen.classList.contains('hidden')) return;
    if(e.key === 'ArrowLeft') goTo(state.page + 1);
    if(e.key === 'ArrowRight') goTo(state.page - 1);
  });

  // ---- علامة التذكير: ضغط مطول على كلمة بلا علامة يضيف علامة ملوّنة،
  // وضغط مطول على كلمة عليها علامة بالفعل يعرض حذفها ----
  (function reminderMarkMenus(){
    var LONG_PRESS_MS = 550;
    var MOVE_TOLERANCE = 10; // px — small jitter shouldn't cancel the long-press
    var timer = null;
    var startPos = null;
    var cancelled = false;
    var root = els.ayahFlow;
    var pendingKey = null; // word targeted by whichever popup is open
    var lastPos = {x: 0, y: 0};

    function positionMenu(menuEl, x, y){
      // Position after it's visible, so we can measure its real size and
      // keep it fully on-screen near the finger.
      requestAnimationFrame(function(){
        var rect = menuEl.getBoundingClientRect();
        var left = Math.min(Math.max(8, x - rect.width / 2), window.innerWidth - rect.width - 8);
        var top = Math.max(8, y - rect.height - 18);
        menuEl.style.left = left + 'px';
        menuEl.style.top = top + 'px';
      });
    }
    function closeMenus(){
      els.waqfMenu.classList.add('hidden');
      els.waqfColorMenu.classList.add('hidden');
      els.waqfDeleteMenu.classList.add('hidden');
      pendingKey = null;
    }
    function openColorMenu(wordEl, x, y){
      pendingKey = wordEl.getAttribute('data-key');
      lastPos = {x: x, y: y};
      els.waqfMenu.classList.add('hidden');
      els.waqfColorMenu.classList.remove('hidden');
      positionMenu(els.waqfColorMenu, x, y);
    }
    function openDeleteMenu(wordEl, x, y){
      pendingKey = wordEl.getAttribute('data-key');
      els.waqfDeleteMenu.classList.remove('hidden');
      positionMenu(els.waqfDeleteMenu, x, y);
    }

    function onStart(x, y, target){
      if(state[currentWaqfVisibilityKey()] === false) return; // العلامات معطّلة من الإعدادات لهذا الرسم
      var wordEl = target.closest ? target.closest('.quran-word') : null;
      if(!wordEl) return;
      cancelled = false;
      startPos = {x: x, y: y};
      clearTimeout(timer);
      timer = setTimeout(function(){
        if(cancelled) return;
        // Decide add vs. delete at fire time (not at press-start), so it
        // always reflects this exact word's current state, no matter
        // whether the finger landed on the dot or elsewhere on the word.
        var key = wordEl.getAttribute('data-key');
        if(waqfMarks[key]) openDeleteMenu(wordEl, x, y);
        else openColorMenu(wordEl, x, y);
      }, LONG_PRESS_MS);
    }
    function onMove(x, y){
      if(!startPos) return;
      if(Math.abs(x - startPos.x) > MOVE_TOLERANCE || Math.abs(y - startPos.y) > MOVE_TOLERANCE){
        cancelled = true;
        clearTimeout(timer);
      }
    }
    function onEnd(){
      clearTimeout(timer);
      startPos = null;
    }

    root.addEventListener('touchstart', function(e){
      if(e.touches.length > 1){
        // A second finger just landed — this is the start of a pinch-zoom
        // gesture, not a long-press on a word. Cancel any pending
        // long-press right away; without this, a careful/slow pinch could
        // hold the first finger still long enough to fire the long-press
        // and pop the reminder-mark colour picker mid-pinch.
        cancelled = true;
        clearTimeout(timer);
        startPos = null;
        return;
      }
      var t = e.touches[0];
      onStart(t.clientX, t.clientY, e.target);
    }, {passive:true});
    root.addEventListener('touchmove', function(e){
      var t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, {passive:true});
    root.addEventListener('touchend', function(e){
      onEnd(e.target);
    }, {passive:true});
    // Some Android WebViews fall back to a native long-press context menu
    // even with user-select:none; make sure it never appears here. (This is
    // a 'contextmenu' listener, not 'touchmove', so it has no effect on
    // scroll performance.)
    root.addEventListener('contextmenu', function(e){ e.preventDefault(); });

    // Mouse equivalents, for testing on desktop browsers.
    root.addEventListener('mousedown', function(e){ onStart(e.clientX, e.clientY, e.target); });
    root.addEventListener('mousemove', function(e){ onMove(e.clientX, e.clientY); });
    root.addEventListener('mouseup', function(e){ onEnd(e.target); });

    els.waqfColorMenu.querySelectorAll('.waqf-color-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!pendingKey) return;
        addWaqfMark(pendingKey, btn.getAttribute('data-color'));
        closeMenus();
      });
    });

    els.waqfDeleteMenuItem.addEventListener('click', function(){
      if(!pendingKey) return;
      removeWaqfMark(pendingKey);
      closeMenus();
    });

    // Tapping anywhere outside an open popup closes it without acting.
    function outsideClose(e){
      var openMenu = ![els.waqfMenu, els.waqfColorMenu, els.waqfDeleteMenu].every(function(m){
        return m.classList.contains('hidden');
      });
      if(!openMenu) return;
      var insideAny = els.waqfMenu.contains(e.target) ||
        els.waqfColorMenu.contains(e.target) ||
        els.waqfDeleteMenu.contains(e.target);
      if(!insideAny) closeMenus();
    }
    document.addEventListener('touchstart', outsideClose, {passive:true});
    document.addEventListener('mousedown', outsideClose);
  })();

  // ---- تصدير/استيراد علامات التذكير (JSON) ----
  els.btnExportWaqf && els.btnExportWaqf.addEventListener('click', function(){
    // Export both script modes together, each under its own key, since a
    // reader may have separate marks on the Madinah and Naskh Ta'liq
    // mushaf. Only the active mode lives in memory (waqfMarks); the other
    // mode is read fresh from its own storage slot.
    var uthmaniMarks = (state.fontStyle === 'uthmani') ? waqfMarks : readWaqfMarksFromStorage('uthmani');
    var indopakMarks = (state.fontStyle !== 'uthmani') ? waqfMarks : readWaqfMarksFromStorage('indopak');
    var payload = JSON.stringify({
      app: 'مصحف الركوع',
      type: 'reminder-marks',
      marks: {uthmani: uthmaniMarks, indopak: indopakMarks}
    }, null, 2);
    var blob = new Blob([payload], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'علامات_التذكير.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    showToast('تم تصدير علامات التذكير');
  });
  // Merges an incoming mark set into one script mode's storage (not
  // necessarily the active one), converting legacy bare-timestamp marks
  // the same way loadWaqfMarks() does.
  function importMarksIntoStyle(style, incoming){
    var current = readWaqfMarksFromStorage(style);
    Object.keys(incoming).forEach(function(k){
      var v = incoming[k];
      current[k] = (typeof v === 'number') ? {c: 'red', t: v} : v;
    });
    writeWaqfMarksToStorage(style, current);
  }
  els.importWaqfInput && els.importWaqfInput.addEventListener('change', function(){
    var file = els.importWaqfInput.files && els.importWaqfInput.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var data = JSON.parse(reader.result);
        var incoming = (data && data.marks) ? data.marks : data;
        if(!incoming || typeof incoming !== 'object') throw new Error('bad format');
        // New exports nest marks under {uthmani, indopak}. Older exports
        // (from before marks were split per mode) are a flat map at the
        // top level — import those into the active mode only, matching
        // the old behavior exactly.
        var isPerMode = ('uthmani' in incoming) || ('indopak' in incoming);
        if(isPerMode){
          importMarksIntoStyle('uthmani', incoming.uthmani || {});
          importMarksIntoStyle('indopak', incoming.indopak || {});
          waqfMarks = loadWaqfMarks(); // refresh in-memory copy for the active mode
        }else{
          // Accept both the new {c, t} shape and legacy bare-timestamp marks.
          Object.keys(incoming).forEach(function(k){
            var v = incoming[k];
            waqfMarks[k] = (typeof v === 'number') ? {c: 'red', t: v} : v;
          });
          saveWaqfMarks();
        }
        render(); // refresh the currently open page so imported marks show immediately
        showToast('تم استيراد علامات التذكير');
      }catch(err){
        showToast('ملف غير صالح');
      }
      els.importWaqfInput.value = '';
    };
    reader.readAsText(file);
  });

  function buildIndex(){
    var html = '';
    var lastJuz = null;
    PAGES.forEach(function(p, i){
      var firstName = p.ayahs[0].surahName;
      var firstAyah = p.ayahs[0].ayah;
      if(JUZ_INFO.fullMushaf && p.juz !== lastJuz){
        html += '<div class="juz-header">الجزء ' + toArabicDigits(p.juz) + '</div>';
        lastJuz = p.juz;
      }
      var rukuLabelNum = JUZ_INFO.fullMushaf ? p.ruku : p.rukuInJuz;
      html += '<div class="index-item" data-idx="'+i+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + toArabicDigits(i+1) + '</span>' +
          '<div><div class="name">' + firstName + '</div>' +
          '<div class="meta">يبدأ من الآية ' + toArabicDigits(firstAyah) + ' \u2022 الركوع ' + toArabicDigits(rukuLabelNum) + '</div></div>' +
        '</div>' +
      '</div>';
    });
    els.indexList.innerHTML = html;
    els.indexList.querySelectorAll('.index-item').forEach(function(el){
      el.addEventListener('click', function(){
        goTo(parseInt(el.getAttribute('data-idx'), 10));
        closePanel(els.indexPanel);
      });
    });
  }

  // Highlights the ruku currently open and scrolls it into the middle of the
  // index list, so opening the index from deep inside the mushaf doesn't
  // dump the user back at الفاتحة every time.
  function highlightAndScrollIndexToCurrent(){
    var prev = els.indexList.querySelector('.index-item.current');
    if(prev) prev.classList.remove('current');
    var current = els.indexList.querySelector('.index-item[data-idx="' + state.page + '"]');
    if(current){
      current.classList.add('current');
      current.scrollIntoView({block: 'center'});
    }
  }

  function openPanel(p){
    p.classList.remove('hidden');
    history.pushState({tag:'panel'}, '');
  }
  function closePanel(p){
    if(p.classList.contains('hidden')) return; // already closed — nothing to pop
    p.classList.add('hidden');
    if(history.state && history.state.tag === 'panel'){
      history.back();
    }
  }

  // ---- Android/PWA hardware & gesture back button ----
  // By default a web page has no history entries of its own, so the very
  // first back-press exits the app entirely. We push one entry per "layer"
  // (an open panel/modal, or the reader screen) so each back-press peels
  // off exactly one layer: topmost open panel/modal first, then reader ->
  // home, then (nothing left to pop) the platform's normal back/exit
  // behaviour takes over on the next press.
  var OVERLAY_MODALS = [els.favModal, els.gotoModal];
  var OVERLAY_PANELS = [els.indexPanel, els.surahPanel, els.juzPanel, els.searchPanel, els.favoritesPanel, els.settingsPanel];
  function isOverlayOpen(el){ return el && !el.classList.contains('hidden'); }
  function closeTopmostOverlay(){
    for(var i=0;i<OVERLAY_MODALS.length;i++){
      if(isOverlayOpen(OVERLAY_MODALS[i])){
        OVERLAY_MODALS[i].classList.add('hidden');
        pendingFavPage = null;
        return true;
      }
    }
    for(var j=0;j<OVERLAY_PANELS.length;j++){
      if(isOverlayOpen(OVERLAY_PANELS[j])){
        OVERLAY_PANELS[j].classList.add('hidden');
        return true;
      }
    }
    return false;
  }
  history.replaceState({tag:'home'}, '');
  window.addEventListener('popstate', function(e){
    if(closeTopmostOverlay()) return;
    var tag = e.state && e.state.tag;
    if(tag !== 'reader' && !els.readerScreen.classList.contains('hidden')){
      showHome();
    }
  });

  els.btnIndex.addEventListener('click', function(){
    openPanel(els.indexPanel);
    // Wait a frame so the panel is laid out/visible before scrolling.
    requestAnimationFrame(function(){ highlightAndScrollIndexToCurrent(); });
  });
  els.btnCloseIndex.addEventListener('click', function(){ closePanel(els.indexPanel); });
  els.btnSettings.addEventListener('click', function(){ openPanel(els.settingsPanel); });
  els.btnCloseSettings.addEventListener('click', function(){ closePanel(els.settingsPanel); });
  els.tileSettings.addEventListener('click', function(){ openPanel(els.settingsPanel); });

  // Font size is stored independently per script mode (Uthmani vs Indopak),
  // since the two scripts read comfortably at different sizes. This key
  // picks which stored size applies to whatever script is on screen right
  // now, so the +/-، pinch-zoom، and settings label all always agree.
  function currentFontSizeKey(){
    return state.fontStyle === 'uthmani' ? 'fontSizeUthmani' : 'fontSizeIndopak';
  }
  function applyFontSize(){
    var size = state[currentFontSizeKey()];
    document.documentElement.style.setProperty('--ayah-size', size + 'px');
    els.fontSizeLabel.textContent = size;
  }
  els.fontMinus.addEventListener('click', function(){
    var key = currentFontSizeKey();
    state[key] = Math.max(18, state[key] - 2);
    applyFontSize(); saveState();
  });
  els.fontPlus.addEventListener('click', function(){
    var key = currentFontSizeKey();
    state[key] = Math.min(44, state[key] + 2);
    applyFontSize(); saveState();
  });

  function applyFontStyle(){
    var family = state.fontStyle === 'uthmani'
      ? "'Uthmanic Hafs', 'Amiri Quran', 'Noto Naskh Arabic', serif"
      : "'PDMS Saleem QuranFont', 'Amiri Quran', 'Noto Naskh Arabic', serif";
    document.documentElement.style.setProperty('--font-quran', family);
    document.body.classList.toggle('uthmani-font', state.fontStyle === 'uthmani');
    document.body.classList.toggle('indopak-font', state.fontStyle !== 'uthmani');
    var btnAmiri = document.getElementById('btnFontAmiri');
    var btnUthmani = document.getElementById('btnFontUthmani');
    if(btnAmiri) btnAmiri.classList.toggle('active', state.fontStyle !== 'uthmani');
    if(btnUthmani) btnUthmani.classList.toggle('active', state.fontStyle === 'uthmani');
    // Reminder marks are stored per script mode (see waqfKeyForStyle), so
    // switching mode must reload the in-memory map before re-rendering —
    // otherwise the previous mode's marks would keep showing on the new one.
    waqfMarks = loadWaqfMarks();
    // Each script mode has its own independent font size — re-apply it now
    // so the page and the settings-panel label switch over to whichever
    // size was last set for this mode, instead of keeping the other mode's.
    applyFontSize();
    // Whether marks are shown is also independent per script mode — refresh
    // the toggle switch and the hide/show class to match this mode's value.
    applyWaqfVisibility();
    // Reading progress (percentage / reached count) is tracked per script
    // mode too, so refresh it now to show this mode's own numbers.
    updateProgressUI();
    // The saved reading bookmark is per script mode too — refresh the
    // bookmark button state and the home-screen bookmark card now.
    updateBookmarkButton();
    updateBookmarkCard();
    if(typeof render === 'function' && PAGES[state.page]) render();
  }
  var btnFontAmiri = document.getElementById('btnFontAmiri');
  var btnFontUthmani = document.getElementById('btnFontUthmani');
  if(btnFontAmiri) btnFontAmiri.addEventListener('click', function(){
    state.fontStyle = 'amiri'; applyFontStyle(); saveState();
  });
  if(btnFontUthmani) btnFontUthmani.addEventListener('click', function(){
    state.fontStyle = 'uthmani'; applyFontStyle(); saveState();
  });

  function applyNight(){
    document.body.classList.toggle('night', !!state.night);
    els.nightToggle.checked = !!state.night;
  }
  els.nightToggle.addEventListener('change', function(){
    state.night = els.nightToggle.checked;
    applyNight(); saveState();
  });

  els.waqfToggle && els.waqfToggle.addEventListener('change', function(){
    state[currentWaqfVisibilityKey()] = els.waqfToggle.checked;
    applyWaqfVisibility(); saveState();
  });

  els.pinchZoomToggle && els.pinchZoomToggle.addEventListener('change', function(){
    state.pinchZoomEnabled = els.pinchZoomToggle.checked;
    saveState();
  });

  els.wakeLockToggle && els.wakeLockToggle.addEventListener('change', function(){
    state.keepScreenAwake = els.wakeLockToggle.checked;
    saveState();
    if(state.keepScreenAwake) requestWakeLock();
    else releaseWakeLock();
  });

  els.btnResetProgress.addEventListener('click', function(){
    // Progress now mirrors the last-visited position directly, so "reset"
    // means starting over from the beginning for this script mode —
    // not re-baselining to wherever the reader currently is.
    state[currentLastPageKey()] = 0;
    updateProgressUI();
    saveState();
  });

  var surahJumpMap = {};
  var surahOrder = [];
  (function buildSurahMap(){
    PAGES.forEach(function(p, i){
      p.ayahs.forEach(function(a){
        if(a.ayah === 1 && !(a.surah in surahJumpMap)){
          surahJumpMap[a.surah] = i;
          surahOrder.push({surah: a.surah, name: a.surahName, page: i});
        }
      });
    });
    surahOrder.sort(function(a,b){ return a.surah - b.surah; });
  })();

  // Strips diacritics (harakat, tanween, sukun, shadda, Quranic annotation
  // and small waqf marks) and folds letter variants (alef forms, ta
  // marbuta, alef maksura) so a search for a plain-typed word like "الرحمن"
  // matches the fully-vocalized Mushaf text "ٱلرَّحۡمَٰنِ" regardless of
  // which diacritics/marks sit on top of the letters.
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

  // Flat, search-friendly index of every ayah in the mushaf, built once at
  // startup. Each entry keeps the ruku page index so a match can jump the
  // reader straight to it, the same way surah results already do.
  var ayahIndex = [];
  (function buildAyahIndex(){
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
  })();

  var AYAH_SEARCH_LIMIT = 80; // keep the result list scrollable, not a full concordance
  function searchAyahs(query){
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
  // whitespace-splitting renderAyahWords uses, so the returned indices
  // line up with the real data-key word spans in the DOM. Returns
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

  function renderAyahResults(list, container, query){
    if(!list.length) return;
    var heading = '<div class="setting-row static" style="margin-top:8px;"><span>آيات مطابقة</span></div>';
    var html = list.map(function(e){
      var src = state.fontStyle !== 'uthmani' ? e.textIndopak : e.text;
      var range = findMatchWordRange(src, query) || {start: 0, end: 0};
      return '<div class="index-item ayah-result-item" data-page="' + e.page + '" data-surah="' + e.surah + '" data-ayah="' + e.ayah + '" data-w-start="' + range.start + '" data-w-end="' + range.end + '">' +
        '<div class="index-item-inner">' +
          '<div style="flex:1;">' +
            '<div class="name">' + e.surahName + ' \u2022 آية ' + toArabicDigits(e.ayah) + '</div>' +
            '<div class="surah-info" style="direction:rtl; white-space:normal; line-height:1.6;">' + ayahSnippet(src, query) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    container.insertAdjacentHTML('beforeend', heading + html);
    container.querySelectorAll('.ayah-result-item').forEach(function(el){
      el.addEventListener('click', function(){
        openReaderAtAyah(
          parseInt(el.getAttribute('data-page'), 10),
          parseInt(el.getAttribute('data-surah'), 10),
          parseInt(el.getAttribute('data-ayah'), 10),
          parseInt(el.getAttribute('data-w-start'), 10),
          parseInt(el.getAttribute('data-w-end'), 10)
        );
        closePanel(els.searchPanel);
      });
    });
  }

  // Opens the reader at a given ruku and scrolls straight to the word(s)
  // that actually matched the search term (not just the ayah's first
  // word), with a brief highlight flash so the hit is easy to spot on a
  // page that may hold several ayaat. wStart/wEnd default to the first
  // word if not given.
  function openReaderAtAyah(pageIdx, surah, ayah, wStart, wEnd){
    if(typeof wStart !== 'number' || isNaN(wStart)) wStart = 0;
    if(typeof wEnd !== 'number' || isNaN(wEnd)) wEnd = wStart;
    openReaderAt(pageIdx);
    // The reader screen has only just been unhidden/re-rendered, so its
    // layout isn't settled yet on this same tick — scrollIntoView called
    // right now would measure a container that still thinks it's empty
    // and silently do nothing. Wait two frames (one for layout, one for
    // paint) before measuring, same pattern used for the ruku index list.
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

  function renderSurahList(list, container){
    if(!list.length){
      container.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
      return;
    }
    var html = list.map(function(s){
      var meta = window.SURAH_META && window.SURAH_META[s.surah] ? window.SURAH_META[s.surah] : {};
      var surahInfo = '';
      if(meta.type && meta.ayahs){
        surahInfo = meta.type + ' \u2022 ' + toArabicDigits(meta.ayahs) + ' آية';
      }
      return '<div class="index-item" data-page="'+s.page+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + toArabicDigits(s.surah) + '</span>' +
          '<div>' +
            '<div class="name">' + s.name + '</div>' +
            (surahInfo ? '<div class="surah-info">' + surahInfo + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    container.innerHTML = html;
    container.querySelectorAll('.index-item').forEach(function(el){
      el.addEventListener('click', function(){
        openReaderAt(parseInt(el.getAttribute('data-page'), 10));
        closePanel(els.surahPanel);
        closePanel(els.searchPanel);
      });
    });
  }

  els.tileSurah.addEventListener('click', function(){
    renderSurahList(surahOrder, els.surahList);
    openPanel(els.surahPanel);
  });
  els.btnCloseSurah.addEventListener('click', function(){ closePanel(els.surahPanel); });

  els.tileJuz && els.tileJuz.addEventListener('click', function(){
    var juzJumpMap = {};
    var order = [];
    PAGES.forEach(function(p, i){
      if(JUZ_INFO.fullMushaf && !(p.juz in juzJumpMap)){
        juzJumpMap[p.juz] = i;
        order.push({juz: p.juz, page: i, name: p.ayahs[0].surahName});
      }
    });
    var html = order.map(function(j){
      return '<div class="index-item" data-page="'+j.page+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + toArabicDigits(j.juz) + '</span>' +
          '<div><div class="name">الجزء ' + toArabicDigits(j.juz) + '</div>' +
          '<div class="meta">يبدأ من سورة ' + j.name + '</div></div>' +
        '</div>' +
      '</div>';
    }).join('');
    els.juzList.innerHTML = html || '<div class="empty-state">غير متاح</div>';
    els.juzList.querySelectorAll('.index-item').forEach(function(el){
      el.addEventListener('click', function(){
        openReaderAt(parseInt(el.getAttribute('data-page'), 10));
        closePanel(els.juzPanel);
      });
    });
    openPanel(els.juzPanel);
  });
  els.btnCloseJuz.addEventListener('click', function(){ closePanel(els.juzPanel); });

  els.tileSearch.addEventListener('click', function(){
    els.searchInput.value = '';
    renderSurahList(surahOrder, els.searchResults);
    openPanel(els.searchPanel);
    setTimeout(function(){ els.searchInput.focus(); }, 200);
  });
  els.btnCloseSearch.addEventListener('click', function(){ closePanel(els.searchPanel); });
  els.searchInput.addEventListener('input', function(){
    var q = els.searchInput.value.trim();
    if(!q){ renderSurahList(surahOrder, els.searchResults); return; }
    var filtered = surahOrder.filter(function(s){ return s.name.indexOf(q) !== -1; });
    // Ayah text search only kicks in from 2 characters so a single letter
    // doesn't return a huge, meaningless result set.
    var ayahMatches = q.length >= 2 ? searchAyahs(q) : [];
    if(!filtered.length && !ayahMatches.length){
      els.searchResults.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
      return;
    }
    if(filtered.length) renderSurahList(filtered, els.searchResults);
    else els.searchResults.innerHTML = '';
    if(ayahMatches.length) renderAyahResults(ayahMatches, els.searchResults, q);
  });

  function renderFavorites(){
    if(!favorites.length){
      els.favoritesList.innerHTML = '<div class="empty-state">لا توجد عناصر في المفضلة بعد.<br>اضغط على النجمة أثناء القراءة لإضافة ركوع.</div>';
      return;
    }
    var sorted = favorites.slice().sort(function(a,b){ return b.ts - a.ts; });
    els.favoritesList.innerHTML = sorted.map(function(f){
      var p = PAGES[f.page];
      var surahName = p ? p.ayahs[0].surahName : '';
      var ayahNum = p ? p.ayahs[0].ayah : '';
      return '<div class="fav-item" data-page="'+f.page+'">' +
        '<div class="fav-info">' +
          '<div class="fav-title">' + (f.label || surahName) + '</div>' +
          '<div class="fav-sub">' + surahName + ' \u2022 آية ' + toArabicDigits(ayahNum) + '</div>' +
        '</div>' +
        '<button class="fav-remove" data-remove="'+f.page+'">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6l-12 12"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');
    els.favoritesList.querySelectorAll('.fav-info').forEach(function(el){
      el.addEventListener('click', function(){
        var page = parseInt(el.parentElement.getAttribute('data-page'), 10);
        openReaderAt(page);
        closePanel(els.favoritesPanel);
      });
    });
    els.favoritesList.querySelectorAll('.fav-remove').forEach(function(el){
      el.addEventListener('click', function(e){
        e.stopPropagation();
        var page = parseInt(el.getAttribute('data-remove'), 10);
        favorites = favorites.filter(function(f){ return f.page !== page; });
        saveFavorites();
        renderFavorites();
        updateFavButton();
      });
    });
  }

  els.tileFavorites.addEventListener('click', function(){
    renderFavorites();
    openPanel(els.favoritesPanel);
  });
  els.btnCloseFavorites.addEventListener('click', function(){ closePanel(els.favoritesPanel); });

  els.btnFavorite.addEventListener('click', function(){
    if(isFavorited(state.page)){
      favorites = favorites.filter(function(f){ return f.page !== state.page; });
      saveFavorites();
      updateFavButton();
      return;
    }
    pendingFavPage = state.page;
    els.favNameInput.value = '';
    openPanel(els.favModal);
    setTimeout(function(){ els.favNameInput.focus(); }, 150);
  });

  function saveFavoriteFromModal(){
    if(pendingFavPage === null) return;
    var label = els.favNameInput.value.trim();
    favorites.push({page: pendingFavPage, label: label, ts: Date.now()});
    saveFavorites();
    updateFavButton();
    closePanel(els.favModal);
    pendingFavPage = null;
  }
  els.favModalSave.addEventListener('click', saveFavoriteFromModal);
  els.favNameInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter') saveFavoriteFromModal();
  });
  els.favModalCancel.addEventListener('click', function(){
    closePanel(els.favModal);
    pendingFavPage = null;
  });

  // ---- Bookmark (علامة القراءة): a single saved spot per script mode,
  // separate from favorites. Tapping the bookmark button always saves/moves
  // it to the ruku currently open, in whichever script is active right now.
  // Tapping the home-screen bookmark card jumps back to that script's own
  // saved spot.
  els.btnBookmark && els.btnBookmark.addEventListener('click', function(){
    bookmark[currentBookmarkKey()] = {page: state.page, ts: Date.now()};
    saveBookmarkToStorage();
    updateBookmarkButton();
    showToast('تم حفظ علامة القراءة هنا');
  });

  els.bookmarkCard && els.bookmarkCard.addEventListener('click', function(){
    var b = bookmark[currentBookmarkKey()];
    if(!b) return;
    openReaderAt(b.page);
  });

  // ---- الذهاب إلى ركوع/صفحة رقم ----
  function openGotoModal(){
    if(!els.gotoModal) return;
    els.gotoError.textContent = '';
    els.gotoInput.value = toArabicDigits(state.page + 1);
    openPanel(els.gotoModal);
    setTimeout(function(){ els.gotoInput.focus(); els.gotoInput.select(); }, 150);
  }
  function closeGotoModal(){
    closePanel(els.gotoModal);
  }
  function submitGoto(){
    var raw = els.gotoInput.value.trim();
    // accept Arabic-Indic digits too
    raw = raw.replace(/[٠-٩]/g, function(d){ return ARABIC_DIGITS.indexOf(d); });
    var n = parseInt(raw, 10);
    if(!raw || isNaN(n) || n < 1 || n > PAGES.length){
      els.gotoError.textContent = 'رقم غير صحيح، اكتب رقمًا من ١ إلى ' + toArabicDigits(PAGES.length);
      return;
    }
    closeGotoModal();
    openReaderAt(n - 1);
  }
  els.btnGoto && els.btnGoto.addEventListener('click', openGotoModal);
  els.pageIndicator && els.pageIndicator.addEventListener('click', openGotoModal);
  els.gotoModalCancel && els.gotoModalCancel.addEventListener('click', closeGotoModal);
  els.gotoModalGo && els.gotoModalGo.addEventListener('click', submitGoto);
  els.gotoInput && els.gotoInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter') submitGoto();
  });

  document.getElementById('eyebrowText') && (document.getElementById('eyebrowText').textContent = JUZ_INFO.shortName);
  document.title = JUZ_INFO.fullMushaf ? JUZ_INFO.name : (JUZ_INFO.name + ' — بالركوعات');
  var rukuCountEl = document.getElementById('rukuCount');
  var ayahCountEl = document.getElementById('ayahCount');
  var aboutTextEl = document.getElementById('aboutText');
  if (rukuCountEl) rukuCountEl.textContent = toArabicDigits(PAGES.length) + ' ركوعًا';
  if (ayahCountEl) ayahCountEl.textContent = toArabicDigits(JUZ_INFO.ayahCount) + ' آية';
  if (aboutTextEl) aboutTextEl.textContent = JUZ_INFO.fullMushaf
    ? 'كل صفحة في هذا التطبيق تمثّل ركوعًا واحدًا كاملًا كما تحدّده علامات الركوع (ع) في المصحف الشريف، من الفاتحة إلى الناس (٥٥٦ ركوعًا). بداية كل جزء من الأجزاء الثلاثين مُشار إليها داخل النص. النص من مصحف حفص عن عاصم برواية Tanzil / QPC.'
    : 'كل صفحة في هذا التطبيق تمثّل ركوعًا واحدًا كاملًا كما تحدّده علامات الركوع (ع) في المصحف الشريف، ضمن ' + JUZ_INFO.name + '. النص من مصحف حفص عن عاصم برواية Tanzil / QPC.';

  if(!JUZ_INFO.fullMushaf && els.tileJuz){
    els.tileJuz.classList.add('hidden');
  }

  applyFontSize();
  applyFontStyle();
  applyNight();
  applyWaqfVisibility();
  if(els.pinchZoomToggle) els.pinchZoomToggle.checked = state.pinchZoomEnabled !== false;
  if(els.wakeLockToggle){
    els.wakeLockToggle.checked = !!state.keepScreenAwake && WAKE_LOCK_SUPPORTED;
    requestWakeLock();
  }
  buildIndex();
  updateProgressUI();
  updateBookmarkCard();

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
})();
