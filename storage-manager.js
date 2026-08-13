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
      if(!raw) return fallback;
      var parsed = JSON.parse(raw);
      // A stored literal "null"/"undefined" is valid JSON — JSON.parse
      // succeeds and returns null/undefined rather than throwing, so the
      // catch below never sees it. Treat that the same as a missing/failed
      // read: fall back, instead of handing callers a null they don't
      // expect (e.g. Object.keys(null) or null.map(...) further downstream).
      return (parsed === null || parsed === undefined) ? fallback : parsed;
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
      fontStyle:'uthmani', showWaqfMarksUthmani:false, showWaqfMarksIndopak:false,
      colorCodingEnabled:true,
      pinchZoomEnabled:true, keepScreenAwake:false, reciter:'abdulbasit',
      autoScrollEnabled:true, recitationRepeatCount:1, rukuRepeatCount:1, playbackRate:1,
      displayScope:'all', recitationScope:'ruku'
    };
    var result = Object.assign({}, DEFAULTS, readJSON(KEYS.STORAGE_KEY, {}));

    // Migration: "نطاق العرض" replaces the old single juzOnlyMode toggle
    // (كان في صفحة فهرس الأجزاء) with a 4-option scope — carry an old
    // "on" value over as the equivalent 'juz' scope so upgrading doesn't
    // silently reset a reader's chosen restriction back to 'all'.
    if(result.juzOnlyMode !== undefined){
      if(result.displayScope === 'all' && result.juzOnlyMode){
        result.displayScope = 'juz';
      }
      delete result.juzOnlyMode;
    }

    // Migration: "نطاق التلاوة" used to offer 'ruku'/'surah'/'juz' directly;
    // it now only offers 'ruku'/'displayScope' (the latter following
    // whatever "نطاق العرض" is set to). Carry an old 'surah'/'juz' choice
    // over as 'displayScope' + force displayScope to match, so an existing
    // reader's "زر التلاوة يكمل للسورة/الجزء" behavior doesn't silently
    // change on upgrade.
    if(result.recitationScope === 'surah' || result.recitationScope === 'juz'){
      result.displayScope = result.recitationScope;
      result.recitationScope = 'displayScope';
    }

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
    // Unify: font size and waqf-mark visibility are shared across both
    // script modes again (1.0.385+). Prefer the Uthmani-stored values as
    // canonical when the pair differs (legacy per-mode divergence).
    result.fontSizeIndopak = result.fontSizeUthmani;
    result.showWaqfMarksIndopak = result.showWaqfMarksUthmani;
    // Migration: the مواضع اختلاف روضة الحفاظ toggle (old keys
    // `showMadMunfasil` / `showMadMunfasilUthmani`) was removed — the
    // coloring is now always on, unconditionally, in both script modes.
    // Drop any leftover stored values from older versions so they don't
    // linger unused in the saved state.
    delete result.showMadMunfasil;
    delete result.showMadMunfasilUthmani;
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
  // Wipe reminder marks for one script mode only (low-level helper).
  function clearRemindersForStyle(style){
    try{ localStorage.removeItem(KEYS.waqfKeyForStyle(style)); }catch(e){}
  }

  // User-data keys managed by this module (inventory for factory reset /
  // backup). Does NOT include Service Worker Cache or app static assets.
  //   KEYS.STORAGE_KEY          — settings + reading position/progress
  //   KEYS.FAV_KEY              — favorites list
  //   KEYS.BOOKMARK_KEY         — reading bookmark
  //   KEYS.waqfKeyForStyle(*)   — reminder marks per script
  //   KEYS.WAQF_KEY_LEGACY      — pre-split reminder marks (migration only)
  function allUserDataKeys(){
    return [
      KEYS.STORAGE_KEY,
      KEYS.FAV_KEY,
      KEYS.BOOKMARK_KEY,
      KEYS.waqfKeyForStyle('uthmani'),
      KEYS.waqfKeyForStyle('indopak'),
      KEYS.WAQF_KEY_LEGACY
    ];
  }

  // Factory reset: clear every user-data key so the next load* call
  // returns defaults / empty. Atomic via snapshot + rollback on failure.
  // Does not touch Cache Storage, SW, or static app files.
  function factoryReset(){
    var snap = snapshotAllUserData();
    // Also capture legacy key if present (not part of snapshotAllUserData).
    var legacyRaw = null;
    try{ legacyRaw = localStorage.getItem(KEYS.WAQF_KEY_LEGACY); }catch(e){}
    try{
      var keys = allUserDataKeys();
      for(var i = 0; i < keys.length; i++){
        try{ localStorage.removeItem(keys[i]); }
        catch(e){ throw e; }
      }
      // Verify reads come back empty/default-shaped.
      if(loadFavorites().length !== 0) throw new Error('favorites not cleared');
      if(loadBookmarks().shared) throw new Error('bookmark not cleared');
      return { ok: true };
    }catch(e){
      restoreSnapshot(snap);
      try{
        if(legacyRaw === null || legacyRaw === undefined){
          localStorage.removeItem(KEYS.WAQF_KEY_LEGACY);
        }else{
          localStorage.setItem(KEYS.WAQF_KEY_LEGACY, legacyRaw);
        }
      }catch(e2){ /* best-effort */ }
      return { ok: false, error: (e && e.message) ? e.message : 'factory reset failed' };
    }
  }

  // ---------------------------------------------------------------------
  // Full backup / restore (ملف JSON مستقل عن Browser Storage)
  // ---------------------------------------------------------------------
  // schemaVersion 1: settings + favorites + bookmark + reminders (both
  // script modes). Cache / SW / runtime state are intentionally excluded.
  // Restore policy: only sections present in the file replace current
  // data; missing sections leave existing data untouched.
  var BACKUP_SCHEMA_VERSION = 1;
  var BACKUP_APP_NAME = 'مصحف الركوع';

  function buildFullBackup(){
    // Read raw keys (not loadSettings) so we export exactly what is stored,
    // without re-applying migration defaults into the file.
    return {
      app: BACKUP_APP_NAME,
      type: 'full-backup',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings: readJSON(KEYS.STORAGE_KEY, {}),
      favorites: readJSON(KEYS.FAV_KEY, []),
      bookmark: readJSON(KEYS.BOOKMARK_KEY, null),
      reminders: {
        uthmani: readJSON(KEYS.waqfKeyForStyle('uthmani'), {}),
        indopak: readJSON(KEYS.waqfKeyForStyle('indopak'), {})
      }
    };
  }

  // Validate a parsed JSON object. Returns
  //   { ok:true, kind:'full'|'reminders', data }
  // or { ok:false, error:'...' }
  function validateBackupPayload(data){
    if(!data || typeof data !== 'object'){
      return { ok:false, error:'bad format' };
    }
    var type = data.type;
    // Legacy reminder-only exports (before full-backup) — no schemaVersion.
    if(type === 'reminder-marks' || (!type && data.marks)){
      var marks = data.marks || data;
      if(!marks || typeof marks !== 'object'){
        return { ok:false, error:'bad format' };
      }
      return { ok:true, kind:'reminders', data: data };
    }
    if(type === 'full-backup'){
      if(data.app && data.app !== BACKUP_APP_NAME){
        return { ok:false, error:'unknown app' };
      }
      if(typeof data.schemaVersion !== 'number'){
        return { ok:false, error:'missing schemaVersion' };
      }
      if(data.schemaVersion > BACKUP_SCHEMA_VERSION || data.schemaVersion < 1){
        return { ok:false, error:'unsupported schemaVersion' };
      }
      if(data.settings !== undefined && (typeof data.settings !== 'object' || data.settings === null || Array.isArray(data.settings))){
        return { ok:false, error:'invalid settings' };
      }
      if(data.favorites !== undefined && !Array.isArray(data.favorites)){
        return { ok:false, error:'invalid favorites' };
      }
      if(data.bookmark !== undefined && data.bookmark !== null && typeof data.bookmark !== 'object'){
        return { ok:false, error:'invalid bookmark' };
      }
      if(data.reminders !== undefined){
        if(typeof data.reminders !== 'object' || data.reminders === null || Array.isArray(data.reminders)){
          return { ok:false, error:'invalid reminders' };
        }
        if(data.reminders.uthmani !== undefined && (typeof data.reminders.uthmani !== 'object' || data.reminders.uthmani === null || Array.isArray(data.reminders.uthmani))){
          return { ok:false, error:'invalid reminders.uthmani' };
        }
        if(data.reminders.indopak !== undefined && (typeof data.reminders.indopak !== 'object' || data.reminders.indopak === null || Array.isArray(data.reminders.indopak))){
          return { ok:false, error:'invalid reminders.indopak' };
        }
      }
      return { ok:true, kind:'full', data: data };
    }
    // Unrecognised top-level shape: treat flat mark map as legacy reminders
    // only when it looks like { "2:1:0": {c,t} | number, ... }.
    if(!type){
      var keys = Object.keys(data);
      if(keys.length && keys.every(function(k){
        return k.indexOf(':') !== -1 || k === 'uthmani' || k === 'indopak';
      })){
        return { ok:true, kind:'reminders', data: { marks: data } };
      }
    }
    return { ok:false, error:'unsupported type' };
  }

  function snapshotAllUserData(){
    return {
      settings: readJSON(KEYS.STORAGE_KEY, {}),
      favorites: readJSON(KEYS.FAV_KEY, []),
      bookmarkRaw: localStorage.getItem(KEYS.BOOKMARK_KEY),
      remindersUthmani: readJSON(KEYS.waqfKeyForStyle('uthmani'), {}),
      remindersIndopak: readJSON(KEYS.waqfKeyForStyle('indopak'), {})
    };
  }

  function restoreSnapshot(snap){
    writeJSON(KEYS.STORAGE_KEY, snap.settings);
    writeJSON(KEYS.FAV_KEY, snap.favorites);
    try{
      if(snap.bookmarkRaw === null || snap.bookmarkRaw === undefined){
        localStorage.removeItem(KEYS.BOOKMARK_KEY);
      }else{
        localStorage.setItem(KEYS.BOOKMARK_KEY, snap.bookmarkRaw);
      }
    }catch(e){ /* best-effort rollback */ }
    writeJSON(KEYS.waqfKeyForStyle('uthmani'), snap.remindersUthmani);
    writeJSON(KEYS.waqfKeyForStyle('indopak'), snap.remindersIndopak);
  }

  // Apply a validated full-backup payload. Replace-if-present only.
  // On any write failure, rolls back to the pre-apply snapshot.
  function applyFullBackup(data){
    var validation = validateBackupPayload(data);
    if(!validation.ok || validation.kind !== 'full'){
      return { ok:false, error: validation.error || 'not a full backup' };
    }
    var src = validation.data;
    var plan = {};
    if(src.settings !== undefined) plan.settings = src.settings;
    if(src.favorites !== undefined) plan.favorites = src.favorites;
    if(src.bookmark !== undefined) plan.bookmark = src.bookmark;
    if(src.reminders !== undefined){
      plan.reminders = {
        uthmani: (src.reminders.uthmani !== undefined) ? src.reminders.uthmani : undefined,
        indopak: (src.reminders.indopak !== undefined) ? src.reminders.indopak : undefined
      };
    }

    var snap = snapshotAllUserData();
    try{
      if(plan.settings !== undefined){
        if(!writeJSON(KEYS.STORAGE_KEY, plan.settings)) throw new Error('settings write failed');
      }
      if(plan.favorites !== undefined){
        if(!writeJSON(KEYS.FAV_KEY, plan.favorites)) throw new Error('favorites write failed');
      }
      if(plan.bookmark !== undefined){
        if(plan.bookmark === null){
          try{ localStorage.removeItem(KEYS.BOOKMARK_KEY); }catch(e){ throw e; }
        }else{
          if(!writeJSON(KEYS.BOOKMARK_KEY, plan.bookmark)) throw new Error('bookmark write failed');
        }
      }
      if(plan.reminders){
        if(plan.reminders.uthmani !== undefined){
          if(!writeJSON(KEYS.waqfKeyForStyle('uthmani'), plan.reminders.uthmani)) throw new Error('reminders.uthmani write failed');
        }
        if(plan.reminders.indopak !== undefined){
          if(!writeJSON(KEYS.waqfKeyForStyle('indopak'), plan.reminders.indopak)) throw new Error('reminders.indopak write failed');
        }
      }
      return { ok:true, applied: plan };
    }catch(e){
      restoreSnapshot(snap);
      return { ok:false, error: (e && e.message) ? e.message : 'apply failed' };
    }
  }

  // Apply legacy reminder-marks (merge into each present mode), same
  // semantics as the old importMarksFromFile path.
  function applyReminderMarksBackup(data){
    var validation = validateBackupPayload(data);
    if(!validation.ok || validation.kind !== 'reminders'){
      return { ok:false, error: validation.error || 'not a reminders backup' };
    }
    var incoming = (validation.data.marks) ? validation.data.marks : validation.data;
    if(!incoming || typeof incoming !== 'object'){
      return { ok:false, error:'bad format' };
    }
    var snap = snapshotAllUserData();
    try{
      var isPerMode = ('uthmani' in incoming) || ('indopak' in incoming);
      function mergeInto(style, src){
        if(!src || typeof src !== 'object') return;
        var current = readJSON(KEYS.waqfKeyForStyle(style), {});
        Object.keys(src).forEach(function(k){
          var v = src[k];
          current[k] = (typeof v === 'number') ? {c: 'red', t: v} : v;
        });
        if(!writeJSON(KEYS.waqfKeyForStyle(style), current)) throw new Error('reminder write failed');
      }
      if(isPerMode){
        mergeInto('uthmani', incoming.uthmani || {});
        mergeInto('indopak', incoming.indopak || {});
      }else{
        // Flat legacy map: merge into both modes so nothing is silently
        // lost when the active mode is unknown at the storage layer.
        mergeInto('uthmani', incoming);
        mergeInto('indopak', incoming);
      }
      return { ok:true, applied: { reminders: true } };
    }catch(e){
      restoreSnapshot(snap);
      return { ok:false, error: (e && e.message) ? e.message : 'apply failed' };
    }
  }

  function applyBackupPayload(data){
    var validation = validateBackupPayload(data);
    if(!validation.ok) return validation;
    if(validation.kind === 'full') return applyFullBackup(data);
    if(validation.kind === 'reminders') return applyReminderMarksBackup(data);
    return { ok:false, error:'unsupported type' };
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
    clearRemindersForStyle: clearRemindersForStyle,
    factoryReset: factoryReset,
    allUserDataKeys: allUserDataKeys,
    buildFullBackup: buildFullBackup,
    validateBackupPayload: validateBackupPayload,
    applyFullBackup: applyFullBackup,
    applyReminderMarksBackup: applyReminderMarksBackup,
    applyBackupPayload: applyBackupPayload,
    BACKUP_SCHEMA_VERSION: BACKUP_SCHEMA_VERSION
  };
})();
