#!/usr/bin/env node
// =============================================================================
// backup-restore-regression.js
// فحوصات النسخ الاحتياطي / الاستعادة — Madinah-only storage schema
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(__dirname, '..');

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
  eval(fs.readFileSync(path.join(root, name), 'utf8'));
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
function hasIndopakKey(){
  return Object.keys(store).some(function(k){
    return k === KEYS.LEGACY_WAQF_KEY_INDOPAK || /indopak/i.test(k);
  });
}

console.log('Section B1 — full backup structure (Madinah-only schema)');
{
  clearAll();
  SM.saveSettings({ page: 12, night: true, reciter: 'husary', fontStyle: 'uthmani' });
  SM.saveFavorites([{ page: 3, label: 'test', ts: 1 }]);
  SM.saveBookmark({ shared: { page: 7, ts: 2 } });
  SM.saveReminder('uthmani', { '2:1:0': { c: 'red', t: 1 } });

  const backup = SM.buildFullBackup();
  check('type is full-backup', backup.type === 'full-backup');
  check('has schemaVersion 1', backup.schemaVersion === 1);
  check('app name set', backup.app === 'مصحف الركوع');
  check('has exportedAt', typeof backup.exportedAt === 'string' && backup.exportedAt.length > 0);
  check('settings present', backup.settings && backup.settings.page === 12 && backup.settings.night === true);
  check('settings fontStyle uthmani', backup.settings.fontStyle === 'uthmani');
  check('no fontSizeIndopak in backup settings', backup.settings.fontSizeIndopak === undefined);
  check('favorites present', Array.isArray(backup.favorites) && backup.favorites.length === 1);
  check('bookmark present', backup.bookmark && backup.bookmark.shared && backup.bookmark.shared.page === 7);
  check('reminders uthmani present', backup.reminders && backup.reminders.uthmani && backup.reminders.uthmani['2:1:0']);
  check('no reminders.indopak in new backup', backup.reminders.indopak === undefined);
  check('no cache field', backup.cache === undefined && backup.runtime === undefined);
  check('no indopak localStorage key after save', !hasIndopakKey());
}

console.log('Section B2 — full restore after wipe');
{
  clearAll();
  SM.saveSettings({ page: 20, night: true, reciter: 'minshawi', fontSizeUthmani: 32 });
  SM.saveFavorites([{ page: 5, label: 'fav', ts: 9 }]);
  SM.saveBookmark({ shared: { page: 9, ts: 3 } });
  SM.saveReminder('uthmani', { '1:1:0': { c: 'green', t: 1 } });
  const backup = SM.buildFullBackup();
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
  check('no indopak key after restore', !hasIndopakKey());
}

console.log('Section B3 — partial backup does not wipe missing sections');
{
  clearAll();
  SM.saveSettings({ page: 1, night: false });
  SM.saveFavorites([{ page: 2, label: 'keep-me', ts: 1 }]);
  SM.saveBookmark({ shared: { page: 4, ts: 1 } });
  SM.saveReminder('uthmani', { '3:1:0': { c: 'red', t: 1 } });
  const partial = {
    app: 'مصحف الركوع', type: 'full-backup', schemaVersion: 1,
    settings: { page: 99, night: true }
  };
  const result = SM.applyBackupPayload(partial);
  check('partial restore ok', result.ok === true, result.error);
  check('settings replaced', SM.loadSettings().page === 99);
  check('favorites preserved', SM.loadFavorites().length === 1);
  check('bookmark preserved', SM.loadBookmarks().shared && SM.loadBookmarks().shared.page === 4);
  check('reminders preserved', SM.loadReminder('uthmani')['3:1:0']);
}

console.log('Section B4 — legacy reminder-marks import (uthmani only)');
{
  clearAll();
  SM.saveReminder('uthmani', { '1:1:0': { c: 'red', t: 1 } });
  const legacy = {
    app: 'مصحف الركوع', type: 'reminder-marks',
    marks: {
      uthmani: { '1:2:0': { c: 'green', t: 2 } },
      indopak: { '2:4:0': { c: 'green', t: 3 } }
    }
  };
  const result = SM.applyBackupPayload(legacy);
  check('legacy import ok', result.ok === true, result.error);
  check('legacy merge keeps old uthmani', SM.loadReminder('uthmani')['1:1:0']);
  check('legacy merge adds new uthmani', SM.loadReminder('uthmani')['1:2:0'] && SM.loadReminder('uthmani')['1:2:0'].c === 'green');
  check('legacy indopak marks ignored (not merged)', !SM.loadReminder('uthmani')['2:4:0']);
  check('no indopak key after legacy import', !hasIndopakKey());
}

console.log('Section B5 — invalid / unsupported payloads');
{
  clearAll();
  check('null rejected', SM.applyBackupPayload(null).ok === false);
  check('empty object rejected', SM.applyBackupPayload({}).ok === false);
  check('garbage type rejected', SM.applyBackupPayload({ type: 'nope' }).ok === false);
  check('bad JSON shape rejected', SM.applyBackupPayload('x').ok === false);
  check('unsupported schemaVersion rejected', SM.applyBackupPayload({
    type: 'full-backup', schemaVersion: 99, app: 'مصحف الركوع'
  }).ok === false);
  check('unsupported schemaVersion apply fails', SM.applyBackupPayload({
    type: 'full-backup', schemaVersion: 99, app: 'مصحف الركوع', settings: {}
  }).ok === false);
  check('missing schemaVersion rejected', SM.applyBackupPayload({
    type: 'full-backup', app: 'مصحف الركوع'
  }).ok === false);
  check('invalid favorites rejected', SM.applyBackupPayload({
    type: 'full-backup', schemaVersion: 1, app: 'مصحف الركوع', favorites: 'nope'
  }).ok === false);
}

console.log('Section B6 — rollback on write failure');
{
  clearAll();
  SM.saveSettings({ page: 50 });
  SM.saveFavorites([{ page: 1, label: 'safe', ts: 1 }]);
  const realSet = global.localStorage.setItem.bind(global.localStorage);
  global.localStorage.setItem = function(k, v){
    if(k === KEYS.FAV_KEY) throw new Error('quota');
    return realSet(k, v);
  };
  const backup = {
    app: 'مصحف الركوع', type: 'full-backup', schemaVersion: 1,
    settings: { page: 1 },
    favorites: [{ page: 9, label: 'should-not-stick', ts: 2 }]
  };
  const result = SM.applyBackupPayload(backup);
  global.localStorage.setItem = realSet;
  check('failed apply reports not ok', result.ok === false);
  check('settings rolled back', SM.loadSettings().page === 50);
  check('favorites rolled back', SM.loadFavorites().length === 1 && SM.loadFavorites()[0].label === 'safe');
}

console.log('Section B7 — factory reset');
{
  clearAll();
  SM.saveSettings({ page: 40, night: true, reciter: 'husary', fontSizeUthmani: 36 });
  SM.saveFavorites([{ page: 2, label: 'x', ts: 1 }]);
  SM.saveBookmark({ shared: { page: 11, ts: 1 } });
  SM.saveReminder('uthmani', { '1:1:0': { c: 'red', t: 1 } });
  // plant legacy key
  global.localStorage.setItem(KEYS.LEGACY_WAQF_KEY_INDOPAK, JSON.stringify({ '9:9:0': { c: 'blue', t: 1 } }));

  const keys = SM.allUserDataKeys();
  check('inventory includes settings key', keys.indexOf(KEYS.STORAGE_KEY) !== -1);
  check('inventory includes favorites key', keys.indexOf(KEYS.FAV_KEY) !== -1);
  check('inventory includes bookmark key', keys.indexOf(KEYS.BOOKMARK_KEY) !== -1);
  check('inventory includes uthmani reminder key', keys.indexOf(KEYS.waqfKey()) !== -1);

  const result = SM.factoryReset();
  check('factory reset ok', result.ok === true, result.error);
  const s = SM.loadSettings();
  check('settings back to defaults page 0', s.page === 0);
  check('settings night default false', s.night === false);
  check('settings reciter default', s.reciter === 'abdulbasit');
  check('favorites empty', SM.loadFavorites().length === 0);
  check('bookmark cleared', !SM.loadBookmarks().shared);
  check('uthmani reminders empty', Object.keys(SM.loadReminder('uthmani')).length === 0);
  check('legacy indopak key cleared', global.localStorage.getItem(KEYS.LEGACY_WAQF_KEY_INDOPAK) === null);

  SM.saveSettings({ page: 15 });
  SM.saveFavorites([{ page: 1, label: 'after-reset', ts: 1 }]);
  const backup = SM.buildFullBackup();
  SM.factoryReset();
  const restored = SM.applyBackupPayload(backup);
  check('restore after factory reset ok', restored.ok === true, restored.error);
  check('settings restored after reset cycle', SM.loadSettings().page === 15);
  check('favorites restored after reset cycle', SM.loadFavorites().length === 1 && SM.loadFavorites()[0].label === 'after-reset');
}

console.log('Section B8 — legacy dual-script backup restore (migration)');
{
  clearAll();
  const oldBackup = {
    app: 'مصحف الركوع', type: 'full-backup', schemaVersion: 1,
    settings: {
      page: 8, fontStyle: 'amiri', fontSizeUthmani: 28, fontSizeIndopak: 30,
      showWaqfMarksUthmani: true, showWaqfMarksIndopak: false,
      furthestUthmani: 5, furthestIndopak: 9, lastPageIndopak: 3
    },
    favorites: [{ page: 1, label: 'f', ts: 1 }],
    bookmark: { shared: { page: 2, ts: 1 } },
    reminders: {
      uthmani: { '1:1:0': { c: 'red', t: 1 } },
      indopak: { '2:2:0': { c: 'blue', t: 2 } }
    }
  };
  const result = SM.applyBackupPayload(oldBackup);
  check('old amiri backup restore ok', result.ok === true, result.error);
  const s = SM.loadSettings();
  check('fontStyle migrated to uthmani', s.fontStyle === 'uthmani');
  check('no fontSizeIndopak in loaded settings', s.fontSizeIndopak === undefined);
  check('no furthestIndopak in loaded settings', s.furthestIndopak === undefined);
  check('uthmani reminders kept', SM.loadReminder()['1:1:0'] && SM.loadReminder()['1:1:0'].c === 'red');
  check('indopak reminders not merged into uthmani', !SM.loadReminder()['2:2:0']);
  check('favorites ok', SM.loadFavorites().length === 1);
  check('bookmark ok', SM.loadBookmarks().shared && SM.loadBookmarks().shared.page === 2);
  check('no indopak storage key after old backup restore', !hasIndopakKey());

  // idempotent second restore
  const result2 = SM.applyBackupPayload(oldBackup);
  check('second restore ok', result2.ok === true, result2.error);
  check('uthmani reminders still single set', Object.keys(SM.loadReminder()).length === 1);
}

console.log('Section B9 — startup migration cleans planted legacy keys');
{
  clearAll();
  SM.saveSettings({ page: 3, fontStyle: 'uthmani' });
  global.localStorage.setItem(KEYS.LEGACY_WAQF_KEY_INDOPAK, JSON.stringify({ x: 1 }));
  // force re-run migration by clearing migration marker
  global.localStorage.removeItem(KEYS.STORAGE_MIGRATION_KEY);
  SM.loadSettings();
  check('legacy key removed on startup migration', global.localStorage.getItem(KEYS.LEGACY_WAQF_KEY_INDOPAK) === null);
  // second load still fine
  SM.loadSettings();
  check('migration idempotent', global.localStorage.getItem(KEYS.LEGACY_WAQF_KEY_INDOPAK) === null);
}

console.log('\n==== backup-restore-regression: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
