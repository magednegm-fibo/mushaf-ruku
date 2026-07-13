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
  SearchManager.init(PAGES);
  var JUZ_INFO = window.JUZ_INFO || {name: 'جزء عمّ', shortName: 'جزء عمّ', rukuCount: PAGES.length, ayahCount: 0};

  var state = loadState();

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
    tileWaqfGuide: document.getElementById('tileWaqfGuide'),

    surahPanel: document.getElementById('surahPanel'),
    surahList: document.getElementById('surahList'),
    btnCloseSurah: document.getElementById('btnCloseSurah'),

    juzPanel: document.getElementById('juzPanel'),
    juzList: document.getElementById('juzList'),
    btnCloseJuz: document.getElementById('btnCloseJuz'),
    juzOnlyRow: document.getElementById('juzOnlyRow'),
    juzOnlyToggle: document.getElementById('juzOnlyToggle'),

    searchPanel: document.getElementById('searchPanel'),
    searchInput: document.getElementById('searchInput'),
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
    longPressScopeSelect: document.getElementById('longPressScopeSelect'),
    recitationRepeatSelect: document.getElementById('recitationRepeatSelect'),
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
    aboutText: document.getElementById('aboutText')
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
  UI.init({els: els});

  Dialogs.init({els: els, UI: UI});

  Home.init({
    els: els, state: state, PAGES: PAGES, JUZ_INFO: JUZ_INFO, UI: UI,
    AudioManager: AudioManager, ReaderManager: ReaderManager,
    ReaderBookmark: ReaderBookmark
  });

  ReaderFavorites.init({
    els: els, state: state, PAGES: PAGES, UI: UI, Dialogs: Dialogs,
    openReaderAt: Home.openReaderAt
  });

  ReaderBookmark.init({
    els: els, state: state, PAGES: PAGES, UI: UI,
    openReaderAt: Home.openReaderAt
  });

  ReaderReminders.init({
    els: els, state: state, UI: UI, AudioManager: AudioManager,
    currentWaqfVisibilityKey: function(){ return Settings.currentWaqfVisibilityKey(); }
  });

  ReaderGuide.init({els: els, UI: UI});

  ReaderTafsir.init({els: els, state: state, PAGES: PAGES, UI: UI, ReaderManager: ReaderManager});

  Settings.init({
    els: els, state: state, UI: UI, PAGES: PAGES,
    AudioManager: AudioManager, ReaderManager: ReaderManager,
    ReaderBookmark: ReaderBookmark, ReaderReminders: ReaderReminders,
    Home: Home, saveState: saveState
  });

  Navigation.init({
    els: els, state: state, PAGES: PAGES, JUZ_INFO: JUZ_INFO, UI: UI,
    Dialogs: Dialogs, Home: Home, Settings: Settings,
    AudioManager: AudioManager, ReaderManager: ReaderManager,
    saveState: saveState
  });

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

  AudioManager.init({
    PAGES: PAGES,
    state: state,
    els: els,
    goTo: ReaderManager.goToPage,
    showToast: UI.showToast,
    saveState: saveState
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
  history.replaceState({tag:'home'}, '');
  window.addEventListener('popstate', function(e){
    if(UI.closeTopmostOverlay()) return;
    var tag = e.state && e.state.tag;
    Home.maybeGoHomeOnPopstate(tag);
  });

  // -----------------------------------------------------------------
  // Home-screen header/about text
  // -----------------------------------------------------------------
  els.eyebrowText && (els.eyebrowText.textContent = JUZ_INFO.shortName);
  document.title = JUZ_INFO.fullMushaf ? JUZ_INFO.name : (JUZ_INFO.name + ' — بالركوعات');
  if (els.rukuCount) els.rukuCount.textContent = UI.toArabicDigits(PAGES.length) + ' ركوعًا';
  if (els.ayahCount) els.ayahCount.textContent = UI.toArabicDigits(JUZ_INFO.ayahCount) + ' آية';
  if (els.aboutText) els.aboutText.textContent = JUZ_INFO.fullMushaf
    ? 'كل صفحة في هذا التطبيق تمثّل ركوعًا واحدًا كاملًا كما تحدّده علامات الركوع (ع) في المصحف الشريف، من الفاتحة إلى الناس (٥٥٦ ركوعًا). بداية كل جزء من الأجزاء الثلاثين مُشار إليها داخل النص. النص من مصحف حفص عن عاصم برواية Tanzil / QPC.'
    : 'كل صفحة في هذا التطبيق تمثّل ركوعًا واحدًا كاملًا كما تحدّده علامات الركوع (ع) في المصحف الشريف، ضمن ' + JUZ_INFO.name + '. النص من مصحف حفص عن عاصم برواية Tanzil / QPC.';

  // -----------------------------------------------------------------
  // Startup
  // -----------------------------------------------------------------
  Settings.applyAll();
  Home.updateProgressUI();
  Home.updateBookmarkCard();

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
      navigator.serviceWorker.register('sw.js').then(function(reg){
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
