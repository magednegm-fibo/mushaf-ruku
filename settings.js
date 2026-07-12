// Settings: everything under الإعدادات — font size, font/script style
// (Uthmani vs Indopak), night mode, the waqf-marks visibility toggle,
// pinch-zoom enable flag, keep-screen-awake (Wake Lock), reset progress,
// and reminder-marks export/import (the file-picker wiring; the actual
// data work is ReaderReminders').
// Loaded before app.js (see index.html). Call Settings.init(deps) once;
// deps: els, state, UI, PAGES, AudioManager, ReaderManager,
//       ReaderBookmark, ReaderReminders, Home, saveState
// Exposed as window.Settings.
(function(){
  'use strict';

  var els, state, UI, PAGES, AudioManager, ReaderManager, ReaderBookmark, ReaderReminders, Home, saveState;

  // -----------------------------------------------------------------
  // Font size — stored independently per script mode (Uthmani vs
  // Indopak), since the two scripts read comfortably at different sizes.
  // This key picks which stored size applies to whatever script is on
  // screen right now, so the +/-، pinch-zoom، and settings label all
  // always agree.
  // -----------------------------------------------------------------
  function currentFontSizeKey(){
    return state.fontStyle === 'uthmani' ? 'fontSizeUthmani' : 'fontSizeIndopak';
  }
  function applyFontSize(){
    var size = state[currentFontSizeKey()];
    document.documentElement.style.setProperty('--ayah-size', size + 'px');
    els.fontSizeLabel.textContent = size;
  }

  // -----------------------------------------------------------------
  // Font/script style (Uthmani/Madinah vs Indopak/Naskh Ta'liq)
  // -----------------------------------------------------------------
  function applyFontStyle(){
    // Switching script rebuilds the ayah HTML via renderPage() below,
    // which would wipe out the "ayah-playing" highlight span; simplest
    // and safest is to stop playback rather than try to re-anchor it
    // after rebuild.
    AudioManager.stopListening();
    var family = state.fontStyle === 'uthmani'
      ? "'Uthmanic Hafs', 'Amiri Quran', 'Noto Naskh Arabic', serif"
      : "'PDMS Saleem QuranFont', 'Amiri Quran', 'Noto Naskh Arabic', serif";
    document.documentElement.style.setProperty('--font-quran', family);
    document.body.classList.toggle('uthmani-font', state.fontStyle === 'uthmani');
    document.body.classList.toggle('indopak-font', state.fontStyle !== 'uthmani');
    if(els.btnFontAmiri) els.btnFontAmiri.classList.toggle('active', state.fontStyle !== 'uthmani');
    if(els.btnFontUthmani) els.btnFontUthmani.classList.toggle('active', state.fontStyle === 'uthmani');
    // Reminder marks are stored per script mode, so switching mode must
    // reload the in-memory map before re-rendering — otherwise the
    // previous mode's marks would keep showing on the new one.
    ReaderReminders.reloadWaqfMarksForCurrentStyle();
    // Each script mode has its own independent font size — re-apply it
    // now so the page and the settings-panel label switch over to
    // whichever size was last set for this mode, instead of keeping the
    // other mode's.
    applyFontSize();
    // Whether marks are shown is also independent per script mode —
    // refresh the toggle switch and the hide/show class to match this
    // mode's value.
    applyWaqfVisibility();
    // Reading progress (percentage / reached count) is shared between
    // both script modes, but re-rendered here anyway since the settings
    // panel/home screen may currently be visible.
    Home.updateProgressUI();
    // The saved reading bookmark is shared between both scripts now, but
    // still needs a refresh here since its button/card reflect state.page.
    ReaderBookmark.updateBookmarkButton();
    Home.updateBookmarkCard();
    if(typeof ReaderManager !== 'undefined' && PAGES[state.page]) ReaderManager.renderPage();
  }

  // -----------------------------------------------------------------
  // Night mode
  // -----------------------------------------------------------------
  function applyNight(){
    document.body.classList.toggle('night', !!state.night);
    els.nightToggle.checked = !!state.night;
  }

  // -----------------------------------------------------------------
  // Waqf-marks visibility — remembered independently per script mode
  // too, matching how the marks themselves are already stored per mode
  // (see StorageManager.loadReminder/saveReminder) — hiding marks in one
  // script shouldn't hide them in the other.
  // -----------------------------------------------------------------
  function currentWaqfVisibilityKey(){
    return state.fontStyle === 'uthmani' ? 'showWaqfMarksUthmani' : 'showWaqfMarksIndopak';
  }
  function applyWaqfVisibility(){
    document.body.classList.toggle('hide-waqf-marks', state[currentWaqfVisibilityKey()] === false);
    if(els.waqfToggle) els.waqfToggle.checked = state[currentWaqfVisibilityKey()] !== false;
  }

  // -----------------------------------------------------------------
  // إبقاء الشاشة مضاءة (Screen Wake Lock)
  // -----------------------------------------------------------------
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
      // The OS/browser releases the lock on its own if the page is
      // hidden (e.g. switching apps); listen so it's re-acquired
      // automatically when the reader comes back, without needing to
      // retoggle the setting.
      wakeLockSentinel.addEventListener('release', function(){ wakeLockSentinel = null; });
    }).catch(function(){
      // Can fail for reasons outside our control (low battery mode, some
      // in-app browsers, etc.) — fail silently rather than nag the reader.
    });
  }

  // -----------------------------------------------------------------
  // Reminder-marks export/import (file-picker wiring only — the data
  // work is ReaderReminders.exportMarks()/ReaderReminders.importMarksFromFile()).
  // -----------------------------------------------------------------
  function wireExportImport(){
    els.btnExportWaqf && els.btnExportWaqf.addEventListener('click', function(){
      ReaderReminders.exportMarks();
    });
    els.importWaqfInput && els.importWaqfInput.addEventListener('change', function(){
      var file = els.importWaqfInput.files && els.importWaqfInput.files[0];
      if(!file) return;
      ReaderReminders.importMarksFromFile(file, function(ok){
        if(ok) ReaderManager.renderPage(); // refresh the currently open page so imported marks show immediately
        els.importWaqfInput.value = '';
      });
    });
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    UI = deps.UI;
    PAGES = deps.PAGES;
    AudioManager = deps.AudioManager;
    ReaderManager = deps.ReaderManager;
    ReaderBookmark = deps.ReaderBookmark;
    ReaderReminders = deps.ReaderReminders;
    Home = deps.Home;
    saveState = deps.saveState;

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

    if(els.btnFontAmiri) els.btnFontAmiri.addEventListener('click', function(){
      state.fontStyle = 'amiri'; applyFontStyle(); saveState();
    });
    if(els.btnFontUthmani) els.btnFontUthmani.addEventListener('click', function(){
      state.fontStyle = 'uthmani'; applyFontStyle(); saveState();
    });

    els.nightToggle.addEventListener('change', function(){
      state.night = els.nightToggle.checked;
      applyNight(); saveState();
    });

    els.waqfToggle && els.waqfToggle.addEventListener('change', function(){
      state[currentWaqfVisibilityKey()] = els.waqfToggle.checked;
      applyWaqfVisibility(); saveState();
    });

    els.btnClearAllReminders && els.btnClearAllReminders.addEventListener('click', function(){
      var scriptName = state.fontStyle === 'uthmani' ? 'مصحف المدينة' : 'مصحف النسخ';
      var message = 'سيتم حذف جميع علامات التذكير في ' + scriptName + '، ولا يمكن التراجع عن هذا الإجراء.';
      Dialogs.openClearRemindersModal(function(){
        ReaderReminders.clearAllMarks();
        UI.showToast('تم حذف علامات التذكير في ' + scriptName);
      }, message);
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
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible') requestWakeLock();
    });
    if(els.wakeLockToggle && !WAKE_LOCK_SUPPORTED){
      // Feature isn't available in this browser/WebView — disable the
      // control instead of offering a setting that silently does nothing.
      els.wakeLockToggle.disabled = true;
      if(els.wakeLockRow) els.wakeLockRow.title = 'غير مدعوم في هذا المتصفح';
    }

    els.btnResetProgress.addEventListener('click', function(){
      Home.resetProgress();
      saveState();
    });

    wireExportImport();

    els.btnSettings.addEventListener('click', function(){ UI.openPanel(els.settingsPanel); });
    els.btnCloseSettings.addEventListener('click', function(){ UI.closePanel(els.settingsPanel); });
    els.tileSettings.addEventListener('click', function(){ UI.openPanel(els.settingsPanel); });
    UI.registerOverlayPanels([els.settingsPanel].filter(Boolean));
  }

  // Applies every visual setting to the DOM — called once at startup,
  // after all the individual apply* functions above are defined, so
  // app.js doesn't need to know the order they depend on each other in.
  function applyAll(){
    applyFontSize();
    applyFontStyle();
    applyNight();
    applyWaqfVisibility();
    if(els.pinchZoomToggle) els.pinchZoomToggle.checked = state.pinchZoomEnabled !== false;
    if(els.wakeLockToggle){
      els.wakeLockToggle.checked = !!state.keepScreenAwake && WAKE_LOCK_SUPPORTED;
      requestWakeLock();
    }
  }

  window.Settings = {
    init: init,
    applyAll: applyAll,
    currentFontSizeKey: currentFontSizeKey,
    currentWaqfVisibilityKey: currentWaqfVisibilityKey,
    applyFontSize: applyFontSize
  };
})();
