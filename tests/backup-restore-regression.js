#!/usr/bin/env node
// =============================================================================
// backup-restore-regression.js
// فحوصات النسخ الاحتياطي / الاستعادة — تُشغَّل من جذر المشروع:
//   node tests/backup-restore-regression.js
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

// ---- mock browser globals ----
const store = Object.create(null);
global.localStorage = {
  getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v){ store[k] = String(v); },
  removeItem(k){ delete store[k]; },
  clear(){ Object.keys(store).forEach(k => delete store[k]); },
  key(i){ return Object.keys(store)[i] || null; },
  get length(){ return Object.keys(store).length; }
};
global.window = global;
global.self = global;
global.UI = { showToast: function(){} };

function load(name){
  const code = fs.readFileSync(path.join(root, name), 'utf8');
  eval(code);
}

load('constants.js');
load('storage-manager.js');

const SM = global.StorageManager;
const KEYS = global.MUSHAF_KEYS;

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function clearAll(){ global.localStorage.clear(); }

console.log('Section B1 — full backup structure');
{
  clearAll();
  SM.saveSettings({ page: 12, night: true, reciter: 'husary', fontStyle: 'uthmani' });
  SM.saveFavorites([{ page: 3, label: 'test', ts: 1 }]);
  SM.saveBookmark({ shared: { page: 7, ts: 2 } });
  SM.saveReminder('uthmani', { '2:1:0': { c: 'red', t: 1 } });
  SM.saveReminder('indopak', { '2:1:0': { c: 'blue', t: 2 } });

  const backup = SM.buildFullBackup();
  check('type is full-backup', backup.type === 'full-backup');
  check('has schemaVersion 1', backup.schemaVersion === 1);
  check('app name set', backup.app === 'مصحف الركوع');
  check('has exportedAt', typeof backup.exportedAt === 'string' && backup.exportedAt.length > 0);
  check('settings present', backup.settings && backup.settings.page === 12 && backup.settings.night === true);
  check('favorites present', Array.isArray(backup.favorites) && backup.favorites.length === 1);
  check('bookmark present', backup.bookmark && backup.bookmark.shared && backup.bookmark.shared.page === 7);
  check('reminders both modes', backup.reminders && backup.reminders.uthmani['2:1:0'] && backup.reminders.indopak['2:1:0']);
  check('no cache field', backup.cache === undefined && backup.runtime === undefined);
}

console.log('Section B2 — full restore after wipe (simulates Site Data delete)');
{
  clearAll();
  SM.saveSettings({ page: 20, night: true, reciter: 'minshawi', fontSizeUthmani: 32 });
  SM.saveFavorites([{ page: 5, label: 'fav', ts: 9 }]);
  SM.saveBookmark({ shared: { page: 9, ts: 3 } });
  SM.saveReminder('uthmani', { '1:1:0': { c: 'green', t: 1 } });
  SM.saveReminder('indopak', { '1:1:0': { c: 'brown', t: 1 } });
  const backup = SM.buildFullBackup();

  // Wipe like Delete Site Data
  clearAll();
  check('storage empty after wipe', global.localStorage.length === 0);

  const result = SM.applyBackupPayload(backup);
  check('restore ok', result.ok === true, result.error);
  const settings = SM.loadSettings();
  check('settings restored page', settings.page === 20);
  check('settings restored night', settings.night === true);
  check('settings restored reciter', settings.reciter === 'minshawi');
  check('favorites restored', SM.loadFavorites().length === 1 && SM.loadFavorites()[0].page === 5);
  check('bookmark restored', SM.loadBookmarks().shared && SM.loadBookmarks().shared.page === 9);
  check('uthmani reminders restored', SM.loadReminder('uthmani')['1:1:0'] && SM.loadReminder('uthmani')['1:1:0'].c === 'green');
  check('indopak reminders restored', SM.loadReminder('indopak')['1:1:0'] && SM.loadReminder('indopak')['1:1:0'].c === 'brown');
}

console.log('Section B3 — partial backup does not wipe missing sections');
{
  clearAll();
  SM.saveSettings({ page: 1, night: false });
  SM.saveFavorites([{ page: 2, label: 'keep-me', ts: 1 }]);
  SM.saveBookmark({ shared: { page: 4, ts: 1 } });
  SM.saveReminder('uthmani', { '3:1:0': { c: 'red', t: 1 } });

  const partial = {
    app: 'مصحف الركوع',
    type: 'full-backup',
    schemaVersion: 1,
    settings: { page: 99, night: true, reciter: 'husary' }
    // no favorites, bookmark, reminders
  };
  const result = SM.applyBackupPayload(partial);
  check('partial restore ok', result.ok === true, result.error);
  check('settings replaced', SM.loadSettings().page === 99 && SM.loadSettings().night === true);
  check('favorites preserved', SM.loadFavorites().length === 1 && SM.loadFavorites()[0].label === 'keep-me');
  check('bookmark preserved', SM.loadBookmarks().shared && SM.loadBookmarks().shared.page === 4);
  check('reminders preserved', SM.loadReminder('uthmani')['3:1:0'] && SM.loadReminder('uthmani')['3:1:0'].c === 'red');
}

console.log('Section B4 — legacy reminder-marks import');
{
  clearAll();
  SM.saveReminder('uthmani', { '2:2:0': { c: 'red', t: 1 } });
  const legacy = {
    app: 'مصحف الركوع',
    type: 'reminder-marks',
    marks: {
      uthmani: { '2:3:0': { c: 'blue', t: 2 } },
      indopak: { '2:4:0': { c: 'green', t: 3 } }
    }
  };
  const result = SM.applyBackupPayload(legacy);
  check('legacy import ok', result.ok === true, result.error);
  const u = SM.loadReminder('uthmani');
  check('legacy merge keeps old', u['2:2:0'] && u['2:2:0'].c === 'red');
  check('legacy merge adds new uthmani', u['2:3:0'] && u['2:3:0'].c === 'blue');
  check('legacy adds indopak', SM.loadReminder('indopak')['2:4:0'] && SM.loadReminder('indopak')['2:4:0'].c === 'green');
}

console.log('Section B5 — invalid / unsupported payloads');
{
  check('null rejected', SM.validateBackupPayload(null).ok === false);
  check('empty object rejected', SM.validateBackupPayload({}).ok === false);
  check('garbage type rejected', SM.validateBackupPayload({ type: 'something-else' }).ok === false);
  check('bad JSON shape rejected', SM.applyBackupPayload('not-object').ok === false);

  const badSchema = {
    app: 'مصحف الركوع',
    type: 'full-backup',
    schemaVersion: 99,
    settings: {}
  };
  check('unsupported schemaVersion rejected', SM.validateBackupPayload(badSchema).ok === false);
  check('unsupported schemaVersion apply fails', SM.applyBackupPayload(badSchema).ok === false);

  const missingSchema = {
    app: 'مصحف الركوع',
    type: 'full-backup',
    settings: {}
  };
  check('missing schemaVersion rejected', SM.validateBackupPayload(missingSchema).ok === false);

  const invalidFav = {
    app: 'مصحف الركوع',
    type: 'full-backup',
    schemaVersion: 1,
    favorites: { not: 'array' }
  };
  check('invalid favorites rejected', SM.validateBackupPayload(invalidFav).ok === false);
}

console.log('Section B6 — rollback leaves storage consistent on write failure');
{
  clearAll();
  SM.saveSettings({ page: 50 });
  SM.saveFavorites([{ page: 1, label: 'safe', ts: 1 }]);

  // Force a write failure after settings are written by monkey-patching setItem.
  const realSet = global.localStorage.setItem.bind(global.localStorage);
  let hits = 0;
  global.localStorage.setItem = function(k, v){
    hits++;
    // Fail on the favorites key write (second user-data write in apply plan
    // when both settings and favorites are present).
    if(k === KEYS.FAV_KEY){
      throw new Error('quota simulated');
    }
    return realSet(k, v);
  };

  const backup = {
    app: 'مصحف الركوع',
    type: 'full-backup',
    schemaVersion: 1,
    settings: { page: 999 },
    favorites: [{ page: 8, label: 'should-not-stick', ts: 2 }]
  };
  const result = SM.applyBackupPayload(backup);
  global.localStorage.setItem = realSet;

  check('failed apply reports not ok', result.ok === false);
  check('settings rolled back', SM.loadSettings().page === 50);
  check('favorites rolled back', SM.loadFavorites().length === 1 && SM.loadFavorites()[0].label === 'safe');
}

console.log('Section B7 — factory reset clears all user data keys');
{
  clearAll();
  SM.saveSettings({ page: 40, night: true, reciter: 'husary', fontSizeUthmani: 36 });
  SM.saveFavorites([{ page: 2, label: 'x', ts: 1 }]);
  SM.saveBookmark({ shared: { page: 11, ts: 1 } });
  SM.saveReminder('uthmani', { '1:1:0': { c: 'red', t: 1 } });
  SM.saveReminder('indopak', { '1:1:0': { c: 'blue', t: 1 } });

  const keys = SM.allUserDataKeys();
  check('inventory includes settings key', keys.indexOf(KEYS.STORAGE_KEY) !== -1);
  check('inventory includes favorites key', keys.indexOf(KEYS.FAV_KEY) !== -1);
  check('inventory includes bookmark key', keys.indexOf(KEYS.BOOKMARK_KEY) !== -1);
  check('inventory includes both reminder keys', keys.indexOf(KEYS.waqfKeyForStyle('uthmani')) !== -1 && keys.indexOf(KEYS.waqfKeyForStyle('indopak')) !== -1);

  const result = SM.factoryReset();
  check('factory reset ok', result.ok === true, result.error);
  const s = SM.loadSettings();
  check('settings back to defaults page 0', s.page === 0);
  check('settings night default false', s.night === false);
  check('settings reciter default', s.reciter === 'abdulbasit');
  check('favorites empty', SM.loadFavorites().length === 0);
  check('bookmark cleared', !SM.loadBookmarks().shared);
  check('uthmani reminders empty', Object.keys(SM.loadReminder('uthmani')).length === 0);
  check('indopak reminders empty', Object.keys(SM.loadReminder('indopak')).length === 0);

  // Backup/restore still works after a factory reset
  SM.saveSettings({ page: 15 });
  SM.saveFavorites([{ page: 1, label: 'after-reset', ts: 1 }]);
  const backup = SM.buildFullBackup();
  SM.factoryReset();
  const restored = SM.applyBackupPayload(backup);
  check('restore after factory reset ok', restored.ok === true, restored.error);
  check('settings restored after reset cycle', SM.loadSettings().page === 15);
  check('favorites restored after reset cycle', SM.loadFavorites().length === 1 && SM.loadFavorites()[0].label === 'after-reset');
}

console.log('\n==== backup-restore-regression: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
