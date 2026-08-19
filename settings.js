// Settings: everything under الإعدادات — font size, font/script style
// (Uthmani vs Indopak), night mode, the waqf-marks visibility toggle,
// pinch-zoom enable flag, keep-screen-awake (Wake Lock), reset progress,
// and full backup/restore (file-picker wiring; payload work is StorageManager).
// Loaded before app.js (see index.html). Call Settings.init(deps) once;
// deps: els, state, UI, PAGES, AudioManager, ReaderManager,
//       ReaderBookmark, ReaderReminders, ReaderFavorites, Home, saveState
// Exposed as window.Settings.
(function(){
  'use strict';

  var els, state, UI, PAGES, AudioManager, ReaderManager, ReaderBookmark, ReaderReminders, ReaderFavorites, Home, saveState;

  // -----------------------------------------------------------------
  // Font size — shared across both script modes (Uthmani + Indopak).
  // Both storage keys are kept in sync for backup compatibility with
  // older per-mode payloads; the canonical read key is fontSizeUthmani.
  // -----------------------------------------------------------------
  function currentFontSizeKey(){
    return 'fontSizeUthmani';
  }
  function setSharedFontSize(size){
    state.fontSizeUthmani = size;
    state.fontSizeIndopak = size;
  }
  // opts.skipQcfFit: when true, only updates --ayah-size / label — used by
  // rehydrate so we never schedule QCF measurement against a stale DOM.
  function applyFontSize(opts){
    opts = opts || {};
    // Keep the pair in sync in case an older backup left them different.
    if(state.fontSizeIndopak !== state.fontSizeUthmani){
      state.fontSizeIndopak = state.fontSizeUthmani;
    }
    var size = state.fontSizeUthmani;
    document.documentElement.style.setProperty('--ayah-size', size + 'px');
    if(els.fontSizeLabel) els.fontSizeLabel.textContent = size;
    if(opts.skipQcfFit) return;
    // بعد تغيير الحجم: انتظر استقرار الـ layout ثم أعد قياس كلمات QCF
    // (عروض .qcf-real-text و scale) — وإلا تبقى قيم البكسل القديمة وتختل
    // محاذاة أول/آخر السطر. scheduleFitAllGlyphs يدمج أحداث الـ pinch
    // في قياس واحد (double-rAF + coalesce) ثم يستدعي scheduleResolveAll
    // للعلامات على الأبعاد النهائية. إن لم يكن QCF محمّلاً نكتفي بالعلامات.
    if(window.QCFOverride && typeof window.QCFOverride.scheduleFitAllGlyphs === 'function'){
      window.QCFOverride.scheduleFitAllGlyphs();
    } else if(window.MarkPlacementEngine && els.ayahFlow){
      window.MarkPlacementEngine.scheduleResolveAll(els.ayahFlow);
    }
  }

  // Exact @font-face family names from style.css (must stay in sync).
  function currentQuranFontFamilyName(){
    return state.fontStyle === 'uthmani' ? 'Uthmanic Hafs' : 'PDMS Saleem QuranFont';
  }

  // Font/script chrome only — no renderPage, no Home/Fav/Bookmark UI.
  // opts.skipQcfFit: pass through to applyFontSize for rehydrate path.
  function applyFontChrome(opts){
    opts = opts || {};
    var family = state.fontStyle === 'uthmani'
      ? "'Uthmanic Hafs', 'Amiri Quran', 'Noto Naskh Arabic', serif"
      : "'PDMS Saleem QuranFont', 'Amiri Quran', 'Noto Naskh Arabic', serif";
    document.documentElement.style.setProperty('--font-quran', family);
    document.body.classList.toggle('uthmani-font', state.fontStyle === 'uthmani');
    document.body.classList.toggle('indopak-font', state.fontStyle !== 'uthmani');
    if(els.btnFontAmiri) els.btnFontAmiri.classList.toggle('active', state.fontStyle !== 'uthmani');
    if(els.btnFontUthmani) els.btnFontUthmani.classList.toggle('active', state.fontStyle === 'uthmani');
    // Reminder marks are stored per script mode — swap in-memory map
    // before any subsequent render uses getWaqfMarks().
    if(ReaderReminders && typeof ReaderReminders.reloadWaqfMarksForCurrentStyle === 'function'){
      ReaderReminders.reloadWaqfMarksForCurrentStyle();
    }
    applyFontSize({ skipQcfFit: !!opts.skipQcfFit });
    applyWaqfVisibility();
    applyKhilafHighlightVisibility();
  }

  // -----------------------------------------------------------------
  // Font/script style (Uthmani/Madinah vs Indopak/Naskh Ta'liq)
  // Manual toggle path only — not used by Restore / Factory Reset.
  // -----------------------------------------------------------------
  function applyFontStyle(){
    // Switching script rebuilds the ayah HTML via renderPage() below,
    // which would wipe out the "ayah-playing" highlight span; simplest
    // and safest is to stop playback rather than try to re-anchor it
    // after rebuild.
    if(AudioManager && typeof AudioManager.stopListening === 'function'){
      AudioManager.stopListening();
    }
    applyFontChrome();
    // Home/bookmark chrome still refreshed on manual switch (pre-existing).
    if(Home && typeof Home.updateProgressUI === 'function') Home.updateProgressUI();
    if(ReaderBookmark && typeof ReaderBookmark.updateBookmarkButton === 'function'){
      ReaderBookmark.updateBookmarkButton();
    }
    if(Home && typeof Home.updateBookmarkCard === 'function') Home.updateBookmarkCard();
    if(typeof ReaderManager !== 'undefined' && PAGES[state.page]) ReaderManager.renderPage();
  }

  // Wait for the active mushaf face (exact @font-face name) before the
  // single rehydrate render. Timeout is a safety net only — not proof the
  // font is ready. No Font Loading API → resolve immediately.
  var FONT_LOAD_TIMEOUT_MS = 1000;
  function waitForCurrentQuranFont(){
    var familyName = currentQuranFontFamilyName();
    if(typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function'){
      return Promise.resolve({ family: familyName, loaded: false, reason: 'no-api' });
    }
    return new Promise(function(resolve){
      var settled = false;
      function finish(info){
        if(settled) return;
        settled = true;
        resolve(info);
      }
      var timer = setTimeout(function(){
        finish({ family: familyName, loaded: false, reason: 'timeout' });
      }, FONT_LOAD_TIMEOUT_MS);
      document.fonts.load('1em "' + familyName + '"').then(function(){
        clearTimeout(timer);
        finish({ family: familyName, loaded: true, reason: 'loaded' });
      }).catch(function(){
        clearTimeout(timer);
        finish({ family: familyName, loaded: false, reason: 'error' });
      });
    });
  }

  // -----------------------------------------------------------------
  // Night mode
  // -----------------------------------------------------------------
  function applyNight(){
    document.body.classList.toggle('night', !!state.night);
    els.nightToggle.checked = !!state.night;
  }

  // -----------------------------------------------------------------
  // Waqf-marks visibility — shared across both script modes. Both storage
  // keys stay in sync (backup-compatible with older per-mode payloads).
  // Reminder *data* remains per-script; only the show/hide toggle is shared.
  // -----------------------------------------------------------------
  function currentWaqfVisibilityKey(){
    return 'showWaqfMarksUthmani';
  }
  function setSharedWaqfVisibility(show){
    state.showWaqfMarksUthmani = !!show;
    state.showWaqfMarksIndopak = !!show;
  }
  // "إظهار علامات التذكير" — يخفي/يظهر معًا:
  //   • علامات التذكير الشخصية (نجمة فوق الكلمة)
  //   • تلوين نص الكلمات لعلامات الوقف السجاوندي الافتراضية (طلب مباشر
  //     2026-07-31 — لم تعد نجمة، بل تلوين مباشر لنص الكلمة نفسها)
  //   • تلوين مواضع الخلاف مع روضة الحفاظ (البنفسجي) — طلب مباشر 2026-08-13:
  //     كان البنفسجي دائمًا؛ أصبح مربوطًا بنفس المفتاح.
  // (عبر body.hide-waqf-marks + body.show-khilaf-highlight في style.css).
  function applyWaqfVisibility(){
    // Keep the pair in sync in case an older backup left them different.
    if(state.showWaqfMarksIndopak !== state.showWaqfMarksUthmani){
      state.showWaqfMarksIndopak = state.showWaqfMarksUthmani;
    }
    var show = state.showWaqfMarksUthmani !== false;
    document.body.classList.toggle('hide-waqf-marks', !show);
    if(els.waqfToggle) els.waqfToggle.checked = show;
    applyKhilafHighlightVisibility();
  }

  // -----------------------------------------------------------------
  // مواضع خلاف قصر المنفصل (بنفسجي) — مربوطة بمفتاح "علامات تذكير الوقف"
  // (طلب مباشر 2026-08-13: تظهر فقط عند تفعيل الإعداد).
  // -----------------------------------------------------------------
  function applyKhilafHighlightVisibility(){
    var show = state[currentWaqfVisibilityKey()] !== false;
    document.body.classList.toggle('show-khilaf-highlight', show);
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
  // Full backup / restore (settings + favorites + bookmark + reminders).
  // File I/O wiring here; payload build/validate/apply live in StorageManager.
  // -----------------------------------------------------------------
  // Unique download name so repeated backups don't overwrite each other
  // in the browser Downloads folder. Browser still owns the save UI.
  function makeBackupFilename(){
    var d = new Date();
    function pad(n){ return (n < 10 ? '0' : '') + n; }
    return 'Mushaf_Al-Ruku_Backup_' +
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' +
      pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds()) +
      '.json';
  }

  function downloadBackupJson(payload, filename){
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  }

  // Sync non-font settings controls from state (night, pinch, wake, audio).
  // Used by rehydrate — not a full applyAll (no render / no applyFontStyle).
  function applyNonFontSettingsUI(){
    applyNight();
    if(els.pinchZoomToggle) els.pinchZoomToggle.checked = state.pinchZoomEnabled !== false;
    if(els.wakeLockToggle){
      els.wakeLockToggle.checked = !!state.keepScreenAwake && WAKE_LOCK_SUPPORTED;
      if(typeof requestWakeLock === 'function') requestWakeLock();
    }
    if(els.reciterSelect && state.reciter) els.reciterSelect.value = state.reciter;
    if(els.autoScrollToggle) els.autoScrollToggle.checked = state.autoScrollEnabled !== false;
    if(els.recitationScopeSelect && state.recitationScope) els.recitationScopeSelect.value = state.recitationScope;
    if(els.playbackSpeedSelect) els.playbackSpeedSelect.value = String(state.playbackRate || 1);
    if(els.recitationRepeatSelect && state.recitationRepeatCount != null){
      els.recitationRepeatSelect.value = String(state.recitationRepeatCount);
    }
    if(els.rukuRepeatSelect && state.rukuRepeatCount != null){
      els.rukuRepeatSelect.value = String(state.rukuRepeatCount);
    }
    if(els.displayScopeSelect && state.displayScope) els.displayScopeSelect.value = state.displayScope;
    if(els.tafsirSelect){
      var tv = state.selectedTafsir || 'mukhtasar';
      if(tv !== 'mukhtasar' && tv !== 'aysar') tv = 'mukhtasar';
      els.tafsirSelect.value = tv;
    }
  }

  function finalUISyncAfterRehydrate(){
    if(Home && typeof Home.updateProgressUI === 'function') Home.updateProgressUI();
    if(Home && typeof Home.updateBookmarkCard === 'function') Home.updateBookmarkCard();
    if(ReaderFavorites && typeof ReaderFavorites.updateFavButton === 'function'){
      ReaderFavorites.updateFavButton();
    }
    if(ReaderBookmark && typeof ReaderBookmark.updateBookmarkButton === 'function'){
      ReaderBookmark.updateBookmarkButton();
    }
  }

  // Restore / Factory Reset only. Single render after font readiness.
  // Does NOT call applyAll() or applyFontStyle(). No location.reload().
  function rehydrateFromStorage(){
    var loaded = StorageManager.loadSettings();
    Object.keys(loaded).forEach(function(k){ state[k] = loaded[k]; });

    if(ReaderFavorites && typeof ReaderFavorites.reloadFromStorage === 'function'){
      ReaderFavorites.reloadFromStorage();
    }
    if(ReaderBookmark && typeof ReaderBookmark.reloadFromStorage === 'function'){
      ReaderBookmark.reloadFromStorage();
    }
    if(ReaderReminders && typeof ReaderReminders.reloadWaqfMarksForCurrentStyle === 'function'){
      ReaderReminders.reloadWaqfMarksForCurrentStyle();
    }

    // Font chrome without measuring the previous page's QCF glyphs.
    applyFontChrome({ skipQcfFit: true });
    applyNonFontSettingsUI();

    return waitForCurrentQuranFont().then(function(){
      if(ReaderManager && typeof ReaderManager.renderPage === 'function' && PAGES[state.page]){
        ReaderManager.renderPage();
      }
      finalUISyncAfterRehydrate();
    });
  }

  function wireExportImport(){
    els.btnExportWaqf && els.btnExportWaqf.addEventListener('click', function(){
      try{
        var payload = StorageManager.buildFullBackup();
        var filename = makeBackupFilename();
        downloadBackupJson(payload, filename);
        UI.showToast('تم الحفظ في مجلد التنزيلات');
      }catch(e){
        UI.showToast('تعذّر إنشاء النسخة الاحتياطية');
      }
    });
    els.importWaqfInput && els.importWaqfInput.addEventListener('change', function(){
      var file = els.importWaqfInput.files && els.importWaqfInput.files[0];
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        try{
          var data = JSON.parse(reader.result);
          // End any live playback session before applying restored user
          // state — same rule as Factory Reset. Does not auto-start the
          // restored reciter; playback ends stopped.
          if(AudioManager && typeof AudioManager.stopListening === 'function'){
            AudioManager.stopListening();
          }
          var result = StorageManager.applyBackupPayload(data);
          if(!result.ok){
            UI.showToast('ملف غير صالح');
          }else{
            rehydrateFromStorage().then(function(){
              UI.showToast('تم استعادة النسخة الاحتياطية');
            }).catch(function(){
              UI.showToast('تعذّرت استعادة النسخة الاحتياطية');
            });
          }
        }catch(err){
          UI.showToast('ملف غير صالح');
        }
        els.importWaqfInput.value = '';
      };
      reader.onerror = function(){
        UI.showToast('ملف غير صالح');
        els.importWaqfInput.value = '';
      };
      reader.readAsText(file);
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
    ReaderFavorites = deps.ReaderFavorites;
    Home = deps.Home;
    saveState = deps.saveState;

    els.fontMinus.addEventListener('click', function(){
      setSharedFontSize(Math.max(18, (state.fontSizeUthmani || 28) - 2));
      applyFontSize(); saveState();
      UI.haptic && UI.haptic();
    });
    els.fontPlus.addEventListener('click', function(){
      setSharedFontSize(Math.min(44, (state.fontSizeUthmani || 28) + 2));
      applyFontSize(); saveState();
      UI.haptic && UI.haptic();
    });

    if(els.btnFontAmiri) els.btnFontAmiri.addEventListener('click', function(){
      state.fontStyle = 'amiri'; applyFontStyle(); saveState();
      UI.haptic && UI.haptic();
    });
    if(els.btnFontUthmani) els.btnFontUthmani.addEventListener('click', function(){
      state.fontStyle = 'uthmani'; applyFontStyle(); saveState();
      UI.haptic && UI.haptic();
    });

    els.nightToggle.addEventListener('change', function(){
      state.night = els.nightToggle.checked;
      applyNight(); saveState();
      UI.haptic && UI.haptic();
    });

    els.waqfToggle && els.waqfToggle.addEventListener('change', function(){
      setSharedWaqfVisibility(els.waqfToggle.checked);
      applyWaqfVisibility(); saveState();
      UI.haptic && UI.haptic();
    });

    
    els.btnFactoryReset && els.btnFactoryReset.addEventListener('click', function(){
      Dialogs.openClearRemindersModal(function(){
        // Factory Reset must clear live audio runtime before storage
        // defaults + rehydrate — otherwise UI shows default reciter while
        // the previous reciter's session keeps playing. Public API only;
        // does not auto-start the default reciter. Restore path untouched.
        if(AudioManager && typeof AudioManager.stopListening === 'function'){
          AudioManager.stopListening();
        }
        var result = StorageManager.factoryReset();
        if(!result.ok){
          UI.showToast('تعذّر إعادة الضبط');
          return;
        }
        rehydrateFromStorage().then(function(){
          UI.showToast('تمت إعادة ضبط التطبيق');
        }).catch(function(){
          UI.showToast('تعذّرت إعادة ضبط التطبيق');
        });
      });
    });

    els.pinchZoomToggle && els.pinchZoomToggle.addEventListener('change', function(){
      state.pinchZoomEnabled = els.pinchZoomToggle.checked;
      saveState();
      UI.haptic && UI.haptic();
    });

    if(els.tafsirSelect){
      els.tafsirSelect.addEventListener('change', function(){
        var val = els.tafsirSelect.value;
        if(val !== 'mukhtasar' && val !== 'aysar') val = 'mukhtasar';
        state.selectedTafsir = val;
        saveState();
        UI.haptic && UI.haptic();
        // Notify ReaderTafsir so it can stop TTS, update labels, and isolate state.
        if(typeof ReaderTafsir !== 'undefined' && ReaderTafsir.onTafsirChanged){
          ReaderTafsir.onTafsirChanged(val);
        }
      });
    }

    els.wakeLockToggle && els.wakeLockToggle.addEventListener('change', function(){
      state.keepScreenAwake = els.wakeLockToggle.checked;
      saveState();
      if(state.keepScreenAwake) requestWakeLock();
      else releaseWakeLock();
      UI.haptic && UI.haptic();
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
    applyKhilafHighlightVisibility();
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
    applyFontSize: applyFontSize,
    applyFontChrome: applyFontChrome,
    rehydrateFromStorage: rehydrateFromStorage,
    waitForCurrentQuranFont: waitForCurrentQuranFont,
    currentQuranFontFamilyName: currentQuranFontFamilyName
  };
})();
