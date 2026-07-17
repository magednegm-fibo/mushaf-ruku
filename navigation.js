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
  // Renders the search-results state of the search panel: full ayah text
  // (not a snippet) with the matched word range highlighted via
  // ReaderManager.renderAyahTextWithHighlight, plus surah/ayah/ruku meta
  // and a divider between rows. Deliberately NOT reusing renderSurahList/
  // .index-item — those rows are for the "browse by surah name" index,
  // this is a distinct "full ayah with a highlighted hit" row, wired to
  // its own click handler (see handleSearchResultClick) rather than the
  // shared handleIndexContainerClick.
  function renderSearchResults(list, query, exact){
    if(!list.length){
      els.searchResults.innerHTML = '';
      return;
    }
    var html = list.map(function(e, i){
      // Prefer the reader's currently-active script; if that script's raw
      // text doesn't actually yield a resolvable word position for this
      // query (a normalization gap between the Uthmani and Indopak
      // datasets — see the "كافر" root case in normalizeArabic — known or
      // not yet discovered), fall back to rendering THIS ONE row in the
      // other script instead of guessing {start:0,end:0}. A correctly
      // highlighted ayah in the "other" script beats a wrong or missing
      // highlight in the "right" one.
      var primarySrc = state.fontStyle !== 'uthmani' ? e.textIndopak : e.text;
      var altSrc = state.fontStyle !== 'uthmani' ? e.text : e.textIndopak;
      var src = primarySrc;
      var range = SearchManager.findMatchWordRange(primarySrc, query, exact);
      if(!range && altSrc !== primarySrc){
        range = SearchManager.findMatchWordRange(altSrc, query, exact);
        if(range) src = altSrc;
      }
      if(!range) range = {start: 0, end: 0};
      var page = PAGES[e.page];
      var rukuLabel = page ? (JUZ_INFO.fullMushaf ? page.ruku : page.rukuInJuz) : null;
      var metaParts = [e.surahName, 'الآية ' + UI.toArabicDigits(e.ayah)];
      if(rukuLabel != null) metaParts.push('الركوع ' + UI.toArabicDigits(rukuLabel));
      return (i > 0 ? '<hr class="search-result-divider">' : '') +
        '<div class="search-result-item" data-page="' + e.page + '" data-surah="' + e.surah + '" data-ayah="' + e.ayah + '" data-w-start="' + range.start + '" data-w-end="' + range.end + '">' +
          '<div class="search-result-meta">' +
            '<span class="search-result-num">' + UI.toArabicDigits(i + 1) + '</span>' +
            '<span>' + metaParts.join(' \u2022 ') + '</span>' +
          '</div>' +
          '<div class="search-result-text">' + window.ReaderManager.renderAyahTextWithHighlight(src, range) + '</div>' +
        '</div>';
    }).join('');
    els.searchResults.innerHTML = html;
  }
  function handleSearchResultClick(e){
    var item = e.target.closest('.search-result-item');
    if(!item || !els.searchResults.contains(item)) return;
    ReaderManager.openAyah(
      parseInt(item.getAttribute('data-page'), 10),
      parseInt(item.getAttribute('data-surah'), 10),
      parseInt(item.getAttribute('data-ayah'), 10),
      parseInt(item.getAttribute('data-w-start'), 10),
      parseInt(item.getAttribute('data-w-end'), 10)
    );
    UI.closePanel(els.searchPanel);
  }
  // Delegated once on els.surahList instead of re-attaching a listener to
  // every row on every render (this runs on every keystroke while
  // browsing/filtering the surah index) — see wiring in init(). Search
  // results have their own dedicated handler (handleSearchResultClick)
  // since their rows are a different shape (full ayah + highlight, not
  // an .index-item).
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
      AudioManager.playSurah(surahNum);
      return;
    }
    var surahItem = e.target.closest('.index-item');
    if(surahItem && container.contains(surahItem)){
      Home.openReaderAt(parseInt(surahItem.getAttribute('data-page'), 10));
      UI.closePanel(els.surahPanel);
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
    //
    // Two-finger pinch zoom: reuses the exact same per-script-mode font
    // size (via Settings.currentFontSizeKey) used by the "+"/"−" buttons
    // in الإعدادات, so pinching and those buttons always agree, each
    // script mode keeps its own remembered size, and switching mode never
    // carries a pinched size over to the other script. Can be turned off
    // from الإعدادات (state.pinchZoomEnabled) for readers who trigger it
    // by accident while turning pages with two fingers.
    var FONT_MIN = 18, FONT_MAX = 44;

    Gestures.swipeAndPinch({
      root: els.pageFrame,
      isPinchEnabled: function(){ return state.pinchZoomEnabled !== false; },
      getPinchValue: function(){ return state[Settings.currentFontSizeKey()]; },
      pinchMin: FONT_MIN,
      pinchMax: FONT_MAX,
      onPinchChange: function(newSize){
        var key = Settings.currentFontSizeKey();
        if(newSize !== state[key]){
          state[key] = newSize;
          Settings.applyFontSize();
        }
      },
      onPinchEnd: function(){
        saveState();
        UI.showToast('حجم الخط: ' + UI.toArabicDigits(state[Settings.currentFontSizeKey()]));
      },
      onSwipe: function(dx){
        if(dx > 0) ReaderManager.goToRelativePage(1);
        else ReaderManager.goToRelativePage(-1);
      }
    });
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
    // One panel, one visible layout — the input/بحث row never hides;
    // results render below it in place. Opening the panel (tileSearch)
    // always resets first, so a session never carries over from a
    // previous search. The panel's own close button (and the Android
    // hardware back button, via UI.registerOverlayPanels) always closes
    // the whole panel back to whatever's underneath (the home screen,
    // since tileSearch only lives there) regardless of whether results
    // are showing — never "back into the results".
    //
    // Single button, two modes: "بحث" runs the search; once a search has
    // run — found results or not — the SAME button switches to "مسح"
    // (the input itself gets locked read-only at that point) — pressing
    // it is the only way to search again, so a result the user is
    // mid-review of never gets silently replaced by an accidental
    // re-search. Mode is derived from searchInput.readOnly rather than
    // tracked separately, so the two can never drift out of sync.
    function updateSearchButtonMode(){
      var locked = els.searchInput.readOnly;
      els.btnRunSearch.innerHTML = locked
        ? '<svg class="search-run-icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12"/></svg><span class="search-run-label">مسح</span>'
        : '<svg class="search-run-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><span class="search-run-label">بحث</span>';
      els.btnRunSearch.classList.toggle('is-clear-mode', locked);
    }
    function resetSearchToInput(){
      els.searchInput.value = '';
      els.searchInput.readOnly = false;
      els.exactSearchToggle.checked = false;
      els.exactSearchToggle.disabled = false;
      els.searchValidationMsg.classList.add('hidden');
      els.searchResultsCount.classList.add('hidden');
      els.searchSurahResults.innerHTML = '';
      els.searchSurahSection.classList.add('hidden');
      els.searchResults.innerHTML = '';
      els.searchAyahSection.classList.add('hidden');
      updateSearchButtonMode();
    }
    // البحث الموحّد: مربع بحث واحد يبحث في اسم السورة ونص الآية معًا —
    // SearchManager.searchUnified() ترجّع المصدرين مع بعض؛ سور مطابقة أولًا
    // (بنفس بطاقة فهرس السور عبر renderSurahList، بدون تصميم جديد) ثم آيات
    // مطابقة (بنفس شكل نتائج البحث النصي القديم). كل قسم يظهر/يختفي حسب
    // وجود نتائج فيه فعليًا.
    function runSearch(){
      var q = els.searchInput.value.trim();
      if(q.length < 2){
        els.searchValidationMsg.classList.remove('hidden');
        els.searchInput.focus();
        return;
      }
      els.searchValidationMsg.classList.add('hidden');
      var exact = els.exactSearchToggle.checked;
      var result = SearchManager.searchUnified(q, exact);
      var surahs = result.surahs, ayahs = result.ayahs;
      var totalCount = surahs.length + ayahs.length;
      els.searchResultsCount.classList.remove('hidden');
      els.searchResultsCount.textContent = totalCount
        ? ('تم العثور على ' + UI.toArabicDigits(totalCount) + ' نتيجة')
        : 'لا توجد نتائج';

      if(surahs.length){
        renderSurahList(surahs, els.searchSurahResults);
        els.searchSurahSection.classList.remove('hidden');
      } else {
        els.searchSurahResults.innerHTML = '';
        els.searchSurahSection.classList.add('hidden');
      }

      if(ayahs.length){
        renderSearchResults(ayahs, q, exact);
        els.searchAyahSection.classList.remove('hidden');
      } else {
        els.searchResults.innerHTML = '';
        els.searchAyahSection.classList.add('hidden');
      }

      els.searchInput.readOnly = true;
      updateSearchButtonMode();
    }
    // Surah-name matches within the search panel navigate straight to the
    // surah (or, via the play icon, start continuous recitation) exactly
    // like فهرس السور — reuses handleIndexContainerClick's own logic
    // shape but closes els.searchPanel (not els.surahPanel) since these
    // rows live inside the search panel.
    function handleSearchSurahClick(e){
      var playBtn = e.target.closest('.index-play-btn');
      if(playBtn && els.searchSurahResults.contains(playBtn)){
        var surahNum = parseInt(playBtn.getAttribute('data-surah'), 10);
        var pageIdx = parseInt(playBtn.getAttribute('data-page'), 10);
        if(isNaN(surahNum) || isNaN(pageIdx)) return;
        Home.openReaderAt(pageIdx);
        UI.closePanel(els.searchPanel);
        AudioManager.playSurah(surahNum);
        return;
      }
      var item = e.target.closest('.index-item');
      if(!item || !els.searchSurahResults.contains(item)) return;
      Home.openReaderAt(parseInt(item.getAttribute('data-page'), 10));
      UI.closePanel(els.searchPanel);
    }
    els.tileSearch.addEventListener('click', function(){
      resetSearchToInput();
      UI.openPanel(els.searchPanel);
      setTimeout(function(){ els.searchInput.focus(); }, 200);
    });
    els.btnCloseSearch.addEventListener('click', function(){ UI.closePanel(els.searchPanel); });
    els.btnRunSearch.addEventListener('click', function(){
      if(els.searchInput.readOnly){
        resetSearchToInput();
        els.searchInput.focus();
      } else {
        runSearch();
      }
    });
    els.searchInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); runSearch(); }
    });
    // Live-hide the validation message the moment the person types enough
    // — it shouldn't linger once the condition it's warning about is
    // already satisfied, per direct request.
    els.searchInput.addEventListener('input', function(){
      if(els.searchInput.value.trim().length >= 2){
        els.searchValidationMsg.classList.add('hidden');
      }
    });
    els.searchResults.addEventListener('click', handleSearchResultClick);
    els.searchSurahResults.addEventListener('click', handleSearchSurahClick);
    // Tapping the switch (or its label) moves browser focus to the
    // checkbox itself — standard behavior, but it was dismissing the
    // on-screen keyboard out from under the person mid-typing. Before a
    // search has run, hand focus straight back to the input so typing
    // continues uninterrupted. Once results are showing (input locked),
    // the person is flipping مطابقة to redo the SAME query differently —
    // re-run it immediately using the still-present (just disabled)
    // input value, instead of forcing مسح + retyping.
    els.exactSearchToggle.addEventListener('change', function(){
      if(els.searchInput.readOnly){
        runSearch();
      } else {
        els.searchInput.focus();
      }
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
