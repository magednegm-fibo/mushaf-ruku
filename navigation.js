// Navigation: every way of jumping to a specific ruku — the ruku index
// (فهرس), the surah index, the juz index, text search, the "go to ruku
// number" dialog, and the swipe/pinch touch gestures on the page itself
// (swipe to turn pages, pinch to zoom the font size).
// Loaded before app.js (see index.html). Call Navigation.init(deps) once;
// deps: els, state, PAGES, JUZ_INFO, UI, Dialogs, Home, Settings,
//       AudioManager, ReaderManager, saveState
// Exposed as window.Navigation.
(function(){
  'use strict';

  var els, state, PAGES, JUZ_INFO, UI, Dialogs, Home, Settings, AudioManager, ReaderManager, saveState;

  // ===================================================================
  // Ruku index (الفهرس)
  // ===================================================================
  var indexBuilt = false;
  function buildIndex(){
    var html = '';
    var lastJuz = null;
    // "إظهار ركوعات الجزء الحالي فقط": when on, restrict the list to the
    // juz the currently-open ruku belongs to instead of all 556. Juz-amma
    // builds (!JUZ_INFO.fullMushaf) only ever contain one juz anyway, so
    // the toggle is a no-op there (and hidden — see init()).
    var onlyJuz = (JUZ_INFO.fullMushaf && state.juzOnlyMode && PAGES[state.page]) ? PAGES[state.page].juz : null;
    PAGES.forEach(function(p, i){
      if(onlyJuz !== null && p.juz !== onlyJuz) return;
      var firstName = p.ayahs[0].surahName;
      var firstAyah = p.ayahs[0].ayah;
      if(JUZ_INFO.fullMushaf && p.juz !== lastJuz){
        if(onlyJuz === null){
          html += '<div class="juz-header">الجزء ' + UI.toArabicDigits(p.juz) + '</div>';
        }
        lastJuz = p.juz;
      }
      var rukuLabelNum = JUZ_INFO.fullMushaf ? p.ruku : p.rukuInJuz;
      html += '<div class="index-item" data-idx="'+i+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + UI.toArabicDigits(i+1) + '</span>' +
          '<div><div class="name">' + firstName + '</div>' +
          '<div class="meta">يبدأ من الآية ' + UI.toArabicDigits(firstAyah) + ' \u2022 الركوع ' + UI.toArabicDigits(rukuLabelNum) + '</div></div>' +
        '</div>' +
      '</div>';
    });
    els.indexList.innerHTML = html || '<div class="empty-state">لا توجد نتائج</div>';
  }
  // Highlights the ruku currently open and scrolls it into the middle of
  // the index list, so opening the index from deep inside the mushaf
  // doesn't dump the user back at الفاتحة every time.
  function highlightAndScrollIndexToCurrent(){
    var prev = els.indexList.querySelector('.index-item.current');
    if(prev) prev.classList.remove('current');
    var current = els.indexList.querySelector('.index-item[data-idx="' + state.page + '"]');
    if(current){
      current.classList.add('current');
      current.scrollIntoView({block: 'center'});
    }
  }

  // ===================================================================
  // Surah index / juz index / search — shared row renderer
  // ===================================================================
  function renderSurahList(list, container){
    if(!list.length){
      container.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
      return;
    }
    var html = list.map(function(s){
      var meta = window.SURAH_META && window.SURAH_META[s.surah] ? window.SURAH_META[s.surah] : {};
      var surahInfo = '';
      if(meta.type && meta.ayahs){
        surahInfo = meta.type + ' \u2022 ' + UI.toArabicDigits(meta.ayahs) + ' آية';
      }
      var displayName = (window.SURAH_NAMES_VOCALIZED && window.SURAH_NAMES_VOCALIZED[s.surah]) || s.name;
      return '<div class="index-item" data-page="'+s.page+'">' +
        '<div class="index-item-inner">' +
          '<span class="num">' + UI.toArabicDigits(s.surah) + '</span>' +
          '<div style="flex:1">' +
            '<div class="name">' + displayName + '</div>' +
            (surahInfo ? '<div class="surah-info">' + surahInfo + '</div>' : '') +
          '</div>' +
          '<button class="index-play-btn" data-surah="'+s.surah+'" data-page="'+s.page+'" aria-label="استماع لكامل السورة" title="استماع لكامل السورة">' +
            '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    container.innerHTML = html;
  }
  function renderAyahResults(list, container, query){
    if(!list.length) return;
    var heading = '<div class="setting-row static" style="margin-top:8px;"><span>آيات مطابقة</span></div>';
    var html = list.map(function(e){
      var src = state.fontStyle !== 'uthmani' ? e.textIndopak : e.text;
      var range = SearchManager.findMatchWordRange(src, query) || {start: 0, end: 0};
      return '<div class="index-item ayah-result-item" data-page="' + e.page + '" data-surah="' + e.surah + '" data-ayah="' + e.ayah + '" data-w-start="' + range.start + '" data-w-end="' + range.end + '">' +
        '<div class="index-item-inner">' +
          '<div style="flex:1;">' +
            '<div class="name">' + e.surahName + ' \u2022 آية ' + UI.toArabicDigits(e.ayah) + '</div>' +
            '<div class="surah-info" style="direction:rtl; white-space:normal; line-height:1.6;">' + SearchManager.ayahSnippet(src, query) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    container.insertAdjacentHTML('beforeend', heading + html);
  }
  // Delegated once per container (els.surahList and els.searchResults)
  // instead of re-attaching a listener to every row on every render (this
  // runs on every keystroke while searching) — see wiring in init().
  function handleIndexContainerClick(e){
    var container = this;
    var playBtn = e.target.closest('.index-play-btn');
    if(playBtn && container.contains(playBtn)){
      // Listening to the whole surah is a distinct action from opening it
      // — tapping the row itself just navigates (no audio); tapping this
      // play icon opens the surah AND starts continuous recitation that
      // turns pages automatically as it moves ruku to ruku through it.
      var surahNum = parseInt(playBtn.getAttribute('data-surah'), 10);
      var pageIdx = parseInt(playBtn.getAttribute('data-page'), 10);
      if(isNaN(surahNum) || isNaN(pageIdx)) return;
      Home.openReaderAt(pageIdx);
      UI.closePanel(els.surahPanel);
      UI.closePanel(els.searchPanel);
      AudioManager.playSurah(surahNum);
      return;
    }
    var ayahItem = e.target.closest('.ayah-result-item');
    if(ayahItem && container.contains(ayahItem)){
      ReaderManager.openAyah(
        parseInt(ayahItem.getAttribute('data-page'), 10),
        parseInt(ayahItem.getAttribute('data-surah'), 10),
        parseInt(ayahItem.getAttribute('data-ayah'), 10),
        parseInt(ayahItem.getAttribute('data-w-start'), 10),
        parseInt(ayahItem.getAttribute('data-w-end'), 10)
      );
      UI.closePanel(els.searchPanel);
      return;
    }
    var surahItem = e.target.closest('.index-item');
    if(surahItem && container.contains(surahItem)){
      Home.openReaderAt(parseInt(surahItem.getAttribute('data-page'), 10));
      UI.closePanel(els.surahPanel);
      UI.closePanel(els.searchPanel);
    }
  }

  // ===================================================================
  // Swipe (page turn) + pinch (font-size zoom)
  // ===================================================================
  function wireSwipeAndPinch(){
    // RTL page-turn convention used throughout this app: dragging the
    // finger to the right (dx > 0) advances forward (like turning a page
    // in an Arabic book), dragging left goes back. This must stay in
    // sync with ReaderManager's ArrowLeft/ArrowRight handling.
    var startX = null, startY = null;
    var frame = els.pageFrame;

    // Two-finger pinch zoom: reuses the exact same per-script-mode font
    // size (via Settings.currentFontSizeKey) used by the "+"/"−" buttons
    // in الإعدادات, so pinching and those buttons always agree, each
    // script mode keeps its own remembered size, and switching mode never
    // carries a pinched size over to the other script. Can be turned off
    // from الإعدادات (state.pinchZoomEnabled) for readers who trigger it
    // by accident while turning pages with two fingers.
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
      var key = Settings.currentFontSizeKey();
      var newSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(pinchStartFontSize * ratio)));
      if(newSize !== state[key]){
        state[key] = newSize;
        Settings.applyFontSize();
      }
    }

    function endPinch(){
      pinching = false;
      pinchStartDist = null;
      frame.removeEventListener('touchmove', onPinchMove, {passive:false});
      saveState();
      UI.showToast('حجم الخط: ' + UI.toArabicDigits(state[Settings.currentFontSizeKey()]));
    }

    frame.addEventListener('touchstart', function(e){
      if(e.touches.length === 2 && state.pinchZoomEnabled !== false){
        pinching = true;
        startX = null; startY = null; // a pinch is never a one-finger swipe
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartFontSize = state[Settings.currentFontSizeKey()];
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
        if(dx > 0) ReaderManager.goToRelativePage(1);
        else ReaderManager.goToRelativePage(-1);
      }
      startX = null; startY = null;
    }, {passive:true});
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    PAGES = deps.PAGES;
    JUZ_INFO = deps.JUZ_INFO;
    UI = deps.UI;
    Dialogs = deps.Dialogs;
    Home = deps.Home;
    Settings = deps.Settings;
    AudioManager = deps.AudioManager;
    ReaderManager = deps.ReaderManager;
    saveState = deps.saveState;

    // ---- الفهرس (by ruku number) ----
    els.indexList.addEventListener('click', function(e){
      var el = e.target.closest('.index-item');
      if(!el || !els.indexList.contains(el)) return;
      ReaderManager.goToPage(parseInt(el.getAttribute('data-idx'), 10));
      UI.closePanel(els.indexPanel);
    });
    els.btnIndex.addEventListener('click', function(){
      // Lazy: building all ٥٥٦ rows costs real work (string concatenation
      // + innerHTML parsing) that most sessions never need, since not
      // every reader opens the ruku index. Build it once, the first time
      // it's actually opened, and reuse it after that — except in
      // juz-only mode, where the (much cheaper, ~20-row) filtered list is
      // always rebuilt fresh so it reflects whichever juz is current, and
      // is never cached.
      if(JUZ_INFO.fullMushaf && state.juzOnlyMode){
        buildIndex();
      } else if(!indexBuilt){
        buildIndex();
        indexBuilt = true;
      }
      UI.openPanel(els.indexPanel);
      // Wait a frame so the panel is laid out/visible before scrolling.
      requestAnimationFrame(function(){ highlightAndScrollIndexToCurrent(); });
    });
    els.btnCloseIndex.addEventListener('click', function(){ UI.closePanel(els.indexPanel); });

    // ---- فهرس السور ----
    els.surahList.addEventListener('click', handleIndexContainerClick);
    els.tileSurah.addEventListener('click', function(){
      renderSurahList(SearchManager.getSurahOrder(), els.surahList);
      UI.openPanel(els.surahPanel);
    });
    els.btnCloseSurah.addEventListener('click', function(){ UI.closePanel(els.surahPanel); });

    // ---- فهرس الأجزاء ----
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
            '<span class="num">' + UI.toArabicDigits(j.juz) + '</span>' +
            '<div style="flex:1"><div class="name">الجزء ' + UI.toArabicDigits(j.juz) + '</div>' +
            '<div class="meta">يبدأ من سورة ' + j.name + '</div></div>' +
            '<button class="index-play-btn" data-juz="'+j.juz+'" data-page="'+j.page+'" aria-label="استماع لهذا الجزء" title="استماع لهذا الجزء">' +
              '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');
      els.juzList.innerHTML = html || '<div class="empty-state">غير متاح</div>';
      UI.openPanel(els.juzPanel);
    });
    els.juzList.addEventListener('click', function(e){
      var playBtn = e.target.closest('.index-play-btn');
      if(playBtn && els.juzList.contains(playBtn)){
        // Same distinction as فهرس السور: tapping the row just navigates,
        // tapping this play icon opens the juz's first ruku AND starts
        // continuous recitation that auto-turns pages ruku by ruku until
        // the whole juz has been recited.
        var juzNum = parseInt(playBtn.getAttribute('data-juz'), 10);
        var pageIdx = parseInt(playBtn.getAttribute('data-page'), 10);
        if(isNaN(juzNum) || isNaN(pageIdx)) return;
        Home.openReaderAt(pageIdx);
        UI.closePanel(els.juzPanel);
        AudioManager.playJuz(juzNum);
        return;
      }
      var el = e.target.closest('.index-item');
      if(!el || !els.juzList.contains(el)) return;
      Home.openReaderAt(parseInt(el.getAttribute('data-page'), 10));
      UI.closePanel(els.juzPanel);
    });
    els.btnCloseJuz.addEventListener('click', function(){ UI.closePanel(els.juzPanel); });

    // ---- إظهار ركوعات الجزء الحالي فقط ----
    if(els.juzOnlyToggle){
      els.juzOnlyToggle.checked = !!state.juzOnlyMode;
      els.juzOnlyToggle.addEventListener('change', function(){
        state.juzOnlyMode = els.juzOnlyToggle.checked;
        saveState();
        // The filtered/unfiltered ركوع index is rebuilt fresh next time
        // it's opened (see btnIndex handler above) — nothing to refresh
        // here. The prev/next buttons, though, need their disabled state
        // updated immediately, since the juz boundary they should now
        // respect (or stop respecting) doesn't change until the next
        // renderPage() otherwise.
        ReaderManager.updateNavButtons();
        UI.showToast(state.juzOnlyMode ? 'هيتم عرض ركوعات هذا الجزء فقط' : 'هيتم عرض كل الركوعات');
      });
    }

    // ---- البحث ----
    els.tileSearch.addEventListener('click', function(){
      els.searchInput.value = '';
      renderSurahList(SearchManager.getSurahOrder(), els.searchResults);
      UI.openPanel(els.searchPanel);
      setTimeout(function(){ els.searchInput.focus(); }, 200);
    });
    els.btnCloseSearch.addEventListener('click', function(){ UI.closePanel(els.searchPanel); });
    els.searchResults.addEventListener('click', handleIndexContainerClick);
    els.searchInput.addEventListener('input', function(){
      var q = els.searchInput.value.trim();
      if(!q){ renderSurahList(SearchManager.getSurahOrder(), els.searchResults); return; }
      var filtered = SearchManager.searchSurahs(q);
      // Ayah text search only kicks in from 2 characters so a single
      // letter doesn't return a huge, meaningless result set.
      var ayahMatches = q.length >= 2 ? SearchManager.searchAyahs(q) : [];
      if(!filtered.length && !ayahMatches.length){
        els.searchResults.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
        return;
      }
      if(filtered.length) renderSurahList(filtered, els.searchResults);
      else els.searchResults.innerHTML = '';
      if(ayahMatches.length) renderAyahResults(ayahMatches, els.searchResults, q);
    });

    // ---- الذهاب إلى ركوع رقم ----
    function openGoto(){
      Dialogs.openGotoModal(state.page + 1, PAGES.length, function(n){
        Home.openReaderAt(n - 1);
      });
    }
    els.btnGoto && els.btnGoto.addEventListener('click', openGoto);
    els.pageIndicator && els.pageIndicator.addEventListener('click', openGoto);

    wireSwipeAndPinch();

    UI.registerOverlayPanels([els.indexPanel, els.surahPanel, els.juzPanel, els.searchPanel].filter(Boolean));

    if(!JUZ_INFO.fullMushaf && els.tileJuz){
      els.tileJuz.classList.add('hidden');
    }
    if(!JUZ_INFO.fullMushaf && els.juzOnlyRow){
      els.juzOnlyRow.classList.add('hidden');
    }
  }

  window.Navigation = {
    init: init
  };
})();
