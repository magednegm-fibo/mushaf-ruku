// e2e/advanced-scenarios.spec.js
// سيناريوهات متقدمة (الضغط المطول، RTL، Service Worker، صلاحيات، حفظ الخط)
// Assertions حقيقية — لا نكتفي بـ typeof أو "عدم الانهيار" وحدهما.

const { test, expect } = require('@playwright/test');
const { waitForAppReady, openReader, openSettings, closePanel } = require('./helpers');

test.describe('مصحف الركوع — سيناريوهات متقدمة', () => {

  // --------------------------------------------------------------------------
  // توافق RTL
  // --------------------------------------------------------------------------
  test('RTL — الاتجاه من اليمين لليسار موجود', async ({ page }) => {
    await waitForAppReady(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toMatch(/^ar/);
  });

  // --------------------------------------------------------------------------
  // الضغط المطوّل — يجب أن يظهر قائمة تذكير أو نافذة معلومات علامة
  // --------------------------------------------------------------------------
  test('الضغط المطوّل على كلمة يفتح قائمة/معلومة', async ({ page }) => {
    await waitForAppReady(page);

    // long-press على الكلمات معطّل عندما showWaqfMarksUthmani === false
    // (reader-reminders resolveTarget يرجع null). فعّل العلامات أولًا.
    await openSettings(page);
    const waqfToggle = page.locator('#waqfToggle');
    if (await waqfToggle.count()) {
      const waqfRow = page.locator('label.switch:has(#waqfToggle)');
      await waqfRow.scrollIntoViewIfNeeded();
      const on = await waqfToggle.isChecked();
      if (!on) await waqfRow.click();
      await page.waitForTimeout(200);
    }
    await closePanel(page);

    await openReader(page);

    // الهدف الحقيقي: .quran-word (readerManager)
    await page.waitForSelector('#ayahFlow .quran-word', { timeout: 15_000 });
    const word = page.locator('#ayahFlow .quran-word').first();
    await expect(word).toBeVisible();

    const box = await word.boundingBox();
    expect(box).toBeTruthy();

    // Gestures.longPress يدعم mousedown (mouseSupport !== false) و threshold 550ms
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    const menu = page.locator('#waqfMenu:not(.hidden), #waqfColorMenu:not(.hidden), #waqfDeleteMenu:not(.hidden), #waqfInfoPopup:not(.hidden)');
    await expect(menu.first()).toBeVisible({ timeout: 5_000 });
  });

  // --------------------------------------------------------------------------
  // Service Worker — تسجيل فعلي
  // --------------------------------------------------------------------------
  test('Service Worker — يُسجَّل بعد التحميل', async ({ page }) => {
    await waitForAppReady(page);

    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!(reg && (reg.active || reg.installing || reg.waiting));
    }, { timeout: 15_000 });

    const after = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        registered: !!reg,
        active: !!(reg && reg.active),
        installing: !!(reg && reg.installing),
        waiting: !!(reg && reg.waiting),
      };
    });
    expect(after.registered).toBe(true);
    expect(after.active || after.installing || after.waiting).toBe(true);
  });

  // --------------------------------------------------------------------------
  // رفض صلاحية الموقع — التطبيق يبقى تفاعليًا ولا تظهر حالة خطأ قاتلة
  // --------------------------------------------------------------------------
  test('رفض صلاحية الموقع لا يكسر التطبيق', async ({ page, context }) => {
    await context.grantPermissions([]);
    await context.setGeolocation(null).catch(() => {});

    await waitForAppReady(page);
    await expect(page.locator('#homeScreen')).toBeVisible();

    // افتح دليل القارئ → تبويب الصلاة (قد يحمّل prayer.js كسولًا)
    await page.locator('#tileWaqfGuide').click();
    await page.waitForSelector('#waqfGuidePanel:not(.hidden)', { state: 'visible' });
    await page.locator('#tabSalah').click();

    await page.waitForFunction(() => typeof window.Prayer !== 'undefined', { timeout: 15_000 }).catch(() => {});

    const gpsBtn = page.locator('#prayerGpsBtn');
    if (await gpsBtn.isVisible().catch(() => false)) {
      await gpsBtn.click();
      await page.waitForTimeout(800);
    }

    // ما زال الدليل مفتوحًا والتطبيق حيًا
    await expect(page.locator('#waqfGuidePanel')).toBeVisible();
    await expect(page.locator('#app')).toBeVisible();
    // لا شاشة بيضاء / اختفاء كامل للواجهة
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

  // --------------------------------------------------------------------------
  // Madinah-only: لا يوجد تبديل خط — uthmani فقط + migration من amiri
  // --------------------------------------------------------------------------
  test('مصحف المدينة فقط — fontStyle uthmani ولا زر نسخ', async ({ page }) => {
    await waitForAppReady(page);
    await openSettings(page);

    await expect(page.locator('#btnFontAmiri')).toHaveCount(0);
    await expect(page.locator('#btnFontUthmani')).toHaveCount(0);
    await expect(page.getByText('رسم المصحف')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/uthmani-font/);

    const stored = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('juzamma_v1');
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    });
    if (stored.fontStyle !== undefined) {
      expect(stored.fontStyle).toBe('uthmani');
    }

    // محاكاة legacy amiri ثم reload → يجب أن يُهجَّر إلى uthmani
    await page.evaluate(() => {
      const key = 'juzamma_v1';
      let obj = {};
      try { obj = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) {}
      obj.fontStyle = 'amiri';
      localStorage.setItem(key, JSON.stringify(obj));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page.locator('body')).toHaveClass(/uthmani-font/);
    const after = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('juzamma_v1');
        return raw ? JSON.parse(raw).fontStyle : null;
      } catch (e) { return null; }
    });
    expect(after).toBe('uthmani');
  });
});
