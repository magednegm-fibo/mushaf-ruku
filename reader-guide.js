// ReaderGuide: دليل القارئ — the reference panel with three tabs, علامات
// الوقف (waqf-marks legend), قصر المنفصل (Hafs 'an Asim via the Rawdat
// al-Mu'addil route, contrasted with the Shatibiyyah route this mushaf's
// text/audio follow), and دعاء ختم القرآن. "علامات الوقف" is always the
// tab shown first when the guide is opened from the home screen,
// regardless of which tab was last viewed.
// Loaded before app.js (see index.html). Call ReaderGuide.init(deps)
// once; deps: els, UI
// Exposed as window.ReaderGuide.
(function(){
  'use strict';

  var els, UI;
  // DOM/visual order of the tabs, right to left (matches the flex row
  // under dir="rtl": tabWaqfMarks renders rightmost, tabKhatmDua
  // leftmost) — also the order swiping moves through.
  var TAB_ORDER = ['waqf', 'tajweed', 'khatm'];
  var currentTab = 'waqf';

  function switchGuideTab(tab){
    currentTab = tab;
    els.tabWaqfMarks.classList.toggle('active', tab === 'waqf');
    els.tabTajweedRules.classList.toggle('active', tab === 'tajweed');
    els.tabKhatmDua.classList.toggle('active', tab === 'khatm');
    els.waqfMarksTab.classList.toggle('hidden', tab !== 'waqf');
    els.tajweedRulesTab.classList.toggle('hidden', tab !== 'tajweed');
    els.khatmDuaTab.classList.toggle('hidden', tab !== 'khatm');
  }

  // Swipe left/right inside the guide panel moves to the next/previous
  // tab. Same RTL convention used for turning pages in the reader and
  // for the tafsir panel (see wireSwipeAndPinch in navigation.js and
  // wireSwipe in reader-tafsir.js): dragging the finger right (dx > 0)
  // advances forward (toward the next tab in TAB_ORDER), left goes
  // back. Swiping past the first/last tab does nothing (no wraparound,
  // no toast — this is a lightweight tab switcher, not page navigation).
  function wireSwipe(){
    if(!els.waqfGuidePanel) return;
    var startX = null, startY = null;
    var horizontal = false; // becomes true once a drag is confirmed
                             // horizontal — see onMove below

    // Same reasoning as reader-tafsir.js's wireSwipe: without this, an
    // unhandled horizontal drag can escape to whatever's behind this
    // fixed panel once confirmed horizontal, preventDefault stops that.
    function onMove(e){
      if(startX === null || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if(!horizontal){
        if(Math.abs(dx) < 10) return; // too small yet to tell intent
        if(Math.abs(dx) <= Math.abs(dy) * 1.5) return; // reads as a vertical scroll — leave it alone
        horizontal = true;
      }
      e.preventDefault();
    }

    els.waqfGuidePanel.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1){ startX = null; return; }
      var t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      horizontal = false;
      els.waqfGuidePanel.addEventListener('touchmove', onMove, {passive:false});
    }, {passive:true});

    els.waqfGuidePanel.addEventListener('touchend', function(e){
      els.waqfGuidePanel.removeEventListener('touchmove', onMove, {passive:false});
      if(startX === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      startX = null; startY = null;
      if(Math.abs(dx) <= 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
      var idx = TAB_ORDER.indexOf(currentTab);
      var nextIdx = dx > 0 ? idx + 1 : idx - 1;
      if(nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
      switchGuideTab(TAB_ORDER[nextIdx]);
    }, {passive:true});
  }

  function init(deps){
    els = deps.els;
    UI = deps.UI;

    els.tileWaqfGuide && els.tileWaqfGuide.addEventListener('click', function(){
      switchGuideTab('waqf');
      UI.openPanel(els.waqfGuidePanel);
    });
    els.btnCloseWaqfGuide && els.btnCloseWaqfGuide.addEventListener('click', function(){ UI.closePanel(els.waqfGuidePanel); });
    els.tabWaqfMarks && els.tabWaqfMarks.addEventListener('click', function(){ switchGuideTab('waqf'); });
    els.tabTajweedRules && els.tabTajweedRules.addEventListener('click', function(){ switchGuideTab('tajweed'); });
    els.tabKhatmDua && els.tabKhatmDua.addEventListener('click', function(){ switchGuideTab('khatm'); });
    wireSwipe();

    UI.registerOverlayPanels([els.waqfGuidePanel].filter(Boolean));
  }

  window.ReaderGuide = {
    init: init
  };
})();
