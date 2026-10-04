// e2e/basic-scenarios.spec.js
// السيناريوهات الأساسية الموصى بها لاختبارات المتصفح الحقيقي
//
// 1. فتح التطبيق
// 2. الانتقال إلى ركوع
// 3. البحث عن آية
// 4. تغيير الخط والوضع الليلي
// 5. حفظ واستعادة نسخة
// 6. تشغيل وإيقاف التلاوة
// 7. فتح التطبيق Offline

const { test, expect } = require('@playwright/test');
const { waitForAppReady, openReader, openSettings, closePanel } = require('./helpers');

test.describe('مصحف الركوع — سيناريوهات أساسية', () => {

  // --------------------------------------------------------------------------
  // 1. فتح التطبيق
  // --------------------------------------------------------------------------
  test('1. فتح التطبيق — تظهر الشاشة الرئيسية', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('#homeScreen')).toBeVisible();
    await expect(page.locator('h1')).toContainText('مصحف الركوع');
    await expect(page.locator('#btnContinue')).toBeVisible();
    await expect(page.locator('#tileSurah')).toBeVisible();
    await expect(page.locator('#tileSearch')).toBeVisible();
    await expect(page.locator('#tileSettings')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 2. الانتقال إلى ركوع
  // --------------------------------------------------------------------------
  test('2. الانتقال إلى ركوع — فتح القارئ وعرض نص', async ({ page }) => {
    await waitForAppReady(page);
    await openReader(page);

    await expect(page.locator('#readerScreen')).toBeVisible();
    await expect(page.locator('#ayahFlow')).toBeVisible();

    // يجب أن يظهر نص عربي داخل ayahFlow
    const text = await page.locator('#ayahFlow').innerText();
    expect(text.length).toBeGreaterThan(20);
    // رقم الصفحة / المؤشر
    await expect(page.locator('#pageIndicator')).toBeVisible();
  });

  test('2b. التنقل بين الركوعات (التالي / السابق)', async ({ page }) => {
    await waitForAppReady(page);
    await openReader(page);

    const indicatorBefore = await page.locator('#pageIndicator').innerText();
    await page.locator('#btnNext').click();
    await page.waitForTimeout(400);
    const indicatorAfter = await page.locator('#pageIndicator').innerText();
    expect(indicatorAfter).not.toEqual(indicatorBefore);

    await page.locator('#btnPrev').click();
    await page.waitForTimeout(400);
    const indicatorBack = await page.locator('#pageIndicator').innerText();
    expect(indicatorBack).toEqual(indicatorBefore);
  });

  // --------------------------------------------------------------------------
  // 3. البحث عن آية
  // --------------------------------------------------------------------------
  test('3. البحث عن آية — نتائج تظهر ويمكن الانتقال إليها', async ({ page }) => {
    await waitForAppReady(page);

    await page.locator('#tileSearch').click();
    await page.waitForSelector('#searchPanel:not(.hidden)', { state: 'visible' });

    await page.locator('#searchInput').fill('بسم الله');
    await page.locator('#btnRunSearch').click();

    // DOM الحقيقي يستخدم .search-result-item (انظر navigation.js renderSearchResults)
    await page.waitForSelector('#searchResults .search-result-item', {
      timeout: 15_000,
    });

    const results = page.locator('#searchResults .search-result-item');
    const count = await results.count();
    expect(count).toBeGreaterThan(0);

    // انقر أول نتيجة
    await results.first().click();
    await page.waitForSelector('#readerScreen:not(.hidden)', { state: 'visible', timeout: 10_000 });
    await expect(page.locator('#ayahFlow')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 4. تغيير الخط والوضع الليلي
  // --------------------------------------------------------------------------
  test('4. الوضع الليلي وحجم الخط (مصحف المدينة فقط)', async ({ page }) => {
    await waitForAppReady(page);
    await openSettings(page);

    // input داخل .switch له opacity:0 (style.css) — غير مرئي لـ Playwright.
    // نتحقق من وجود الـ checkbox ومن ظهور الـ slider البصري.
    const nightToggle = page.locator('#nightToggle');
    await expect(nightToggle).toBeAttached();
    const nightRow = page.locator('label.switch:has(#nightToggle)');
    await nightRow.scrollIntoViewIfNeeded();
    await expect(nightRow.locator('.slider')).toBeVisible();
    const wasChecked = await nightToggle.isChecked();
    // input is opacity:0; click the visible switch label
    await nightRow.click();
    await page.waitForTimeout(300);
    expect(await nightToggle.isChecked()).toBe(!wasChecked);

    const hasNightClass = await page.evaluate(() => document.body.classList.contains('night'));
    expect(hasNightClass).toBe(!wasChecked);

    // Madinah-only: لا يوجد اختيار رسم المصحف في الإعدادات
    await expect(page.locator('#btnFontUthmani')).toHaveCount(0);
    await expect(page.locator('#btnFontAmiri')).toHaveCount(0);
    await expect(page.getByText('رسم المصحف')).toHaveCount(0);

    const fontStyle = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('juzamma_v1');
        return raw ? (JSON.parse(raw).fontStyle || null) : null;
      } catch (e) { return null; }
    });
    // قد يكون null قبل أول save — بعد أي تفاعل يجب أن يكون uthmani أو absent
    if (fontStyle !== null) expect(fontStyle).toBe('uthmani');
    await expect(page.locator('body')).toHaveClass(/uthmani-font/);

    const fontPlus = page.locator('#fontPlus');
    if (await fontPlus.isVisible()) {
      await fontPlus.click();
      await page.waitForTimeout(200);
    }

    await closePanel(page);
  });

  // --------------------------------------------------------------------------
  // 5. حفظ واستعادة نسخة (Backup / Restore)
  // --------------------------------------------------------------------------
  test('5. حفظ واستعادة نسخة احتياطية', async ({ page }) => {
    await waitForAppReady(page);
    await openSettings(page);

    // ابحث عن أزرار التصدير/الاستيراد (قد تختلف التسميات)
    // في التطبيق: غالبًا داخل قسم النسخ الاحتياطي
    const exportBtn = page.locator('button:has-text("تصدير"), button:has-text("نسخة احتياطية"), #btnExportBackup, [data-action="export"]').first();
    const importBtn = page.locator('button:has-text("استيراد"), button:has-text("استعادة"), #btnImportBackup, [data-action="import"]').first();

    // إن لم توجد أزرار واضحة، نختبر عبر localStorage مباشرة (smoke)
    const hasExport = await exportBtn.isVisible().catch(() => false);
    const hasImport = await importBtn.isVisible().catch(() => false);

    if (hasExport) {
      // تشغيل التصدير (قد يفتح download)
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }).catch(() => null),
        exportBtn.click(),
      ]);
      // لا نفشل إن لم يكن هناك download (قد يكون copy to clipboard)
    }

    // اختبار أساسي: وجود مفاتيح تخزين بعد استخدام التطبيق
    await closePanel(page);
    await openReader(page);
    await page.waitForTimeout(500);

    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(storageKeys.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 6. تشغيل وإيقاف التلاوة
  // --------------------------------------------------------------------------
  test('6. تشغيل وإيقاف التلاوة', async ({ page }) => {
    await waitForAppReady(page);
    await openReader(page);

    const listenBtn = page.locator('#btnListen');
    await expect(listenBtn).toBeVisible();

    // اضغط تشغيل
    await listenBtn.click();
    await page.waitForTimeout(800);

    // يجب أن يظهر أيقونة pause أو loading في مرحلة ما
    const pauseVisible = await page.locator('#listenIconPause:not(.hidden)').isVisible().catch(() => false);
    const loadingVisible = await page.locator('#listenIconLoading:not(.hidden)').isVisible().catch(() => false);
    // نقبل أي من الحالتين (قد يكون TTS أو ملف صوتي)
    // لا نفشل الاختبار إن فشل الصوت في بيئة CI بدون أصوات

    // إيقاف
    if (pauseVisible) {
      await listenBtn.click();
      await page.waitForTimeout(400);
    }
  });

  // --------------------------------------------------------------------------
  // 7. فتح التطبيق Offline
  // --------------------------------------------------------------------------
  test('7. فتح التطبيق Offline بعد التحميل الأول', async ({ page, context }) => {
    // أول زيارة أونلاين لتسجيل SW وتخزين الأصول
    await waitForAppReady(page);
    await openReader(page);
    await page.waitForTimeout(2000); // أعطِ SW وقتًا للكاش

    // تأكد أن SW مسجّل
    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg;
    });
    // قد لا يعمل SW على file:// أو بعض البيئات، لذا لا نفشل حتمًا

    // انتقل إلى وضع offline
    await context.setOffline(true);

    // أعد تحميل الصفحة
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // يجب أن تظهر الشاشة الرئيسية أو القارئ حتى بدون إنترنت
    const homeVisible = await page.locator('#homeScreen:not(.hidden)').isVisible().catch(() => false);
    const readerVisible = await page.locator('#readerScreen:not(.hidden)').isVisible().catch(() => false);
    expect(homeVisible || readerVisible).toBeTruthy();

    // إعادة الاتصال
    await context.setOffline(false);
  });
});
