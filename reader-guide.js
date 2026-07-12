// ReaderGuide: دليل القارئ — the reference panel with two tabs, علامات
// الوقف (waqf-marks legend) and دعاء ختم القرآن. "علامات الوقف" is
// always the tab shown first when the guide is opened from the home
// screen, regardless of which tab was last viewed.
// Loaded before app.js (see index.html). Call ReaderGuide.init(deps)
// once; deps: els, UI
// Exposed as window.ReaderGuide.
(function(){
  'use strict';

  var els, UI;

  function switchGuideTab(tab){
    var isWaqf = tab === 'waqf';
    els.tabWaqfMarks.classList.toggle('active', isWaqf);
    els.tabKhatmDua.classList.toggle('active', !isWaqf);
    els.waqfMarksTab.classList.toggle('hidden', !isWaqf);
    els.khatmDuaTab.classList.toggle('hidden', isWaqf);
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
    els.tabKhatmDua && els.tabKhatmDua.addEventListener('click', function(){ switchGuideTab('khatm'); });

    UI.registerOverlayPanels([els.waqfGuidePanel].filter(Boolean));
  }

  window.ReaderGuide = {
    init: init
  };
})();
