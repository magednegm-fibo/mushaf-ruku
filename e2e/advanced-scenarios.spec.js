// e2e/advanced-scenarios.spec.js
// سيناريوهات متقدمة (الضغط المطول، RTL، Service Worker، صلاحيات، حفظ الخط)
// Assertions حقيقية — لا نكتفي بـ typeof أو "عدم الانهيار" وحدهما.

const { test, expect } = require('@playwright/test');
const { waitForAppReady, openReader, openSettings } = require('./helpers');

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
    await openReader(page);

    await page.waitForSelector('#ayahFlow span, #ayahFlow .word', { timeout: 15_000 });
    const word = page.locator('#ayahFlow span, #ayahFlow .word').first();
    await expect(word).toBeVisible();

    const box = await word.boundingBox();
    expect(box).toBeTruthy();

    // pointer events أقرب لمسار Gestures.longPress في التطبيق
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    // النتيجة المتوقعة: إحدى قوائم التذكير/المعلومات تظهر
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
  // تبديل الخط يُحفظ ويُستعاد بعد إعادة التحميل
  // --------------------------------------------------------------------------
  test('تبديل الخط يُحفظ في التخزين', async ({ page }) => {
    await waitForAppReady(page);
    await openSettings(page);

    const btnAmiri = page.locator('#btnFontAmiri');
    const btnUthmani = page.locator('#btnFontUthmani');
    await expect(btnAmiri).toBeVisible();
    await expect(btnUthmani).toBeVisible();

    // اختر نسخ تعليق (amiri / indopak)
    await btnAmiri.click();
    await page.waitForTimeout(300);

    // تحقق فوري من تطبيق النمط
    await expect(btnAmiri).toHaveClass(/active/);
    const bodyClassAfter = await page.locator('body').getAttribute('class');
    expect(bodyClassAfter || '').toMatch(/indopak-font/);
    expect(bodyClassAfter || '').not.toMatch(/uthmani-font/);

    // تحقق من التخزين قبل إعادة التحميل
    const storedBefore = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('juzamma_v1');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    });
    expect(storedBefore).toBeTruthy();
    expect(storedBefore.fontStyle).toBe('amiri');

    // أعد التحميل
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await openSettings(page);

    // بعد الاستعادة: الزر نشط + الكلاس + التخزين
    await expect(page.locator('#btnFontAmiri')).toHaveClass(/active/);
    const bodyClassReload = await page.locator('body').getAttribute('class');
    expect(bodyClassReload || '').toMatch(/indopak-font/);

    const storedAfter = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('juzamma_v1');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    });
    expect(storedAfter).toBeTruthy();
    expect(storedAfter.fontStyle).toBe('amiri');

    // رجّع للعثماني للتأكد أن التبديل thrice يعمل أيضًا
    await page.locator('#btnFontUthmani').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#btnFontUthmani')).toHaveClass(/active/);
    const bodyUthmani = await page.locator('body').getAttribute('class');
    expect(bodyUthmani || '').toMatch(/uthmani-font/);
  });
});
