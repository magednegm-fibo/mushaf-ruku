// StorageManager: the ONLY place in this app that talks to localStorage
// directly. All UI/app code (app.js) goes through the named methods here
// instead — saveSettings/loadSettings, saveLastRead/loadLastRead,
// saveBookmark/loadBookmarks, saveReminder/loadReminder, plus
// save/loadFavorites — so storage format, migrations, and error handling
// all live in exactly one file. Loaded before app.js (see index.html),
// after constants.js (needs window.MUSHAF_KEYS for the actual key
// strings). Exposed as window.StorageManager.
(function(){
  'use strict';

  var KEYS = window.MUSHAF_KEYS;

  function readJSON(key, fallback){
    try{
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){ return fallback; }
  }

  // Every write goes through here, so this is the one place that needs to
  // tell the user when a save silently failed (quota exceeded, Safari ITP,
  // private browsing, etc.) — callers all over the app (saveState() on
  // every page turn, saveFavorites(), saveBookmarkToStorage(), saveReminder())
  // just call StorageManager.save*() without checking a return value, so a
  // toast fired from inside writeJSON() is the only way the user actually
  // finds out a save didn't stick. Throttled so a broken/full storage
  // doesn't spam a toast on every single autosave (e.g. each page turn) —
  // one notice per NOTIFY_THROTTLE_MS window is enough to alert the user
  // without being annoying.
  var NOTIFY_THROTTLE_MS = 15000;
  var lastFailureNotifyTs = 0;
  function notifyWriteFailure(){
    var now = Date.now();
    if(now - lastFailureNotifyTs < NOTIFY_THROTTLE_MS) return;
    lastFailureNotifyTs = now;
    if(window.UI && typeof window.UI.showToast === 'function'){
      window.UI.showToast('تعذّر حفظ التغييرات، قد تكون مساحة التخزين ممتلئة أو المتصفح يعمل في وضع التصفح الخاص');
    }
  }
  function writeJSON(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ notifyWriteFailure(); return false; } // private browsing / quota exceeded, etc.
  }

  // ---------------------------------------------------------------------
  // Settings + last-read position
  // ---------------------------------------------------------------------
  // In this app's current data model, "settings" (font size, night mode,
  // script choice, reciter, ...) and "last-read position" (current page,
  // furthest-read progress per script) are one combined record, saved
  // together under KEYS.STORAGE_KEY every time either changes — that's
  // how the rest of the app already treats them (see `state` in app.js).
  // loadSettings/saveSettings and loadLastRead/saveLastRead are exposed
  // as separate named methods anyway, matching the requested API and
  // giving each concern its own clearly-named entry point; today they
  // both read/write that same combined record. Splitting them into two
  // genuinely separate storage keys later is a storage-layer-only change
  // — app.js would need no edits, since it never touches localStorage
  // itself anymore.
  function loadSettings(){
    var DEFAULTS = {
      page:0, fontSizeUthmani:28, fontSizeIndopak:28, night:false,
      furthestUthmani:0, furthestIndopak:0,
      lastPageUthmani:0, lastPageIndopak:0, lastPageShared:0,
      fontStyle:'uthmani', showWaqfMarksUthmani:true, showWaqfMarksIndopak:true,
      pinchZoomEnabled:true, keepScreenAwake:false, reciter:'abdulbasit',
      autoScrollEnabled:true, longPressScope:'ayah', recitationRepeatCount:1
    };
    var result = Object.assign({}, DEFAULTS, readJSON(KEYS.STORAGE_KEY, {}));

    // Migration: older saved states had a single shared `fontSize` field.
    // Carry that value over into the size for whichever script mode was
    // active, so upgrading doesn't silently reset the reader's chosen size.
    if(result.fontSize !== undefined){
      var migratedKey = result.fontStyle === 'uthmani' ? 'fontSizeUthmani' : 'fontSizeIndopak';
      result[migratedKey] = result.fontSize;
      delete result.fontSize;
    }
    // Migration: older saved states had a single shared `showWaqfMarks`
    // toggle. Carry that value over into both script modes so upgrading
    // doesn't silently reveal/hide marks the reader didn't ask to change.
    if(result.showWaqfMarks !== undefined){
      result.showWaqfMarksUthmani = result.showWaqfMarks;
      result.showWaqfMarksIndopak = result.showWaqfMarks;
      delete result.showWaqfMarks;
    }
    // Migration: older saved states had a single shared `furthest` (reading
    // progress) field, and "continue last reading" always resumed at the
    // single shared `page`. Seed both script modes' progress and last-read
    // page from those old shared values — otherwise reading progress and
    // the resume point would appear reset to zero after upgrading, even
    // though the reader has already read that far.
    if(result.furthest !== undefined){
      result.furthestUthmani = result.furthest;
      result.furthestIndopak = result.furthest;
      delete result.furthest;
    }
    if(result.page){
      result.lastPageUthmani = result.lastPageUthmani || result.page;
      result.lastPageIndopak = result.lastPageIndopak || result.page;
    }
    // Migration: reading progress used to be tracked separately per script
    // mode (lastPageUthmani / lastPageIndopak). It's now a single shared
    // value for both mushafs — seeded from whichever mode had progressed
    // further, so upgrading never appears to lose reading progress.
    if(result.lastPageShared === undefined){
      result.lastPageShared = Math.max(result.lastPageUthmani || 0, result.lastPageIndopak || 0, result.page || 0);
    }
    return result;
  }
  function saveSettings(settings){
    return writeJSON(KEYS.STORAGE_KEY, settings);
  }
  // Semantic aliases (see note above) — same combined record for now.
  function loadLastRead(){ return loadSettings(); }
  function saveLastRead(settings){ return saveSettings(settings); }

  // ---------------------------------------------------------------------
  // Favorites (المفضلة)
  // ---------------------------------------------------------------------
  function loadFavorites(){
    return readJSON(KEYS.FAV_KEY, []);
  }
  function saveFavorites(list){
    return writeJSON(KEYS.FAV_KEY, list);
  }

  // ---------------------------------------------------------------------
  // Reading bookmark (علامة القراءة) — one shared spot for both scripts.
  // ---------------------------------------------------------------------
  function loadBookmarks(){
    var parsed = readJSON(KEYS.BOOKMARK_KEY, null);
    if(!parsed) return {shared: null};
    // Migration: older saved data was either a single flat {page, ts}
    // bookmark, or one kept separately per script mode ({uthmani, amiri}).
    // Either way, collapse it down to one shared spot now — picking
    // whichever of the two per-script bookmarks is more recent, so
    // upgrading never makes an existing bookmark disappear.
    if(typeof parsed.page === 'number'){
      return {shared: parsed};
    }
    if(parsed.shared){
      return {shared: parsed.shared};
    }
    var u = parsed.uthmani;
    var a = parsed.amiri;
    var chosen = u || null;
    if(a && (!u || (a.ts || 0) > (u.ts || 0))) chosen = a;
    return {shared: chosen};
  }
  function saveBookmark(bookmark){
    return writeJSON(KEYS.BOOKMARK_KEY, bookmark);
  }

  // ---------------------------------------------------------------------
  // Reminder marks (علامات التذكير الشخصية) — per-word colored markers,
  // stored per script mode (see KEYS.waqfKeyForStyle): a reminder placed
  // on the Madinah mushaf doesn't appear on the Naskh Ta'liq mushaf, since
  // the two are independent readings with independent word positions.
  // ---------------------------------------------------------------------
  function loadReminder(style){
    var key = KEYS.waqfKeyForStyle(style);
    var raw = localStorage.getItem(key);
    var marks;
    if(raw){
      marks = readJSON(key, {});
    }else{
      // One-time migration, run independently the first time EACH script
      // mode is loaded after this update: earlier versions kept a single
      // shared list under WAQF_KEY_LEGACY. Seed this mode's new,
      // independent list from that shared snapshot so existing marks
      // don't silently disappear; from this point on the two modes
      // diverge as the reader edits each separately.
      marks = readJSON(KEYS.WAQF_KEY_LEGACY, {});
    }
    // Migrate marks saved by the older single-color "waqf star" version
    // (a bare timestamp number) to the new {c, t} shape, defaulting to
    // red so nobody's existing marks silently disappear after the update.
    Object.keys(marks).forEach(function(k){
      if(typeof marks[k] === 'number'){
        marks[k] = {c: 'red', t: marks[k]};
      }
    });
    writeJSON(key, marks);
    return marks;
  }
  function saveReminder(style, marks){
    return writeJSON(KEYS.waqfKeyForStyle(style), marks);
  }
  // "حذف جميع علامات التذكير" (الإعدادات): wipes reminder marks for ONLY
  // the given script mode — the two mushafs (Uthmani/Madinah vs.
  // Indopak/Naskh) keep fully independent reminder sets, so clearing one
  // must never touch the other's marks.
  function clearRemindersForStyle(style){
    try{ localStorage.removeItem(KEYS.waqfKeyForStyle(style)); }catch(e){}
  }

  window.StorageManager = {
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadLastRead: loadLastRead,
    saveLastRead: saveLastRead,
    loadFavorites: loadFavorites,
    saveFavorites: saveFavorites,
    loadBookmarks: loadBookmarks,
    saveBookmark: saveBookmark,
    loadReminder: loadReminder,
    saveReminder: saveReminder,
    clearRemindersForStyle: clearRemindersForStyle
  };
})();
