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

    // Both modals participate in the shared hardware-back-button stack —
    // see UI.js. If the back button force-closes favModal mid-flow, the
    // pending callback must be cleared too so a later Save press can't
    // fire with a stale callback.
    UI.registerOverlayModals([els.favModal, els.gotoModal, els.clearRemindersModal].filter(Boolean));
  }

  window.Dialogs = {
    init: init,
    openFavModal: openFavModal,
    openGotoModal: openGotoModal,
    openClearRemindersModal: openClearRemindersModal,
    // Called by UI.js's onModalForceClosed hook (wired in app.js) so a
    // back-press that closes favModal/gotoModal also clears the pending
    // one-shot callback, matching what an explicit Cancel press does.
    clearPending: function(el){
      if(el === els.favModal) favOnSave = null;
      if(el === els.gotoModal) gotoOnGo = null;
      if(el === els.clearRemindersModal) clearRemindersOnConfirm = null;
    }
  };
})();
