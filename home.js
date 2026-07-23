// Home: the home screen — switching between it and the reader screen,
// "استكمال آخر قراءة" progress (bar/percentage/resume point), and
// rendering the علامة القراءة card (its data comes from ReaderBookmark;
// this module only owns *displaying* it on the home screen and the
// screen transition when it's tapped).
// Loaded before app.js (see index.html). Call Home.init(deps) once;
// deps: els, state, PAGES, JUZ_INFO, UI, AudioManager, ReaderManager, ReaderBookmark
// Exposed as window.Home.
(function(){
  'use strict';

  var els, state, PAGES, JUZ_INFO, UI, AudioManager, ReaderManager, ReaderBookmark;

  // "استكمال آخر قراءة" — both the visual bar/percentage and the resume
  // point — are a single value shared between both script modes (Uthmani
  // and Indopak), since the reader is progressing through the same Quran
  // regardless of which script they're currently viewing it in. It still
  // reflects the reader's current (last-visited) position, moving up *and
  // down* as they navigate, rather than only ever climbing to the furthest
  // point ever reached.
  function currentLastPageKey(){ return 'lastPageShared'; }
  function progressRatio(){
    var reached = (state[currentLastPageKey()] || 0) + 1;
    return Math.min(1, reached / PAGES.length);
  }
  function updateProgressUI(){
    var ratio = progressRatio();
    var pct = Math.round(ratio * 100);
    var reachedCount = (state[currentLastPageKey()] || 0) + 1;
    if(els.homeProgressFill) els.homeProgressFill.style.width = pct + '%';
    if(els.homeProgressPercent) els.homeProgressPercent.textContent = UI.toArabicDigits(pct) + '٪';
    if(els.homeProgressText) els.homeProgressText.textContent = 'قرأ ' + UI.toArabicDigits(reachedCount) + ' من ' + UI.toArabicDigits(PAGES.length) + ' ركوعًا';
    if(els.stripFill) els.stripFill.style.width = (((state.page||0)+1)/PAGES.length*100) + '%';
    if(els.settingsProgress) els.settingsProgress.textContent = UI.toArabicDigits(pct) + '٪';
  }
  function markPageVisited(i){
    // The per-script resume point/progress is only updated here, on real
    // navigation — not on every render, which also runs when merely
    // switching الرسم on the same page and must not credit that page as
    // "read" in the newly-selected script.
    state[currentLastPageKey()] = i;
  }
  function resetProgress(){
    // Progress mirrors the last-visited position directly, so "reset"
    // means starting over from the beginning — for both script modes at
    // once, since the two mushafs share a single progress value.
    state[currentLastPageKey()] = 0;
    updateProgressUI();
  }

  function updateBookmarkCard(){
    if(!els.bookmarkCard) return;
    var info = ReaderBookmark.getBookmarkInfo();
    if(!info){
      els.bookmarkCard.classList.add('hidden');
      return;
    }
    els.bookmarkCard.classList.remove('hidden');
    var rukuLabel = JUZ_INFO.fullMushaf ? info.pageData.ruku : info.pageData.rukuInJuz;
    if(els.bookmarkCardText){
      els.bookmarkCardText.textContent = info.surahName + ' \u2022 الركوع ' + UI.toArabicDigits(rukuLabel);
    }
  }

  function showReader(){
    var wasHome = !els.homeScreen.classList.contains('hidden');
    els.homeScreen.classList.add('hidden');
    els.readerScreen.classList.remove('hidden');
    if(wasHome){
      // Reached here two ways: (a) directly from the home screen itself
      // (بطاقة "استكمال القراءة"/"علامة القراءة") — history is currently
      // sitting on the 'home' entry, so a fresh 'reader' layer belongs on
      // top of it; or (b) from selecting a row inside a panel that was
      // opened OVER the home screen (فهرس السور/الأجزاء/البحث/المفضلة,
      // or the nested "الانتقال إلى آية" dialog stacked over فهرس السور)
      // — history is still sitting on THAT panel's own 'panel' entry,
      // which the caller closes right after via UI.closePanel(panel).
      // Pushing a NEW 'reader' entry in case (b) used to leave the
      // panel's entry orphaned underneath it: by the time closePanel ran
      // afterwards, the current top was already 'reader' (not 'panel'),
      // so closePanel's "only pop if I'm still the current top" check
      // silently failed to pop it, and that extra unpoppable layer made
      // the NEXT back-eligible event (hardware back button, or another
      // panel's own close) land on that orphaned entry — with no panel
      // actually open there for closeTopmostOverlay() to find, it fell
      // through to Home.maybeGoHomeOnPopstate and exited straight to the
      // home screen. (state.lastPageShared was already updated by then,
      // which is why "استكمال القراءة" afterwards correctly resumed at
      // the very surah that had just been force-exited from.)
      // Fix: in case (b), REPLACE that panel's entry with the reader's
      // in one synchronous history.replaceState (see
      // UI.replaceHistoryState — fires no popstate, so there's no async
      // gap either) instead of pushing a separate new layer on top of
      // it. UI.closePanel(panel) still runs as normal right after (in
      // every caller) and always hides the panel's DOM either way; its
      // own history-pop attempt now correctly finds nothing left to pop
      // (the entry is already 'reader'), so it's a harmless no-op there.
      if(history.state && history.state.tag === 'panel'){
        UI.replaceHistoryState('reader');
      } else {
        UI.pushHistoryState('reader');
      }
    }
  }
  function showHome(){
    AudioManager.stopListening();
    updateProgressUI();
    updateBookmarkCard();
    els.readerScreen.classList.add('hidden');
    els.homeScreen.classList.remove('hidden');
  }
  function openReaderAt(i){
    showReader();
    ReaderManager.goToPage(i);
  }
  // Called by app.js's master popstate listener after UI.closeTopmostOverlay()
  // finds no open panel/modal to close — the "go back to home" layer.
  function maybeGoHomeOnPopstate(tag){
    if(tag !== 'reader' && !els.readerScreen.classList.contains('hidden')){
      showHome();
    }
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    PAGES = deps.PAGES;
    JUZ_INFO = deps.JUZ_INFO;
    UI = deps.UI;
    AudioManager = deps.AudioManager;
    ReaderManager = deps.ReaderManager;
    ReaderBookmark = deps.ReaderBookmark;

    els.btnHome.addEventListener('click', function(){
      UI.backIfTag('reader', showHome);
    });
    els.btnContinue.addEventListener('click', function(){ openReaderAt(state[currentLastPageKey()] || 0); });
  }

  window.Home = {
    init: init,
    showReader: showReader,
    showHome: showHome,
    openReaderAt: openReaderAt,
    updateProgressUI: updateProgressUI,
    updateBookmarkCard: updateBookmarkCard,
    markPageVisited: markPageVisited,
    resetProgress: resetProgress,
    currentLastPageKey: currentLastPageKey,
    maybeGoHomeOnPopstate: maybeGoHomeOnPopstate
  };
})();
