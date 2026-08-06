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
  // Uses the shared Gestures.swipe helper (gestures.js).
  function wireSwipe(){
    if(!els.waqfGuidePanel) return;
    Gestures.swipe({
      root: els.waqfGuidePanel,
      onSwipe: function(dx){
        var idx = TAB_ORDER.indexOf(currentTab);
        var nextIdx = dx > 0 ? idx + 1 : idx - 1;
        if(nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
        switchGuideTab(TAB_ORDER[nextIdx]);
      }
    });
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
