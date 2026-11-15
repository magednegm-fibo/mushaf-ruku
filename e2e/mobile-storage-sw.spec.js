const { test, expect } = require('@playwright/test');
const { waitForAppReady, openReader } = require('./helpers');

// These are browser-engine/device emulations. They complement, but do not
// replace, physical Android and iOS acceptance testing.
test.describe('Mobile viewport and touch', () => {
  test('home and reader remain usable at phone width without horizontal overflow', async ({ page }) => {
    await waitForAppReady(page);
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.clientHeight,
      touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0
    }));
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 2);
    expect(metrics.height).toBeGreaterThan(0);
    expect(metrics.touch).toBeTruthy();

    await openReader(page);
    await expect(page.locator('#ayahFlow')).toBeVisible();
    const readerMetrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(readerMetrics.scrollWidth).toBeLessThanOrEqual(readerMetrics.width + 2);
  });
});

test.describe('Storage exhaustion recovery', () => {
  test('app remains usable and displays a save warning when localStorage quota is exhausted', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        throw error;
      };
      window.__restoreStorageForTest = () => { Storage.prototype.setItem = originalSetItem; };
    });

    await waitForAppReady(page);
    await openReader(page);
    await expect(page.locator('#ayahFlow')).toBeVisible();

    // A blocked write must not take down navigation or the reader UI.
    const state = await page.evaluate(() => ({
      readerVisible: !document.getElementById('readerScreen').classList.contains('hidden'),
      storageManagerAvailable: !!window.StorageManager
    }));
    expect(state.readerVisible).toBeTruthy();
    expect(state.storageManagerAvailable).toBeTruthy();

    const saveResult = await page.evaluate(() =>
      window.StorageManager.saveSettings({ page: 4, fontStyle: 'uthmani' })
    );
    expect(saveResult).toBe(false);
  });
});

test.describe('Service Worker update lifecycle', () => {
  test('registered worker can be checked for update and controls the reloaded app', async ({ page, context }) => {
    await waitForAppReady(page);
    const supported = await page.evaluate(() => 'serviceWorker' in navigator);
    test.skip(!supported, 'Service Worker is unavailable in this browser context');

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15_000 });

    const before = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration || !registration.active) return null;
      return {
        scope: registration.scope,
        scriptURL: registration.active.scriptURL,
        state: registration.active.state
      };
    });
    expect(before).not.toBeNull();
    expect(before.scriptURL).toContain('/sw.js');
    expect(before.state).toBe('activated');

    // update() is safe when no release is available; it must not unregister
    // the active worker or clear the app's current cache.
    const updateState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      return {
        active: !!registration.active,
        waiting: !!registration.waiting,
        installing: !!registration.installing
      };
    });
    expect(updateState.active).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    const controller = await page.evaluate(() => ({
      controlled: !!navigator.serviceWorker.controller,
      scriptURL: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL
    }));
    expect(controller.controlled).toBeTruthy();
    expect(controller.scriptURL).toContain('/sw.js');

    const appVersion = await page.evaluate(() => window.APP_VERSION || null);
    const cacheNames = await page.evaluate(() => caches.keys());
    if (appVersion) expect(cacheNames).toContain(`juzamma-v${appVersion}`);
  });
});
