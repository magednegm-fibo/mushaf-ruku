// ReaderGuide: دليل القارئ — the reference panel with tabs: علامات
// الوقف, قصر المنفصل, دعاء ختم القرآن, الإذاعة, الصلاة.
// This file only owns tab switching; prayer logic lives in prayer.js,
// radio in radio-player.js. "علامات الوقف" is always the tab shown first
// when the guide is opened from the home screen.
// Loaded before app.js (see index.html). Call ReaderGuide.init(deps)
// once; deps: els, UI
// Exposed as window.ReaderGuide.
(function(){
  'use strict';

  var els, UI;
  // DOM/visual order of the tabs, right to left (matches the flex row
  // under dir="rtl": tabWaqfMarks renders rightmost) — also the order
  // swiping moves through.
  var TAB_ORDER = ['waqf', 'tajweed', 'khatm', 'salah', 'radio'];
  var currentTab = 'waqf';

  function tabButtonFor(tab){
    if(tab === 'waqf') return els.tabWaqfMarks;
    if(tab === 'tajweed') return els.tabTajweedRules;
    if(tab === 'khatm') return els.tabKhatmDua;
    if(tab === 'radio') return els.tabRadio;
    if(tab === 'salah') return els.tabSalah;
    return null;
  }

  /** Keep the active tab label visible inside the horizontally scrollable .guide-tabs bar. */
  function ensureActiveTabVisible(tab){
    var btn = tabButtonFor(tab);
    var tabsBar = els.waqfGuidePanel && els.waqfGuidePanel.querySelector('.guide-tabs');
    if(!btn || !tabsBar) return;
    // Prefer native scrollIntoView (handles RTL scroll metrics across browsers).
    try{
      if(typeof btn.scrollIntoView === 'function'){
        btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        return;
      }
    }catch(e){}
    // Fallback: manual horizontal scroll
    var btnLeft = btn.offsetLeft;
    var btnRight = btnLeft + btn.offsetWidth;
    var viewLeft = tabsBar.scrollLeft;
    var viewRight = viewLeft + tabsBar.clientWidth;
    if(btnLeft < viewLeft){
      tabsBar.scrollLeft = btnLeft - 8;
    }else if(btnRight > viewRight){
      tabsBar.scrollLeft = btnRight - tabsBar.clientWidth + 8;
    }
  }

  function switchGuideTab(tab){
    // Leaving the prayer tab must stop the compass immediately so sensor
    // listeners do not keep running while another guide tab is visible.
    if(currentTab === 'salah' && tab !== 'salah' && window.Prayer && typeof window.Prayer.onTabHidden === 'function'){
      window.Prayer.onTabHidden();
    }
    currentTab = tab;
    els.tabWaqfMarks && els.tabWaqfMarks.classList.toggle('active', tab === 'waqf');
    els.tabTajweedRules && els.tabTajweedRules.classList.toggle('active', tab === 'tajweed');
    els.tabKhatmDua && els.tabKhatmDua.classList.toggle('active', tab === 'khatm');
    els.tabRadio && els.tabRadio.classList.toggle('active', tab === 'radio');
    els.tabSalah && els.tabSalah.classList.toggle('active', tab === 'salah');
    els.waqfMarksTab && els.waqfMarksTab.classList.toggle('hidden', tab !== 'waqf');
    els.tajweedRulesTab && els.tajweedRulesTab.classList.toggle('hidden', tab !== 'tajweed');
    els.khatmDuaTab && els.khatmDuaTab.classList.toggle('hidden', tab !== 'khatm');
    els.radioTab && els.radioTab.classList.toggle('hidden', tab !== 'radio');
    els.salahTab && els.salahTab.classList.toggle('hidden', tab !== 'salah');
    if(tab === 'salah' && window.Prayer && typeof window.Prayer.onTabShown === 'function'){
      window.Prayer.onTabShown();
    }
    // After class toggles, bring the active tab chip into the visible strip
    // (fixes: swipe from الصلاة back to علامات الوقف while the bar stayed scrolled left).
    requestAnimationFrame(function(){ ensureActiveTabVisible(tab); });
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
      // شريط الـTabs قابل للتمرير أفقيًا — استثنِه من كاشف السحب حتى لا
      // يتنازع مع تمريره الأصلي (native) ويكسر سلاسته بـ preventDefault.
      // تبويب الصلاة (#salahTab) لم يعد مستثنى: السحب الأفقي داخله يبدّل
      // التبويب كباقي الدليل (مطلوب للوصول من/إلى مواقيت الصلاة بالسحب).
      // سحب الصفحة الأصلي للمتصفح كان يُعالَج سابقًا باستثناء JS كامل؛
      // الآن يُمنَع عبر CSS فقط: #salahTab { touch-action: pan-y } في
      // style.css — التمرير العمودي يعمل، والسحب الأفقي للمتصفح لا يحرّك
      // الصفحة، بينما Gestures.swipe ما زال يلتقط تبديل التبويب.
      ignoreTarget: function(el){
        return !!(el && el.closest && el.closest('.guide-tabs'));
      },
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
      // 0 = الحافة اليسرى، والقيمة العظمى = البداية المنطقية
      // (علامات الوقف على اليمين).
      requestAnimationFrame(function(){
        var tabsBar = els.waqfGuidePanel && els.waqfGuidePanel.querySelector('.guide-tabs');
        if(!tabsBar) return;
        tabsBar.scrollLeft = tabsBar.scrollWidth;
      });
    });
    els.btnCloseWaqfGuide && els.btnCloseWaqfGuide.addEventListener('click', function(){
      if(currentTab === 'salah' && window.Prayer && typeof window.Prayer.onTabHidden === 'function'){
        window.Prayer.onTabHidden();
      }
      UI.closePanel(els.waqfGuidePanel);
    });
    els.tabWaqfMarks && els.tabWaqfMarks.addEventListener('click', function(){ switchGuideTab('waqf'); });
    els.tabTajweedRules && els.tabTajweedRules.addEventListener('click', function(){ switchGuideTab('tajweed'); });
    els.tabKhatmDua && els.tabKhatmDua.addEventListener('click', function(){ switchGuideTab('khatm'); });
    els.tabRadio && els.tabRadio.addEventListener('click', function(){ switchGuideTab('radio'); });
    els.tabSalah && els.tabSalah.addEventListener('click', function(){ switchGuideTab('salah'); });
    wireSwipe();

    UI.registerOverlayPanels([els.waqfGuidePanel].filter(Boolean));
  }

  window.ReaderGuide = {
    init: init
  };
})();
