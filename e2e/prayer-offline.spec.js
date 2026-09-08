// e2e/prayer-offline.spec.js
//
// Fresh install → SW installed → Prayer never opened → Offline → reload
// → open Prayer → must initialize (prayer.js served from SW cache).
//
// لا يعتمد على شبكة خارجية بعد مرحلة التثبيت الأولى.

const { test, expect } = require('@playwright/test');
const { waitForAppReady } = require('./helpers');

test.describe('Prayer/Qibla offline without prior open', () => {
  test('prayer.js precached — opens offline on first use', async ({ page, context }) => {
    // 1) Fresh online visit: install SW + precache (includes prayer.js)
    await waitForAppReady(page);

    // انتظر تسجيل Service Worker ثم اكتمال ظهور prayer.js في Cache Storage
    // (بدل timeout ثابت — cache.addAll قد يستغرق أقل أو أكثر حسب الجهاز)
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !(reg.active || reg.installing || reg.waiting)) return false;
      if (!('caches' in window)) return false;
      const keys = await caches.keys();
      for (const k of keys) {
        const cache = await caches.open(k);
        const reqs = await cache.keys();
        for (const req of reqs) {
          if (/\/prayer\.js(\?|$)/.test(req.url)) return true;
        }
      }
      return false;
    }, { timeout: 30_000 });

    const precached = await page.evaluate(async () => {
      const keys = await caches.keys();
      for (const k of keys) {
        const cache = await caches.open(k);
        const reqs = await cache.keys();
        for (const req of reqs) {
          if (/\/prayer\.js(\?|$)/.test(req.url)) {
            return { ok: true, cache: k, url: req.url };
          }
        }
      }
      return { ok: false, reason: 'prayer.js not in any cache', caches: keys };
    });
    expect(precached.ok, JSON.stringify(precached)).toBe(true);

    // 2) لم يُفتح تبويب الصلاة بعد — انتقل Offline
    await context.setOffline(true);

    // 3) Reload offline
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#homeScreen:not(.hidden), #readerScreen:not(.hidden)', {
      timeout: 15_000,
    });

    // 4) افتح دليل القارئ → تبويب الصلاة (أول استخدام offline)
    const guideTile = page.locator('#tileWaqfGuide');
    await expect(guideTile).toBeVisible({ timeout: 10_000 });
    await guideTile.click();
    await page.waitForSelector('#waqfGuidePanel:not(.hidden)', { state: 'visible', timeout: 10_000 });

    const salahTab = page.locator('#tabSalah');
    await expect(salahTab).toBeVisible();
    await salahTab.click();

    // 5) يجب أن تُحمَّل الوحدة من الكاش وتُهيَّأ
    await page.waitForFunction(() => {
      return typeof window.Prayer !== 'undefined' &&
        window.Prayer &&
        typeof window.Prayer.onTabShown === 'function';
    }, { timeout: 15_000 });

    const prayerOk = await page.evaluate(() => {
      return {
        hasPrayer: typeof window.Prayer !== 'undefined',
        hasOnTabShown: !!(window.Prayer && window.Prayer.onTabShown),
        hasInit: !!(window.Prayer && window.Prayer.init),
        salahVisible: !!(document.getElementById('salahTab') &&
          !document.getElementById('salahTab').classList.contains('hidden')),
      };
    });

    expect(prayerOk.hasPrayer).toBe(true);
    expect(prayerOk.hasOnTabShown).toBe(true);
    expect(prayerOk.salahVisible).toBe(true);

    // لوحة/عناصر القبلة موجودة في DOM (التهيئة لا ترمي)
    await expect(page.locator('#salahTab')).toBeVisible();
    const qiblaBits = page.locator('#prayerQiblaAngle2, #prayerOpenCompassBtn, #prayerCompassRose');
    expect(await qiblaBits.count()).toBeGreaterThan(0);

    await context.setOffline(false);
  });
});
