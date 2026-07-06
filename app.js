(function(){
  'use strict';

  var PAGES = window.JUZ_PAGES || window.JUZ_AMMA_PAGES || [];
  var JUZ_INFO = window.JUZ_INFO || {name: 'جزء عمّ', shortName: 'جزء عمّ', rukuCount: PAGES.length, ayahCount: 0};
  var STORAGE_KEY = 'juzamma_v1';
  var FAV_KEY = 'quranRuku_favorites_v1';
  var BOOKMARK_KEY = 'quranRuku_bookmark_v1';
  var WAQF_KEY = 'quranRuku_waqfMarks_v1';

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
    waqfToggle: document.getElementById('waqfToggle'),
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
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(raw) return Object.assign({page:0, fontSize:28, night:false, furthest:0, fontStyle:'uthmani', showWaqfMarks:true}, JSON.parse(raw));
    }catch(e){}
    return {page:0, fontSize:28, night:false, furthest:0, fontStyle:'uthmani', showWaqfMarks:true};
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

  function loadBookmark(){
    try{
      var raw = localStorage.getItem(BOOKMARK_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return null;
  }
  function saveBookmarkToStorage(){
    try{
      if(bookmark) localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmark));
      else localStorage.removeItem(BOOKMARK_KEY);
    }catch(e){}
  }

  // ---- علامات الوقف الشخصية (per-word personal stop marks) ----
  // Stored as a flat map: { "surah:ayah:wordIndex": timestamp }. Purely a
  // personal reading aid layered on top of the Qur'an text — it never
  // touches or alters a.text itself.
  function loadWaqfMarks(){
    try{
      var raw = localStorage.getItem(WAQF_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return {};
  }
  function saveWaqfMarks(){
    try{ localStorage.setItem(WAQF_KEY, JSON.stringify(waqfMarks)); }catch(e){}
  }
  function updateWordMarkUI(key){
    var safeKey = key.replace(/"/g, '\\"');
    var wordEl = els.pageScroll.querySelector('.quran-word[data-key="' + safeKey + '"]');
    if(wordEl) wordEl.classList.toggle('has-waqf', !!waqfMarks[key]);
  }
  function addWaqfMark(key){
    waqfMarks[key] = Date.now();
    saveWaqfMarks();
    updateWordMarkUI(key);
    showToast('تمت إضافة علامة الوقف');
  }
  function removeWaqfMark(key){
    delete waqfMarks[key];
    saveWaqfMarks();
    updateWordMarkUI(key);
    showToast('تم حذف علامة الوقف');
  }
  function applyWaqfVisibility(){
    document.body.classList.toggle('hide-waqf-marks', !state.showWaqfMarks);
  }

  var toastTimer = null;
  function showToast(msg){
    if(!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ els.toast.classList.remove('show'); }, 1800);
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
  function cleanAyahText(text){
    return text.replace(IQLAB_MEEM_REGEX, IQLAB_MEEM_HTML);
  }

  // Wraps every word of an ayah in its own span so a personal waqf star can
  // be anchored above any single word. The star itself is always in the
  // DOM (hidden by default via CSS) and only switched on per-word via the
  // "has-waqf" class, so toggling/updating marks never requires re-building
  // this HTML.
  function renderAyahWords(a){
    var words = a.text.split(/\s+/).filter(Boolean);
    return words.map(function(w, idx){
      var key = a.surah + ':' + a.ayah + ':' + idx;
      return '<span class="quran-word" data-key="' + key + '">' +
        cleanAyahText(w) +
        '<span class="waqf-mark" aria-hidden="true">\u2605</span>' +
      '</span>';
    }).join(' ');
  }

  function progressRatio(){
    var reached = Math.max(state.furthest || 0, state.page || 0) + 1;
    return Math.min(1, reached / PAGES.length);
  }
  function updateProgressUI(){
    var ratio = progressRatio();
    var pct = Math.round(ratio * 100);
    var reachedCount = Math.max(state.furthest || 0, state.page || 0) + 1;
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
    els.btnBookmark.classList.toggle('active', !!bookmark && bookmark.page === state.page);
  }

  function updateBookmarkCard(){
    if(!els.bookmarkCard) return;
    if(!bookmark || !PAGES[bookmark.page]){
      els.bookmarkCard.classList.add('hidden');
      return;
    }
    els.bookmarkCard.classList.remove('hidden');
    var p = PAGES[bookmark.page];
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

    if(idx > (state.furthest || 0)) state.furthest = idx;

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
      if(waqfMarks[key]) el.classList.add('has-waqf');
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
    updateFavButton();
    updateBookmarkButton();
    updateProgressUI();
    saveState();
  }

  function goTo(i){
    if(i < 0 || i >= PAGES.length) return;
    state.page = i;
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
  els.btnContinue.addEventListener('click', function(){ openReaderAt(state.page || 0); });

  (function swipeAndPinch(){
    // RTL page-turn convention used throughout this app: dragging the finger
    // to the right (dx > 0) advances forward (like turning a page in an
    // Arabic book), dragging left goes back. This must stay in sync with the
    // ArrowLeft/ArrowRight handling below. If a deployed copy (e.g. on
    // GitHub Pages) ever behaves the other way round, it is running an
    // older/different app.js than this one — redeploy this exact file.
    var startX = null, startY = null;
    var frame = document.querySelector('.page-frame');

    // Two-finger pinch zoom: reuses the exact same state.fontSize used by
    // the "+"/"−" buttons in الإعدادات, so pinching and those buttons always
    // agree and the result is remembered the same way.
    var FONT_MIN = 18, FONT_MAX = 44;
    var pinching = false;
    var pinchStartDist = null;
    var pinchStartFontSize = null;

    function touchDistance(t1, t2){
      var dx = t1.clientX - t2.clientX;
      var dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    frame.addEventListener('touchstart', function(e){
      if(e.touches.length === 2){
        pinching = true;
        startX = null; startY = null; // a pinch is never a one-finger swipe
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartFontSize = state.fontSize;
      } else if(e.touches.length === 1 && !pinching){
        var t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
      }
    }, {passive:true});

    function onPinchMove(e){
      if(!pinching || e.touches.length !== 2) return;
      e.preventDefault(); // stop the browser from also trying its own zoom
      var dist = touchDistance(e.touches[0], e.touches[1]);
      var ratio = dist / pinchStartDist;
      var newSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(pinchStartFontSize * ratio)));
      if(newSize !== state.fontSize){
        state.fontSize = newSize;
        applyFontSize();
      }
    }

    function endPinch(){
      pinching = false;
      pinchStartDist = null;
      frame.removeEventListener('touchmove', onPinchMove, {passive:false});
      saveState();
      showToast('حجم الخط: ' + toArabicDigits(state.fontSize));
    }

    frame.addEventListener('touchstart', function(e){
      if(e.touches.length === 2){
        pinching = true;
        startX = null; startY = null; // a pinch is never a one-finger swipe
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartFontSize = state.fontSize;
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

  // ---- علامة الوقف الشخصية: ضغط مطول على أي كلمة ----
  (function waqfLongPress(){
    var LONG_PRESS_MS = 550;
    var MOVE_TOLERANCE = 10; // px — small jitter shouldn't cancel the long-press
    var timer = null;
    var startPos = null;
    var cancelled = false;
    var root = els.ayahFlow;

    function openMenuFor(wordEl, x, y){
      var key = wordEl.getAttribute('data-key');
      var exists = !!waqfMarks[key];
      els.waqfMenu.dataset.key = key;
      els.waqfMenuIcon.textContent = exists ? '❌' : '⭐';
      els.waqfMenuLabel.textContent = exists ? 'حذف علامة الوقف الشخصية' : 'إضافة علامة وقف شخصية';
      els.waqfMenu.classList.remove('hidden');
      // Position after it's visible, so we can measure its real size and
      // keep it fully on-screen near the finger.
      requestAnimationFrame(function(){
        var rect = els.waqfMenu.getBoundingClientRect();
        var left = Math.min(Math.max(8, x - rect.width / 2), window.innerWidth - rect.width - 8);
        var top = Math.max(8, y - rect.height - 18);
        els.waqfMenu.style.left = left + 'px';
        els.waqfMenu.style.top = top + 'px';
      });
    }
    function closeMenu(){
      els.waqfMenu.classList.add('hidden');
      delete els.waqfMenu.dataset.key;
    }

    function onStart(x, y, target){
      var wordEl = target.closest ? target.closest('.quran-word') : null;
      if(!wordEl) return;
      cancelled = false;
      startPos = {x: x, y: y};
      clearTimeout(timer);
      timer = setTimeout(function(){
        if(!cancelled) openMenuFor(wordEl, x, y);
      }, LONG_PRESS_MS);
    }
    function onMove(x, y){
      if(!startPos) return;
      if(Math.abs(x - startPos.x) > MOVE_TOLERANCE || Math.abs(y - startPos.y) > MOVE_TOLERANCE){
        cancelled = true;
        clearTimeout(timer);
      }
    }
    function onEnd(target){
      clearTimeout(timer);
      // Tapping the red star itself is a direct shortcut to the same popup
      // (pre-filled with "حذف علامة الوقف"), rather than deleting instantly —
      // one accidental tap should never silently remove a saved mark.
      var markEl = target && target.closest ? target.closest('.waqf-mark') : null;
      if(markEl && !cancelled){
        var wordEl = markEl.closest('.quran-word');
        if(wordEl){
          var pos = startPos || {x: 0, y: 0};
          openMenuFor(wordEl, pos.x, pos.y);
        }
      }
      startPos = null;
    }

    root.addEventListener('touchstart', function(e){
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

    els.waqfMenuItem.addEventListener('click', function(){
      var key = els.waqfMenu.dataset.key;
      if(!key) return;
      if(waqfMarks[key]) removeWaqfMark(key);
      else addWaqfMark(key);
      closeMenu();
    });

    // Tapping anywhere outside the menu closes it without acting.
    document.addEventListener('touchstart', function(e){
      if(els.waqfMenu.classList.contains('hidden')) return;
      if(!els.waqfMenu.contains(e.target)) closeMenu();
    }, {passive:true});
    document.addEventListener('mousedown', function(e){
      if(els.waqfMenu.classList.contains('hidden')) return;
      if(!els.waqfMenu.contains(e.target)) closeMenu();
    });
  })();

  // ---- تصدير/استيراد علامات الوقف الشخصية (JSON) ----
  els.btnExportWaqf && els.btnExportWaqf.addEventListener('click', function(){
    var payload = JSON.stringify({app: 'مصحف الركوع', type: 'waqf-marks', marks: waqfMarks}, null, 2);
    var blob = new Blob([payload], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'علامات_الوقف.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    showToast('تم تصدير علامات الوقف');
  });
  els.importWaqfInput && els.importWaqfInput.addEventListener('change', function(){
    var file = els.importWaqfInput.files && els.importWaqfInput.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var data = JSON.parse(reader.result);
        var incoming = (data && data.marks) ? data.marks : data;
        if(!incoming || typeof incoming !== 'object') throw new Error('bad format');
        Object.keys(incoming).forEach(function(k){ waqfMarks[k] = incoming[k]; });
        saveWaqfMarks();
        render(); // refresh the currently open page so imported marks show immediately
        showToast('تم استيراد علامات الوقف');
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

  function applyFontSize(){
    document.documentElement.style.setProperty('--ayah-size', state.fontSize + 'px');
    els.fontSizeLabel.textContent = state.fontSize;
  }
  els.fontMinus.addEventListener('click', function(){
    state.fontSize = Math.max(18, state.fontSize - 2);
    applyFontSize(); saveState();
  });
  els.fontPlus.addEventListener('click', function(){
    state.fontSize = Math.min(44, state.fontSize + 2);
    applyFontSize(); saveState();
  });

  function applyFontStyle(){
    var family = state.fontStyle === 'uthmani'
      ? "'Uthmanic Hafs', 'Amiri Quran', 'Noto Naskh Arabic', serif"
      : "'Amiri Quran', 'Noto Naskh Arabic', serif";
    document.documentElement.style.setProperty('--font-quran', family);
    document.body.classList.toggle('uthmani-font', state.fontStyle === 'uthmani');
    var btnAmiri = document.getElementById('btnFontAmiri');
    var btnUthmani = document.getElementById('btnFontUthmani');
    if(btnAmiri) btnAmiri.classList.toggle('active', state.fontStyle !== 'uthmani');
    if(btnUthmani) btnUthmani.classList.toggle('active', state.fontStyle === 'uthmani');
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
    state.showWaqfMarks = els.waqfToggle.checked;
    applyWaqfVisibility(); saveState();
  });

  els.btnResetProgress.addEventListener('click', function(){
    state.furthest = state.page || 0;
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

  function renderSurahList(list, container){
    if(!list.length){
      container.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
      return;
    }
    var html = list.map(function(s){
      return '<div class="index-item" data-page="'+s.page+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + toArabicDigits(s.surah) + '</span>' +
          '<div class="name">' + s.name + '</div>' +
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
    renderSurahList(filtered, els.searchResults);
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

  // ---- Bookmark (علامة القراءة): a single saved spot, separate from
  // favorites. Tapping the bookmark button always saves/moves it to the
  // ruku currently open. Tapping the home-screen bookmark card jumps
  // straight back to that saved spot.
  els.btnBookmark && els.btnBookmark.addEventListener('click', function(){
    bookmark = {page: state.page, ts: Date.now()};
    saveBookmarkToStorage();
    updateBookmarkButton();
    showToast('تم حفظ علامة القراءة هنا');
  });

  els.bookmarkCard && els.bookmarkCard.addEventListener('click', function(){
    if(!bookmark) return;
    openReaderAt(bookmark.page);
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
  if(els.waqfToggle) els.waqfToggle.checked = state.showWaqfMarks !== false;
  applyWaqfVisibility();
  buildIndex();
  updateProgressUI();
  updateBookmarkCard();

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
})();
