// app.js: the application entry point / composition root. Owns the DOM
// element lookup table (els) and the persisted app-wide state (settings,
// PAGES/JUZ_INFO), and wires every feature module together by calling its
// init(deps) with exactly the pieces it needs. Contains no feature logic
// of its own beyond that wiring — favorites/bookmark/reminder marks live
// in reader.js, screen routing/progress in home.js, font/night/wake-lock
// settings in settings.js, index/search/swipe navigation in navigation.js,
// the favorite-name/goto-ruku dialogs in dialogs.js, and generic
// panel/toast/back-button plumbing in ui.js.
(function(){
  'use strict';

  var PAGES = window.JUZ_PAGES || window.JUZ_AMMA_PAGES || [];

  // Every module below is wired with its own init(deps) call, one after
  // another, in a single linear sequence. Without this wrapper, one
  // module throwing (e.g. a stale deploy/cache serving an old index.html
  // that's missing a newly-added <script> tag, so some global the module
  // depends on is undefined) doesn't just break that module — it aborts
  // the *entire* rest of this function, silently, including things that
  // have nothing to do with the failure: Settings.applyAll(), the
  // home-screen stats/about text/version number, and even the service
  // worker's update-check that would otherwise fetch the corrected files
  // and fix itself. safeInit() turns that into a contained, logged
  // failure of just the one module instead.
  function safeInit(name, fn){
    try{
      fn();
    }catch(err){
      console.error('تعذّرت تهيئة "' + name + '" — تم تجاوزها لمنع توقف باقي التطبيق. الخطأ:', err);
    }
  }

  safeInit('SearchManager', function(){ SearchManager.init(PAGES); });
  var JUZ_INFO = window.JUZ_INFO || {name: 'جزء عمّ', shortName: 'جزء عمّ', rukuCount: PAGES.length, ayahCount: 0};

  var state = loadState();
  // دفاعي: goToPage() في readerManager.js بيرفض أي index خارج نطاق
  // PAGES بصمت (return مبكر، من غير أي fallback)، فلو state.page
  // المحفوظة في localStorage طلعت خارج النطاق (تخزين تالف، أو تغيير
  // مستقبلي في تقسيم الركوعات يقلل PAGES.length) هيفضل القارئ على شاشة
  // فاضية تمامًا من غير أي رسالة خطأ ومن غير تعافي تلقائي. الـclamp هنا
  // بيضمن إن state.page دايمًا داخل النطاق الصحيح قبل أي استخدام ليها.
  if(PAGES.length){
    state.page = Math.max(0, Math.min(state.page || 0, PAGES.length - 1));
  }

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
    displayScopeSelect: document.getElementById('displayScopeSelect'),

    tileSurah: document.getElementById('tileSurah'),
    tileJuz: document.getElementById('tileJuz'),
    tileSearch: document.getElementById('tileSearch'),
    tileFavorites: document.getElementById('tileFavorites'),
    tileSettings: document.getElementById('tileSettings'),
    tileWaqfGuide: document.getElementById('tileWaqfGuide'),

    surahPanel: document.getElementById('surahPanel'),
    surahList: document.getElementById('surahList'),
    btnCloseSurah: document.getElementById('btnCloseSurah'),

    juzPanel: document.getElementById('juzPanel'),
    juzList: document.getElementById('juzList'),
    btnCloseJuz: document.getElementById('btnCloseJuz'),

    searchPanel: document.getElementById('searchPanel'),
    searchValidationMsg: document.getElementById('searchValidationMsg'),
    exactSearchToggle: document.getElementById('exactSearchToggle'),
    searchInput: document.getElementById('searchInput'),
    btnRunSearch: document.getElementById('btnRunSearch'),
    searchResultsCount: document.getElementById('searchResultsCount'),
    searchSurahSection: document.getElementById('searchSurahSection'),
    searchSurahResults: document.getElementById('searchSurahResults'),
    searchAyahSection: document.getElementById('searchAyahSection'),
    searchResults: document.getElementById('searchResults'),
    btnCloseSearch: document.getElementById('btnCloseSearch'),

    favoritesPanel: document.getElementById('favoritesPanel'),
    favoritesList: document.getElementById('favoritesList'),
    btnCloseFavorites: document.getElementById('btnCloseFavorites'),

    waqfGuidePanel: document.getElementById('waqfGuidePanel'),
    btnCloseWaqfGuide: document.getElementById('btnCloseWaqfGuide'),
    tabWaqfMarks: document.getElementById('tabWaqfMarks'),
    tabTajweedRules: document.getElementById('tabTajweedRules'),
    tabKhatmDua: document.getElementById('tabKhatmDua'),
    waqfMarksTab: document.getElementById('waqfMarksTab'),
    tajweedRulesTab: document.getElementById('tajweedRulesTab'),
    khatmDuaTab: document.getElementById('khatmDuaTab'),

    btnTafsir: document.getElementById('btnTafsir'),
    tafsirPanel: document.getElementById('tafsirPanel'),
    btnCloseTafsir: document.getElementById('btnCloseTafsir'),
    tafsirList: document.getElementById('tafsirList'),
    btnTafsirPrev: document.getElementById('btnTafsirPrev'),
    btnTafsirNext: document.getElementById('btnTafsirNext'),

    btnFavorite: document.getElementById('btnFavorite'),
    btnListen: document.getElementById('btnListen'),
    listenIconPlay: document.getElementById('listenIconPlay'),
    listenIconPause: document.getElementById('listenIconPause'),
    listenIconLoading: document.getElementById('listenIconLoading'),
    reciterSelect: document.getElementById('reciterSelect'),
    autoScrollToggle: document.getElementById('autoScrollToggle'),
    recitationScopeSelect: document.getElementById('recitationScopeSelect'),
    recitationRepeatSelect: document.getElementById('recitationRepeatSelect'),
    playbackSpeedSelect: document.getElementById('playbackSpeedSelect'),
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
    btnClearAllReminders: document.getElementById('btnClearAllReminders'),
    clearRemindersModal: document.getElementById('clearRemindersModal'),
    clearRemindersModalText: document.getElementById('clearRemindersModalText'),
    clearRemindersModalCancel: document.getElementById('clearRemindersModalCancel'),
    clearRemindersModalConfirm: document.getElementById('clearRemindersModalConfirm'),
    pinchZoomToggle: document.getElementById('pinchZoomToggle'),
    wakeLockToggle: document.getElementById('wakeLockToggle'),
    wakeLockRow: document.getElementById('wakeLockRow'),
    btnExportWaqf: document.getElementById('btnExportWaqf'),
    importWaqfInput: document.getElementById('importWaqfInput'),

    // Previously queried with document.getElementById/querySelector on
    // every call to a function that runs repeatedly (render(), on every
    // page turn; applyFontStyle(), on every script-mode switch) instead
    // of once here — see README changelog.
    rukuEnd: document.getElementById('rukuEnd'),
    rukuMarkSpan: document.querySelector('#rukuEnd .ruku-mark span'),
    pageFrame: document.querySelector('.page-frame'),
    btnFontAmiri: document.getElementById('btnFontAmiri'),
    btnFontUthmani: document.getElementById('btnFontUthmani'),
    eyebrowText: document.getElementById('eyebrowText'),
    rukuCount: document.getElementById('rukuCount'),
    ayahCount: document.getElementById('ayahCount'),
    aboutText: document.getElementById('aboutText'),
    appVersionText: document.getElementById('appVersionText')
  };

  function loadState(){
    return StorageManager.loadSettings();
  }
  function saveState(){
    StorageManager.saveSettings(state);
  }

  // -----------------------------------------------------------------
  // Wire up every feature module. Order matters only where one module's
  // init() reads a value another module's init() sets up (e.g. the
  // reader-* modules need Settings' currentWaqfVisibilityKey and Home's
  // openReaderAt) — those are passed as plain functions, most of which
  // are safe to reference before the other module's init() has actually
  // run, since they aren't *called* until a later user interaction.
  // -----------------------------------------------------------------
  safeInit('UI', function(){ UI.init({els: els}); });

  safeInit('Dialogs', function(){ Dialogs.init({els: els, UI: UI}); });

  safeInit('Home', function(){
    Home.init({
      els: els, state: state, PAGES: PAGES, JUZ_INFO: JUZ_INFO, UI: UI,
      AudioManager: AudioManager, ReaderManager: ReaderManager,
      ReaderBookmark: ReaderBookmark
    });
  });

  safeInit('ReaderFavorites', function(){
    ReaderFavorites.init({
      els: els, state: state, PAGES: PAGES, UI: UI, Dialogs: Dialogs,
      openReaderAt: Home.openReaderAt
    });
  });

  safeInit('ReaderBookmark', function(){
    ReaderBookmark.init({
      els: els, state: state, PAGES: PAGES, UI: UI,
      openReaderAt: Home.openReaderAt
    });
  });

  safeInit('ReaderReminders', function(){
    ReaderReminders.init({
      els: els, state: state, UI: UI, AudioManager: AudioManager,
      currentWaqfVisibilityKey: function(){ return Settings.currentWaqfVisibilityKey(); }
    });
  });

  safeInit('ReaderGuide', function(){ ReaderGuide.init({els: els, UI: UI}); });

  safeInit('ReaderTafsir', function(){
    ReaderTafsir.init({els: els, state: state, PAGES: PAGES, UI: UI, ReaderManager: ReaderManager});
  });

  safeInit('Settings', function(){
    Settings.init({
      els: els, state: state, UI: UI, PAGES: PAGES,
      AudioManager: AudioManager, ReaderManager: ReaderManager,
      ReaderBookmark: ReaderBookmark, ReaderReminders: ReaderReminders,
      Home: Home, saveState: saveState
    });
  });

  safeInit('Navigation', function(){
    Navigation.init({
      els: els, state: state, PAGES: PAGES, JUZ_INFO: JUZ_INFO, UI: UI,
      Dialogs: Dialogs, Home: Home, Settings: Settings,
      AudioManager: AudioManager, ReaderManager: ReaderManager,
      saveState: saveState
    });
  });

  safeInit('ReaderManager', function(){
    ReaderManager.init({
      PAGES: PAGES,
      JUZ_INFO: JUZ_INFO,
      state: state,
      els: els,
      toArabicDigits: UI.toArabicDigits,
      REMINDER_COLORS: ReaderReminders.REMINDER_COLORS,
      getWaqfMarks: function(){ return ReaderReminders.getWaqfMarks(); },
      showReader: Home.showReader,
      onBeforePageChange: function(opts){
        if(!opts || !opts.keepAudio) AudioManager.stopListening();
      },
      onPageChanged: function(i){
        Home.markPageVisited(i);
      },
      onAfterRender: function(){
        ReaderFavorites.updateFavButton();
        ReaderBookmark.updateBookmarkButton();
        Home.updateProgressUI();
        saveState();
        ReaderTafsir.prefetchCurrentRuku();
      }
    });
  });

  safeInit('AudioManager', function(){
    AudioManager.init({
      PAGES: PAGES,
      state: state,
      els: els,
      goTo: ReaderManager.goToPage,
      showToast: UI.showToast,
      saveState: saveState
    });
  });

  // -----------------------------------------------------------------
  // Android/PWA hardware & gesture back button — the master listener.
  // Each open panel/modal (UI.js) and the reader screen (Home.js) push
  // one history entry per layer when opened; this unwinds exactly one
  // layer per back-press: topmost open panel/modal first, then reader ->
  // home, then (nothing left to pop) the platform's normal back/exit
  // behaviour takes over on the next press.
  // -----------------------------------------------------------------
  UI.setOnModalForceClosed(function(el){ Dialogs.clearPending(el); });
  // Every panel/modal open (UI.openPanel) and close (history.back(), e.g.
  // from Dialogs.submitGotoModal after "الذهاب إلى ركوع رقم") pushes/pops
  // a real history entry. By default the browser itself remembers the
  // page's scroll position at each entry and SILENTLY restores it on
  // popstate ("scroll anchoring for back/forward nav") — this fires
  // asynchronously as part of the same popstate that our own back-button
  // handling relies on, which means it can land *after* ReaderManager's
  // own scrollTop-reset code (even the double-rAF one) and snap the
  // reader back to wherever it was scrolled to before the modal opened.
  // That's the actual cause of "الذهاب إلى ركوع رقم يفتح الركوع الجديد
  // بس يفضل في نفس مكان السكرول القديم" — not any restore-scroll code of
  // ours (there isn't any), but the browser's own default behavior working
  // against it. Turning it off hands scroll position entirely to our own
  // JS, which is what every goToPage()/renderPage() reset already assumes.
  if('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({tag:'home'}, '');
  window.addEventListener('popstate', function(e){
    if(UI.closeTopmostOverlay()) return;
    var tag = e.state && e.state.tag;
    Home.maybeGoHomeOnPopstate(tag);
  });

  // -----------------------------------------------------------------
  // Home-screen header/about text
  // -----------------------------------------------------------------
  safeInit('Home-screen header/about text', function(){
    els.eyebrowText && (els.eyebrowText.textContent = JUZ_INFO.shortName);
    document.title = JUZ_INFO.fullMushaf ? JUZ_INFO.name : (JUZ_INFO.name + ' — بالركوعات');
    if (els.rukuCount) els.rukuCount.textContent = UI.toArabicDigits(PAGES.length) + ' ركوعًا';
    if (els.ayahCount) els.ayahCount.textContent = UI.toArabicDigits(JUZ_INFO.ayahCount) + ' آية';
    if (els.aboutText) els.aboutText.textContent = JUZ_INFO.fullMushaf
      ? 'يعتمد مصحف الركوع على علامات الركوع (ع)، وهي علامات تُقسِّم السور القرآنية إلى مقاطع متكاملة في المعنى، بحيث يمثِّل كل ركوع وحدة موضوعية مستقلة، مما يُيسِّر القراءة والتدبر، ويُعين على الوقوف عند تمام المعنى.'
      : 'يعتمد ' + JUZ_INFO.name + ' على علامات الركوع (ع)، وهي علامات تُقسِّم السور القرآنية إلى مقاطع متكاملة في المعنى، بحيث يمثِّل كل ركوع وحدة موضوعية مستقلة، مما يُيسِّر القراءة والتدبر، ويُعين على الوقوف عند تمام المعنى.';
  });
  // Set on its own, separately from the rest of the about text above, so
  // that even if toArabicDigits or something else in that block ever
  // throws, the version number — the one thing support requests always
  // need first — still gets shown.
  if (els.appVersionText) els.appVersionText.textContent = window.APP_VERSION || '?';

  // manifest.json is plain JSON and can't read version.js, so its
  // "version" field has to be kept in sync by hand. This just flags it
  // loudly in devtools if someone bumps one and forgets the other —
  // it's not shown to the user, only developers debugging a report.
  fetch('./manifest.json').then(function(r){ return r.json(); }).then(function(m){
    if (m && m.version && window.APP_VERSION && m.version !== window.APP_VERSION) {
      console.warn('نسخة manifest.json (' + m.version + ') لا تطابق version.js (' + window.APP_VERSION + ') — يجب تحديثهما معًا عند كل إصدار.');
    }
  }).catch(function(){ /* offline first load — not worth surfacing */ });

  // -----------------------------------------------------------------
  // Startup
  // -----------------------------------------------------------------
  safeInit('Settings.applyAll', function(){ Settings.applyAll(); });
  safeInit('Home.updateProgressUI', function(){ Home.updateProgressUI(); });
  safeInit('Home.updateBookmarkCard', function(){ Home.updateBookmarkCard(); });

  if('serviceWorker' in navigator){
    // Registering alone isn't enough for an *already-open* app to pick up
    // a new release automatically: sw.js already does skipWaiting() +
    // clients.claim() (see sw.js), so a new service worker does take
    // over, but the JS files already loaded and running in this tab stay
    // whatever version they were when the page opened — only a reload
    // actually swaps them for the new ones. This listener does that
    // reload automatically, once, the moment a new worker takes control.
    //
    // Only wired up for a RETURNING visitor (one who already had a
    // service worker controlling this tab) — on a brand-new visitor's
    // very first load there's no older version to update *from*, and
    // clients.claim() taking control of that first, previously
    // uncontrolled page also fires 'controllerchange'; without this
    // check every first-time visitor would get an unnecessary reload
    // moments after the page finished loading.
    var hadController = !!navigator.serviceWorker.controller;
    if(hadController){
      var swRefreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(swRefreshing) return;
        swRefreshing = true;
        window.location.reload();
      });
    }

    window.addEventListener('load', function(){
      // updateViaCache:'none' — makes the *browser's own HTTP cache* never
      // apply to fetches of sw.js (the default lets it apply in some
      // cases). This is separate from, and more reliable than, the
      // Cloudflare-only Cache-Control rule in _headers: that only protects
      // the deployed production site, so any environment served without
      // it (e.g. a plain local dev server with no cache headers at all)
      // could otherwise have the browser's update check served a stale,
      // HTTP-cached copy of sw.js indefinitely, with no update ever
      // detected no matter how many times CACHE inside it gets bumped.
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function(reg){
        if(!reg) return;
        // Proactively re-check for a newer sw.js right away and again
        // whenever the app comes back to the foreground, rather than
        // waiting on the browser's own update schedule (which can be
        // delayed, especially if a CDN in front of the site — see the
        // README's caching note — serves a cached sw.js response to that
        // check). This doesn't bypass CDN caching by itself, but it does
        // mean the update is picked up the moment the CDN's cache for
        // sw.js does expire, instead of only on some later, unrelated
        // browser-scheduled check.
        reg.update().catch(function(){});
        document.addEventListener('visibilitychange', function(){
          if(document.visibilityState === 'visible') reg.update().catch(function(){});
        });
      }).catch(function(){});
    });
  }
})();
