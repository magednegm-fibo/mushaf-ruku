// Dialogs: the two small modal forms in this app — "save to favorites"
// (favModal) and "go to ruku number" (gotoModal). Both are generic dialog
// shells: they know nothing about favorites or page navigation themselves,
// they just collect input and hand it back via a one-shot callback to
// whichever module opened them (ReaderFavorites for favModal, Navigation
// for gotoModal). This keeps the actual favorites/navigation logic in the
// modules that own that data, and keeps this file purely about the modal
// UI mechanics (open, validate, submit, cancel).
// Loaded before app.js (see index.html). Call Dialogs.init(deps) once;
// deps: els, UI (openPanel/closePanel/toArabicDigits/fromArabicDigits).
// Exposed as window.Dialogs.
(function(){
  'use strict';

  var els, UI;

  // -----------------------------------------------------------------
  // Favorite-name modal — "احفظ في المفضلة" with an optional label input.
  // -----------------------------------------------------------------
  var favOnSave = null; // set by openFavModal(), cleared after use or on cancel
  function openFavModal(onSave){
    if(!els.favModal) return;
    favOnSave = onSave;
    els.favNameInput.value = '';
    UI.openPanel(els.favModal);
    setTimeout(function(){ els.favNameInput.focus(); }, 150);
  }
  function closeFavModal(){
    UI.closePanel(els.favModal);
    favOnSave = null;
  }
  function submitFavModal(){
    if(!favOnSave) return;
    var label = els.favNameInput.value.trim();
    var cb = favOnSave;
    favOnSave = null;
    UI.closePanel(els.favModal);
    cb(label);
  }

  // -----------------------------------------------------------------
  // "الذهاب إلى ركوع رقم" modal — a single validated number input.
  // -----------------------------------------------------------------
  var gotoOnGo = null;
  var gotoMax = 0;
  function openGotoModal(currentPage1Based, maxPage, onGo){
    if(!els.gotoModal) return;
    gotoOnGo = onGo;
    gotoMax = maxPage;
    els.gotoError.textContent = '';
    els.gotoInput.value = UI.toArabicDigits(currentPage1Based);
    UI.openPanel(els.gotoModal);
    setTimeout(function(){ els.gotoInput.focus(); els.gotoInput.select(); }, 150);
  }
  function closeGotoModal(){
    UI.closePanel(els.gotoModal);
    gotoOnGo = null;
  }
  function submitGotoModal(){
    if(!gotoOnGo) return;
    var raw = UI.fromArabicDigits(els.gotoInput.value.trim());
    var n = parseInt(raw, 10);
    if(!raw || isNaN(n) || n < 1 || n > gotoMax){
      els.gotoError.textContent = 'رقم غير صحيح، اكتب رقمًا من ١ إلى ' + UI.toArabicDigits(gotoMax);
      return;
    }
    var cb = gotoOnGo;
    gotoOnGo = null;
    // Explicitly drop focus (and dismiss the on-screen keyboard) BEFORE
    // navigating, not after. gotoInput is auto-focused when this modal
    // opens (see openGotoModal), so on Android the keyboard is usually
    // still open at the moment "اذهب" is tapped. If we navigate first and
    // let the keyboard close afterwards, the keyboard-close viewport
    // resize lands after ReaderManager has already reset the new page's
    // scroll to the top, and the resize then nudges it back down again —
    // matches the reported symptom (new ruku opens but isn't scrolled to
    // its beginning). Blurring first means that resize happens before
    // goToPage()/renderPage() run their own scroll reset.
    if(els.gotoInput) els.gotoInput.blur();
    UI.closePanel(els.gotoModal);
    cb(n);
  }

  // -----------------------------------------------------------------
  // "حذف جميع علامات التذكير" confirm modal — a plain Cancel/Delete
  // confirmation, same one-shot-callback shape as the modals above.
  //
  // Unlike favModal/gotoModal (always opened directly over the reader or
  // home screen), this one opens ON TOP of an already-open panel
  // (settingsPanel) — so it can't reuse UI.closePanel() as-is. closePanel
  // hides the element immediately and *then* calls history.back(); by the
  // time the resulting popstate reaches UI.closeTopmostOverlay(), this
  // modal already reads as "closed", so closeTopmostOverlay falls through
  // and closes the next open overlay underneath it instead — settingsPanel
  // — which is exactly the "Cancel sends me to the home screen" bug.
  // Fix: trigger history.back() WITHOUT hiding first, so the modal is
  // still the topmost *open* overlay when closeTopmostOverlay runs, and
  // it (correctly) hides only this modal and stops.
  // -----------------------------------------------------------------
  var clearRemindersOnConfirm = null;
  function openClearRemindersModal(onConfirm, message){
    if(!els.clearRemindersModal) return;
    clearRemindersOnConfirm = onConfirm;
    if(els.clearRemindersModalText && message) els.clearRemindersModalText.textContent = message;
    UI.openPanel(els.clearRemindersModal);
    // Default focus on "إلغاء" (Cancel), not "حذف" (Delete) — a
    // destructive action should never be the one-tap default.
    setTimeout(function(){
      if(els.clearRemindersModalCancel) els.clearRemindersModalCancel.focus();
    }, 150);
  }
  function backOutOfClearRemindersModal(){
    if(els.clearRemindersModal.classList.contains('hidden')) return;
    if(history.state && history.state.tag === 'panel'){
      history.back(); // popstate -> UI.closeTopmostOverlay() hides just this modal
    } else {
      els.clearRemindersModal.classList.add('hidden');
    }
  }
  function closeClearRemindersModal(){
    clearRemindersOnConfirm = null;
    backOutOfClearRemindersModal();
  }
  function confirmClearRemindersModal(){
    if(!clearRemindersOnConfirm) return;
    var cb = clearRemindersOnConfirm;
    clearRemindersOnConfirm = null;
    backOutOfClearRemindersModal();
    cb();
  }

  // -----------------------------------------------------------------
  // "الانتقال إلى آية" modal — opened from a small icon on each فهرس
  // السور row. Same one-shot-callback shape as the modals above, but its
  // close/cancel logic follows clearRemindersModal's pattern (not
  // gotoModal's plain UI.closePanel) because this one ALSO always opens
  // ON TOP of an already-open panel (surahPanel) rather than directly
  // over the reader/home screen — same "Cancel sends me to the home
  // screen" bug shape described above, same fix: back out of just this
  // modal via history.back() without hiding it first, so
  // closeTopmostOverlay finds THIS modal (still marked open) instead of
  // falling through to surahPanel underneath it.
  // -----------------------------------------------------------------
  var ayahJumpOnGo = null;
  var ayahJumpMax = 0;
  function openAyahJumpModal(surahName, maxAyah, onGo){
    if(!els.ayahJumpModal) return;
    ayahJumpOnGo = onGo;
    ayahJumpMax = maxAyah;
    els.ayahJumpError.textContent = '';
    if(els.ayahJumpSurahName) els.ayahJumpSurahName.textContent = surahName;
    els.ayahJumpInput.value = '';
    UI.openPanel(els.ayahJumpModal);
    setTimeout(function(){ els.ayahJumpInput.focus(); }, 150);
  }
  function backOutOfAyahJumpModal(){
    if(els.ayahJumpModal.classList.contains('hidden')) return;
    if(history.state && history.state.tag === 'panel'){
      history.back(); // popstate -> UI.closeTopmostOverlay() hides just this modal
    } else {
      els.ayahJumpModal.classList.add('hidden');
    }
  }
  function closeAyahJumpModal(){
    ayahJumpOnGo = null;
    backOutOfAyahJumpModal();
  }
  function submitAyahJumpModal(){
    if(!ayahJumpOnGo) return;
    var raw = UI.fromArabicDigits(els.ayahJumpInput.value.trim());
    var n = parseInt(raw, 10);
    if(!raw || isNaN(n) || n < 1 || n > ayahJumpMax){
      els.ayahJumpError.textContent = 'رقم الآية يجب أن يكون بين ١ و' + UI.toArabicDigits(ayahJumpMax) + '.';
      // Tapping "انتقال" does genuinely blur the input on-device (confirmed:
      // without this call, the cursor is gone and the person has to tap
      // the field again to keep typing) — the earlier "nothing blurs it"
      // read of the code was wrong, or at least doesn't match real device
      // behavior. Restore focus so retyping doesn't need an extra tap.
      //
      // focus() only — no .select(). The previous version of this fix
      // called .select() right after focus(), and THAT (not focus()
      // itself) was what triggered the number-pad IME to re-layout on
      // some Android devices, which re-fires UI.js's visualViewport
      // 'resize' listener and repositions the whole modal inline
      // (syncModalToViewport) — the reported redraw/shiver. A plain
      // focus() call, guarded so it's skipped if focus somehow never
      // left the input, hasn't reproduced that.
      if(els.ayahJumpInput && document.activeElement !== els.ayahJumpInput){
        els.ayahJumpInput.focus();
      }
      return;
    }
    var cb = ayahJumpOnGo;
    ayahJumpOnGo = null;
    if(els.ayahJumpInput) els.ayahJumpInput.blur();
    backOutOfAyahJumpModal();
    cb(n);
  }

  function init(deps){
    els = deps.els;
    UI = deps.UI;

    els.favModalSave && els.favModalSave.addEventListener('click', submitFavModal);
    els.favNameInput && els.favNameInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter') submitFavModal();
    });
    els.favModalCancel && els.favModalCancel.addEventListener('click', closeFavModal);

    els.gotoModalCancel && els.gotoModalCancel.addEventListener('click', closeGotoModal);
    els.gotoModalGo && els.gotoModalGo.addEventListener('click', submitGotoModal);
    els.gotoInput && els.gotoInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter') submitGotoModal();
    });

    els.clearRemindersModalCancel && els.clearRemindersModalCancel.addEventListener('click', closeClearRemindersModal);
    els.clearRemindersModalConfirm && els.clearRemindersModalConfirm.addEventListener('click', confirmClearRemindersModal);

    els.ayahJumpModalCancel && els.ayahJumpModalCancel.addEventListener('click', closeAyahJumpModal);
    els.ayahJumpModalGo && els.ayahJumpModalGo.addEventListener('click', submitAyahJumpModal);
    els.ayahJumpInput && els.ayahJumpInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter') submitAyahJumpModal();
    });

    // Both modals participate in the shared hardware-back-button stack —
    // see UI.js. If the back button force-closes favModal mid-flow, the
    // pending callback must be cleared too so a later Save press can't
    // fire with a stale callback.
    UI.registerOverlayModals([els.favModal, els.gotoModal, els.clearRemindersModal, els.ayahJumpModal].filter(Boolean));
  }

  window.Dialogs = {
    init: init,
    openFavModal: openFavModal,
    openGotoModal: openGotoModal,
    openClearRemindersModal: openClearRemindersModal,
    openAyahJumpModal: openAyahJumpModal,
    // Called by UI.js's onModalForceClosed hook (wired in app.js) so a
    // back-press that closes favModal/gotoModal also clears the pending
    // one-shot callback, matching what an explicit Cancel press does.
    clearPending: function(el){
      if(el === els.favModal) favOnSave = null;
      if(el === els.gotoModal) gotoOnGo = null;
      if(el === els.clearRemindersModal) clearRemindersOnConfirm = null;
      if(el === els.ayahJumpModal) ayahJumpOnGo = null;
    }
  };
})();
