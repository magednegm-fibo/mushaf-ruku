'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'storage-manager.js'), 'utf8');

function bootStorageManager(options = {}) {
  const data = new Map();
  let writes = 0;
  let toasts = [];
  const storage = {
    getItem(key) {
      if (options.failReads) throw new Error('Storage access denied');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      writes++;
      if (options.quotaExceeded) {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      data.set(String(key), String(value));
    },
    removeItem(key) {
      if (options.failRemoves) throw new Error('Storage access denied');
      data.delete(key);
    },
    key(index) { return Array.from(data.keys())[index] || null; },
    get length() { return data.size; }
  };
  const window = {
    MUSHAF_KEYS: {
      STORAGE_KEY: 'juzamma_v1',
      FAV_KEY: 'favorites',
      BOOKMARK_KEY: 'bookmark',
      WAQF_KEY_LEGACY: 'waqf',
      LEGACY_WAQF_KEY_INDOPAK: 'waqf_indopak',
      STORAGE_MIGRATION_KEY: 'migration',
      PRAYER_KEY: 'prayer',
      RADIO_KEY: 'radio',
      waqfKey: () => 'waqf_uthmani',
      waqfKeyForStyle: () => 'waqf_uthmani'
    },
    UI: { showToast(message) { toasts.push(message); } }
  };
  vm.runInNewContext(source, { window, localStorage: storage, Date, JSON, Object, Array, String, Error });
  return { manager: window.StorageManager, data, toasts, get writes() { return writes; } };
}

test('QuotaExceededError is contained and saveSettings reports failure', () => {
  const env = bootStorageManager({ quotaExceeded: true });
  const result = env.manager.saveSettings({ page: 12, night: true });
  assert.equal(result, false);
  assert.equal(env.toasts.length, 1);
  assert.match(env.toasts[0], /التخزين ممتلئة/);
});

test('repeated quota failures are throttled instead of spamming notifications', () => {
  const env = bootStorageManager({ quotaExceeded: true });
  env.manager.saveSettings({ page: 1 });
  env.manager.saveSettings({ page: 2 });
  env.manager.saveFavorites(['x']);
  assert.equal(env.toasts.length, 1);
});

test('storage read failure falls back to safe defaults without throwing', () => {
  const env = bootStorageManager({ failReads: true, quotaExceeded: true });
  assert.doesNotThrow(() => {
    const settings = env.manager.loadSettings();
    assert.equal(settings.fontStyle, 'uthmani');
    assert.equal(settings.page, 0);
    assert.deepEqual(Array.from(env.manager.loadFavorites()), []);
  });
});

test('successful storage writes remain successful and do not notify', () => {
  const env = bootStorageManager();
  assert.equal(env.manager.saveSettings({ page: 7, night: false }), true);
  assert.equal(env.toasts.length, 0);
  assert.ok(env.data.has('juzamma_v1'));
});
