// ReaderReminders: علامات التذكير الشخصية — per-word colored reminder
// marks, added/removed via a long-press on any word, plus their
// export/import as JSON. Stored as a flat map:
// { "surah:ayah:wordIndex": {c: 'red'|'green'|'blue'|'brown', t: timestamp} }.
// Purely a personal reading aid layered on top of the Qur'an text — it
// never touches or alters the ayah text itself. The app assigns no
// meaning to any color; each reader decides for themselves what
// red/green/blue/brown means to them.
// Loaded before app.js (see index.html). Call ReaderReminders.init(deps)
// once; deps:
//   els, state, UI, AudioManager
//   currentWaqfVisibilityKey() — from Settings, whether marks are shown
//     for the currently-active script mode
// Exposed as window.ReaderReminders.
(function(){
  'use strict';

  var els, state, UI, AudioManager, currentWaqfVisibilityKey;

  var waqfMarks = {};
  var REMINDER_COLORS = {red:1, green:1, blue:1, brown:1};

  // Long-press on a word carrying one of the default colored Sajawandi
  // stop-marks (has-default-* class set by readerManager.js) shows its
  // waqf type here instead of the personal reminder-mark menu. Colors
  // match the exact mapping in style.css (.has-default-* → .waqf-mark.mark-*).
  var DEFAULT_MARK_INFO = [
    // ميم الوقف اللازم: حرف «م» (U+0645) بخط المصحف في الـpopup —
    // U+06D8 ۘ علامة عالية صغيرة فوق السطر فكانت بالكاد تظهر في الواجهة.
    // الشكل القرآني يأتي من font-family (Uthmanic Hafs / Saleem) في CSS.
    {cls: 'has-default-waqf-lazim', symbol: '\u0645', label: 'وقف لازم', color: 'red'},
    {cls: 'has-default-waqf', symbol: 'ط', label: 'وقف مطلق', color: 'blue'},
    {cls: 'has-default-qif', symbol: 'قف', label: 'وقف مستحب', color: 'blue'},
    {cls: 'has-default-jeem', symbol: 'ج', label: 'وقف جائز', color: 'brown'},
    {cls: 'has-default-zay-jawaz', symbol: 'ز', label: 'وقف مجوز لوجه', color: 'green'},
    {cls: 'has-default-qad-qila', symbol: 'ق', label: 'قد قيل عليه الوقف', color: 'green'},
    {cls: 'has-default-sad-rukhsa', symbol: 'ص', label: 'وقف مرخص للضرورة', color: 'green'}
  ];
  function resolveDefaultMarkInfo(wordEl){
    for(var i = 0; i < DEFAULT_MARK_INFO.length; i++){
      if(wordEl.classList.contains(DEFAULT_MARK_INFO[i].cls)) return DEFAULT_MARK_INFO[i];
    }
    return null;
  }
  // Long-press: درجة الوقف من NON_KUFI_HEADS_SYM_* فقط (عند E021 نفسه).
  // ممنوع مسح الجيران — كان يلتقط ص/لا من آية أخرى
  // (مثال: 37:9 دحورا بلا علامة ← ظهر خطأ [ ص ] من 37:8 جانب).
  // مفتاح موجود في الرؤوس وغير موجود في SYM = موضع عارٍ → بلا أقواس.
  function resolveNonKufiWaqfSymbol(wordEl){
    var key = wordEl.getAttribute('data-key');
    if(!key) return null;
    var isUthmani = (typeof state !== 'undefined' && state.fontStyle === 'uthmani') ||
      (document.body && document.body.classList.contains('uthmani-font'));
    var symMap = isUthmani ? window.NON_KUFI_HEADS_SYM_UTHMANI : window.NON_KUFI_HEADS_SYM_INDOPAK;
    if(symMap && symMap[key]) return symMap[key];
    return null;
  }
  function resolveNonKufiMarkInfo(wordEl){
    if(!wordEl.classList.contains('has-non-kufi-head')) return null;
    var mark = wordEl.querySelector('.non-kufi-mark');
    // بلا mark-* = موضع عارٍ (لا علامة وقف) → popup بحبر النص (info-plain)
    var color = 'plain';
    if(mark){
      if(mark.classList.contains('mark-red')) color = 'red';
      else if(mark.classList.contains('mark-green')) color = 'green';
      else if(mark.classList.contains('mark-brown')) color = 'brown';
      else if(mark.classList.contains('mark-blue')) color = 'blue';
    }
    // رأس بلا لون خاص به (رمز غير «لا»، مثل م/ط/ص/ز/ق/قف/ج): نجمة
    // السجاوندي المقابلة تُرسم على نفس هذه الكلمة عبر .waqf-mark
    // (has-default-*)، لا عبر .non-kufi-mark. يجب أن يطابق لون الـpopup
    // لونها، لا حبر النص الافتراضي.
    if(color === 'plain'){
      var defaultInfoSameWord = resolveDefaultMarkInfo(wordEl);
      if(defaultInfoSameWord) color = defaultInfoSameWord.color;
    }
    var label = 'رأس آية لغير الكوفيين';
    var waqfSym = resolveNonKufiWaqfSymbol(wordEl);
    if(waqfSym) label += '  [ ' + waqfSym + ' ]';
    return {symbol: '۝', label: label, color: color};
  }

  function loadWaqfMarks(){ return StorageManager.loadReminder(state.fontStyle); }
  function saveWaqfMarks(){ StorageManager.saveReminder(state.fontStyle, waqfMarks); }
  function readWaqfMarksFromStorage(style){ return StorageManager.loadReminder(style); }
  function writeWaqfMarksToStorage(style, marks){ StorageManager.saveReminder(style, marks); }

  function updateWordMarkUI(key){
    var safeKey = key.replace(/"/g, '\\"');
    var wordEl = els.pageScroll.querySelector('.quran-word[data-key="' + safeKey + '"]');
    if(!wordEl) return;
    var mark = waqfMarks[key];
    wordEl.classList.toggle('has-waqf', !!mark);
    var markSpan = wordEl.querySelector('.waqf-mark');
    if(markSpan){
      markSpan.classList.remove('mark-red', 'mark-green', 'mark-blue', 'mark-brown');
      if(mark) markSpan.classList.add('mark-' + (REMINDER_COLORS[mark.c] ? mark.c : 'red'));
    }
    // Only this one word's star just changed visibility/color — no need
    // to re-scan the whole page, just re-check this mark's placement.
    if(window.MarkPlacementEngine) window.MarkPlacementEngine.resolveWord(wordEl);
  }
  function addWaqfMark(key, color){
    waqfMarks[key] = {c: REMINDER_COLORS[color] ? color : 'red', t: Date.now()};
    saveWaqfMarks();
    updateWordMarkUI(key);
    UI.showToast('تمت إضافة علامة التذكير');
  }
  function removeWaqfMark(key){
    delete waqfMarks[key];
    saveWaqfMarks();
    updateWordMarkUI(key);
    UI.showToast('تم حذف علامة التذكير');
  }
  // Called by Settings after a font-style switch — reminder marks are
  // stored per script mode, so the in-memory map must be swapped for the
  // newly-active mode's marks before the page re-renders.
  function reloadWaqfMarksForCurrentStyle(){
    waqfMarks = loadWaqfMarks();
  }
  function getWaqfMarks(){ return waqfMarks; }

  // "حذف جميع علامات التذكير" (الإعدادات): clears reminder marks for only
  // the currently active script mode (state.fontStyle) — the other
  // script's marks are left untouched, since the two are independent
  // reading positions. Resets the in-memory map and strips the
  // "has-waqf" state off every word currently on screen so the change is
  // visible immediately without requiring a full page re-render.
  function clearAllMarks(){
    StorageManager.clearRemindersForStyle(state.fontStyle);
    waqfMarks = {};
    els.pageScroll.querySelectorAll('.quran-word.has-waqf').forEach(function(wordEl){
      wordEl.classList.remove('has-waqf');
      var markSpan = wordEl.querySelector('.waqf-mark');
      if(markSpan) markSpan.classList.remove('mark-red', 'mark-green', 'mark-blue', 'mark-brown');
    });
  }

  // ---- تصدير/استيراد علامات التذكير (JSON) ----
  function exportMarks(){
    // Export both script modes together, each under its own key, since a
    // reader may have separate marks on the Madinah and Naskh Ta'liq
    // mushaf. Only the active mode lives in memory (waqfMarks); the other
    // mode is read fresh from its own storage slot.
    var uthmaniMarks = (state.fontStyle === 'uthmani') ? waqfMarks : readWaqfMarksFromStorage('uthmani');
    var indopakMarks = (state.fontStyle !== 'uthmani') ? waqfMarks : readWaqfMarksFromStorage('indopak');
    var payload = JSON.stringify({
      app: 'مصحف الركوع',
      type: 'reminder-marks',
      marks: {uthmani: uthmaniMarks, indopak: indopakMarks}
    }, null, 2);
    var blob = new Blob([payload], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'علامات_التذكير.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    UI.showToast('تم تصدير علامات التذكير');
  }
  // Merges an incoming mark set into one script mode's storage (not
  // necessarily the active one), converting legacy bare-timestamp marks
  // the same way loadWaqfMarks() does.
  function importMarksIntoStyle(style, incoming){
    var current = readWaqfMarksFromStorage(style);
    Object.keys(incoming).forEach(function(k){
      var v = incoming[k];
      current[k] = (typeof v === 'number') ? {c: 'red', t: v} : v;
    });
    writeWaqfMarksToStorage(style, current);
  }
  function importMarksFromFile(file, onDone){
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var data = JSON.parse(reader.result);
        var incoming = (data && data.marks) ? data.marks : data;
        if(!incoming || typeof incoming !== 'object') throw new Error('bad format');
        // New exports nest marks under {uthmani, indopak}. Older exports
        // (from before marks were split per mode) are a flat map at the
        // top level — import those into the active mode only, matching
        // the old behavior exactly.
        var isPerMode = ('uthmani' in incoming) || ('indopak' in incoming);
        if(isPerMode){
          importMarksIntoStyle('uthmani', incoming.uthmani || {});
          importMarksIntoStyle('indopak', incoming.indopak || {});
          waqfMarks = loadWaqfMarks(); // refresh in-memory copy for the active mode
        }else{
          // Accept both the new {c, t} shape and legacy bare-timestamp marks.
          Object.keys(incoming).forEach(function(k){
            var v = incoming[k];
            waqfMarks[k] = (typeof v === 'number') ? {c: 'red', t: v} : v;
          });
          saveWaqfMarks();
        }
        UI.showToast('تم استيراد علامات التذكير');
        if(onDone) onDone(true);
      }catch(err){
        UI.showToast('ملف غير صالح');
        if(onDone) onDone(false);
      }
    };
    reader.readAsText(file);
  }

  function wireReminderMarkMenus(){
    var root = els.ayahFlow;
    var pendingKey = null; // word targeted by whichever popup is open
    var lastPos = {x: 0, y: 0};

    function positionMenu(menuEl, x, y){
      // Position after it's visible, so we can measure its real size and
      // keep it fully on-screen near the finger.
      requestAnimationFrame(function(){
        var rect = menuEl.getBoundingClientRect();
        var left = Math.min(Math.max(8, x - rect.width / 2), window.innerWidth - rect.width - 8);
        var top = Math.max(8, y - rect.height - 18);
        menuEl.style.left = left + 'px';
        menuEl.style.top = top + 'px';
      });
    }
    var infoPopupTimer = null;
    function closeMenus(){
      els.waqfMenu.classList.add('hidden');
      els.waqfColorMenu.classList.add('hidden');
      els.waqfDeleteMenu.classList.add('hidden');
      if(els.waqfInfoPopup){
        els.waqfInfoPopup.classList.add('hidden');
        els.waqfInfoPopup.classList.remove('info-red', 'info-green', 'info-blue', 'info-brown', 'info-plain');
      }
      if(infoPopupTimer){ clearTimeout(infoPopupTimer); infoPopupTimer = null; }
      pendingKey = null;
    }
    // Shows the waqf type of a colored Sajawandi word instead of the
    // add/delete reminder menu — no key/color action pending, so it
    // doesn't touch pendingKey. Auto-dismisses after a few seconds, or
    // immediately on an outside tap like the other popups.
    function openInfoPopup(info, x, y){
      if(!els.waqfInfoPopup) return;
      els.waqfMenu.classList.add('hidden');
      els.waqfColorMenu.classList.add('hidden');
      els.waqfDeleteMenu.classList.add('hidden');
      els.waqfInfoSymbol.textContent = info.symbol;
      els.waqfInfoLabel.textContent = info.label;
      els.waqfInfoPopup.classList.remove('info-red', 'info-green', 'info-blue', 'info-brown', 'info-plain');
      els.waqfInfoPopup.classList.add('info-' + info.color);
      els.waqfInfoPopup.classList.remove('hidden');
      positionMenu(els.waqfInfoPopup, x, y);
      if(infoPopupTimer) clearTimeout(infoPopupTimer);
      infoPopupTimer = setTimeout(closeMenus, 2600);
    }
    function openColorMenu(wordEl, x, y){
      pendingKey = wordEl.getAttribute('data-key');
      lastPos = {x: x, y: y};
      els.waqfMenu.classList.add('hidden');
      els.waqfColorMenu.classList.remove('hidden');
      positionMenu(els.waqfColorMenu, x, y);
    }
    function openDeleteMenu(wordEl, x, y){
      pendingKey = wordEl.getAttribute('data-key');
      els.waqfDeleteMenu.classList.remove('hidden');
      positionMenu(els.waqfDeleteMenu, x, y);
    }

    Gestures.longPress({
      root: root,
      resolveTarget: function(target){
        if(state[currentWaqfVisibilityKey()] === false) return null; // العلامات معطّلة من الإعدادات لهذا الرسم
        return target.closest ? target.closest('.quran-word') : null;
      },
      onPressStart: function(){
        AudioManager.pauseScrollSync();
      },
      onPressEnd: function(){
        AudioManager.resumeScrollSync();
      },
      onFire: function(wordEl, x, y){
        // A word carrying a colored default Sajawandi stop-mark (ط/ص/م/ز/ق/قف/ج)
        // shows its waqf type instead of the reminder menu — checked first,
        // and at fire time, so it always reflects this exact word.
        // Non-Kufi ayah head takes priority when present: the reader
        // long-pressed specifically to learn what the small star means.
        var nonKufiInfo = resolveNonKufiMarkInfo(wordEl);
        if(nonKufiInfo){ openInfoPopup(nonKufiInfo, x, y); return; }
        var defaultInfo = resolveDefaultMarkInfo(wordEl);
        if(defaultInfo){ openInfoPopup(defaultInfo, x, y); return; }
        // Decide add vs. delete at fire time (not at press-start), so it
        // always reflects this exact word's current state, no matter
        // whether the finger landed on the dot or elsewhere on the word.
        var key = wordEl.getAttribute('data-key');
        if(waqfMarks[key]) openDeleteMenu(wordEl, x, y);
        else openColorMenu(wordEl, x, y);
      },
      // Some Android WebViews fall back to a native long-press context menu
      // even with user-select:none; make sure it never appears here.
      suppressContextMenu: true
    });

    els.waqfColorMenu.querySelectorAll('.waqf-color-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!pendingKey) return;
        addWaqfMark(pendingKey, btn.getAttribute('data-color'));
        closeMenus();
      });
    });

    els.waqfDeleteMenuItem.addEventListener('click', function(){
      if(!pendingKey) return;
      removeWaqfMark(pendingKey);
      closeMenus();
    });

    // Tapping anywhere outside an open popup closes it without acting.
    function outsideClose(e){
      var popups = [els.waqfMenu, els.waqfColorMenu, els.waqfDeleteMenu];
      if(els.waqfInfoPopup) popups.push(els.waqfInfoPopup);
      var openMenu = !popups.every(function(m){
        return m.classList.contains('hidden');
      });
      if(!openMenu) return;
      var insideAny = popups.some(function(m){ return m.contains(e.target); });
      if(!insideAny) closeMenus();
    }
    document.addEventListener('touchstart', outsideClose, {passive:true});
    document.addEventListener('mousedown', outsideClose);
  }

  function init(deps){
    els = deps.els;
    state = deps.state;
    UI = deps.UI;
    AudioManager = deps.AudioManager;
    currentWaqfVisibilityKey = deps.currentWaqfVisibilityKey;

    waqfMarks = loadWaqfMarks();

    wireReminderMarkMenus();
  }

  window.ReaderReminders = {
    init: init,
    getWaqfMarks: getWaqfMarks,
    clearAllMarks: clearAllMarks,
    reloadWaqfMarksForCurrentStyle: reloadWaqfMarksForCurrentStyle,
    exportMarks: exportMarks,
    importMarksFromFile: importMarksFromFile,
    // For UI's onModalForceClosed hook.
    REMINDER_COLORS: REMINDER_COLORS,
    // Test-only hook (regression tests run under Node without a real
    // DOM/long-press flow) — not used by the app itself.
    _resolveNonKufiMarkInfo: resolveNonKufiMarkInfo
  };
})();
