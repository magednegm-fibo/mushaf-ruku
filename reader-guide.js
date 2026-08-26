// ReaderGuide: دليل القارئ — the reference panel with four tabs, علامات
// الوقف (waqf-marks legend), قصر المنفصل (Hafs 'an Asim via the Rawdat
// al-Mu'addil route, contrasted with the Shatibiyyah route this mushaf's
// text/audio follow), دعاء ختم القرآن, and الإذاعة (live Quran radio —
// see radio-player.js for the player itself; this file only owns tab
// switching). "علامات الوقف" is always the tab shown first when the
// guide is opened from the home screen, regardless of which tab was
// last viewed.
// Loaded before app.js (see index.html). Call ReaderGuide.init(deps)
// once; deps: els, UI
// Exposed as window.ReaderGuide.
(function(){
  'use strict';

  var els, UI;
  // DOM/visual order of the tabs, right to left (matches the flex row
  // under dir="rtl": tabWaqfMarks renders rightmost, tabRadio
  // leftmost) — also the order swiping moves through.
  var TAB_ORDER = ['waqf', 'tajweed', 'khatm', 'radio'];
  var currentTab = 'waqf';

  function switchGuideTab(tab){
    currentTab = tab;
    els.tabWaqfMarks.classList.toggle('active', tab === 'waqf');
    els.tabTajweedRules.classList.toggle('active', tab === 'tajweed');
    els.tabKhatmDua.classList.toggle('active', tab === 'khatm');
    els.tabRadio && els.tabRadio.classList.toggle('active', tab === 'radio');
    els.waqfMarksTab.classList.toggle('hidden', tab !== 'waqf');
    els.tajweedRulesTab.classList.toggle('hidden', tab !== 'tajweed');
    els.khatmDuaTab.classList.toggle('hidden', tab !== 'khatm');
    els.radioTab && els.radioTab.classList.toggle('hidden', tab !== 'radio');
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
      // شريط الـTabs نفسه صار قابلاً للتمرير أفقيًا (عند إضافة "الإذاعة"
      // كتاب رابع على الشاشات الضيقة) — استثنِه من كاشف السحب هنا حتى لا
      // يتنازع مع تمريره الأصلي (native) ويكسر سلاسته بـ preventDefault.
      ignoreTarget: function(el){ return !!(el && el.closest && el.closest('.guide-tabs')); },
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
      // شريط الـTabs قابل للتمرير أفقيًا. إعادة الموضع يجب أن تتم بعد
      // إظهار اللوحة: أثناء display:none يتجاهل المتصفح scrollLeft ويُبقي
      // موضع التمرير السابق عند الظهور. في RTL على Chrome/Android القيمة
      // 0 = الحافة اليسرى (الإذاعة)، والقيمة العظمى = البداية المنطقية
      // (علامات الوقف على اليمين).
      requestAnimationFrame(function(){
        var tabsBar = els.waqfGuidePanel && els.waqfGuidePanel.querySelector('.guide-tabs');
        if(!tabsBar) return;
        tabsBar.scrollLeft = tabsBar.scrollWidth;
      });
    });
    els.btnCloseWaqfGuide && els.btnCloseWaqfGuide.addEventListener('click', function(){ UI.closePanel(els.waqfGuidePanel); });
    els.tabWaqfMarks && els.tabWaqfMarks.addEventListener('click', function(){ switchGuideTab('waqf'); });
    els.tabTajweedRules && els.tabTajweedRules.addEventListener('click', function(){ switchGuideTab('tajweed'); });
    els.tabKhatmDua && els.tabKhatmDua.addEventListener('click', function(){ switchGuideTab('khatm'); });
    els.tabRadio && els.tabRadio.addEventListener('click', function(){ switchGuideTab('radio'); });
    wireSwipe();

    UI.registerOverlayPanels([els.waqfGuidePanel].filter(Boolean));
  }

  window.ReaderGuide = {
    init: init
  };
})();
