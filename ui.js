// UI: generic, feature-agnostic UI plumbing shared by every other module —
// Arabic-digit formatting, the toast, and the panel/modal open-close
// machinery (including the Android/PWA hardware-back-button behavior).
// Nothing in here knows about favorites, bookmarks, reminder marks, or any
// other feature; it only manipulates .hidden classes and browser history.
// Loaded before app.js (see index.html). Call UI.init(deps) once; deps:
//   els — the shared element lookup object built in app.js
// Exposed as window.UI.
(function(){
  'use strict';

  var els;

  // -----------------------------------------------------------------
  // Arabic-Indic digit formatting — used everywhere numbers are shown
  // in the UI (page numbers, ayah counts, percentages, ...).
  // -----------------------------------------------------------------
  var ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function toArabicDigits(n){
    return String(n).split('').map(function(c){
      return /[0-9]/.test(c) ? ARABIC_DIGITS[+c] : c;
    }).join('');
  }
  // Reverse of the above — accepts a string that may contain Arabic-Indic
  // digits (e.g. from a text input) and returns it with plain 0-9 digits,
  // so callers can safely parseInt() the result.
  function fromArabicDigits(s){
    return String(s).replace(/[٠-٩]/g, function(d){ return ARABIC_DIGITS.indexOf(d); });
  }

  // -----------------------------------------------------------------
  // Toast
  // -----------------------------------------------------------------
  var toastTimer = null;
  function showToast(msg){
    if(!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ els.toast.classList.remove('show'); }, 1800);
  }

  // -----------------------------------------------------------------
  // Panels — every side panel (index, surah list, juz list, search,
  // favorites, settings, دليل القارئ) and every modal (favorite-name,
  // goto-ruku) opens/closes through these two functions so that each
  // open panel/modal pushes exactly one browser-history entry, and the
  // Android/PWA hardware or gesture back button peels off one layer at a
  // time instead of exiting the app immediately. See the back-button
  // section below for how that stack of layers is unwound.
  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // Keep an open .modal-overlay (favModal, gotoModal, ...) positioned
  // above the on-screen keyboard.
  //
  // .modal-overlay is `position:fixed; inset:0` with its .modal-box
  // centered inside via flexbox — centered, that is, against the *layout*
  // viewport, which most mobile browsers do NOT shrink when the keyboard
  // opens (only the *visual* viewport shrinks). gotoModal/favModal both
  // auto-focus a text input the instant they open, so in practice the
  // keyboard is up for their entire visible lifetime — "centered in the
  // full-height layout viewport" then sits noticeably lower than the
  // actually-visible area above the keyboard, hiding the input/Go button
  // behind it. Syncing the overlay's own top+height to
  // window.visualViewport keeps it (and the flex-centered box inside it)
  // confined to the space that's actually visible.
  // -----------------------------------------------------------------
  function syncModalToViewport(){
    if(!window.visualViewport) return;
    var vv = window.visualViewport;
    var openOverlays = document.querySelectorAll('.modal-overlay:not(.hidden)');
    for(var i=0;i<openOverlays.length;i++){
      openOverlays[i].style.top = vv.offsetTop + 'px';
      openOverlays[i].style.height = vv.height + 'px';
    }
  }
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', syncModalToViewport);
    window.visualViewport.addEventListener('scroll', syncModalToViewport);
  }

  function openPanel(p){
    p.classList.remove('hidden');
    history.pushState({tag:'panel'}, '');
    if(p.classList.contains('modal-overlay')){
      // Sync immediately (covers the case the keyboard is already up from
      // a previous field) and once more shortly after — the keyboard's
      // own open animation/resize typically lands a beat after focus,
      // which happens on a setTimeout in the modal's own open function
      // (openFavModal/openGotoModal in dialogs.js).
      syncModalToViewport();
      setTimeout(syncModalToViewport, 250);
    }
  }
  function closePanel(p){
    if(p.classList.contains('hidden')) return; // already closed — nothing to pop
    p.classList.add('hidden');
    // Drop the inline top/height override once closed, so the next open
    // (or a plain CSS-driven layout) isn't stuck with a stale viewport
    // snapshot from this time.
    if(p.classList.contains('modal-overlay')){
      p.style.top = '';
      p.style.height = '';
    }
    if(history.state && history.state.tag === 'panel'){
      history.back();
    }
  }

  // -----------------------------------------------------------------
  // Android/PWA hardware & gesture back button.
  // By default a web page has no history entries of its own, so the very
  // first back-press exits the app entirely. openPanel() above pushes one
  // entry per open layer; this listens for the corresponding pop and
  // closes whichever layer is topmost — first any open modal, then any
  // open panel. The reader-screen ("go back to home") layer is a
  // separate, outer concern owned by Home — see onNoOverlayPopstate below,
  // which app.js wires up after both UI and Home are initialized.
  // -----------------------------------------------------------------
  var OVERLAY_MODALS = [];
  var OVERLAY_PANELS = [];
  var onModalForceClosed = null; // optional callback(el) — e.g. to clear pendingFavPage
  function isOverlayOpen(el){ return el && !el.classList.contains('hidden'); }
  function closeTopmostOverlay(){
    for(var i=0;i<OVERLAY_MODALS.length;i++){
      if(isOverlayOpen(OVERLAY_MODALS[i])){
        OVERLAY_MODALS[i].classList.add('hidden');
        if(onModalForceClosed) onModalForceClosed(OVERLAY_MODALS[i]);
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
  // Called once by app.js, after every module that owns a modal/panel has
  // registered its element(s) — see registerOverlayModal/Panel below.
  function setOnModalForceClosed(fn){ onModalForceClosed = fn; }
  function registerOverlayModals(list){ OVERLAY_MODALS = OVERLAY_MODALS.concat(list); }
  function registerOverlayPanels(list){ OVERLAY_PANELS = OVERLAY_PANELS.concat(list); }

  function init(deps){
    els = deps.els;
  }

  window.UI = {
    init: init,
    toArabicDigits: toArabicDigits,
    fromArabicDigits: fromArabicDigits,
    showToast: showToast,
    openPanel: openPanel,
    closePanel: closePanel,
    registerOverlayModals: registerOverlayModals,
    registerOverlayPanels: registerOverlayPanels,
    setOnModalForceClosed: setOnModalForceClosed,
    closeTopmostOverlay: closeTopmostOverlay
  };
})();
