// e2e/helpers.js
// مساعدات مشتركة لاختبارات Playwright

/**
 * ينتظر اكتمال تحميل التطبيق (ظهور الشاشة الرئيسية)
 */
async function waitForAppReady(page) {
  await page.goto('/');
  await page.waitForSelector('#homeScreen:not(.hidden)', { state: 'visible', timeout: 20_000 });
  // انتظر حتى يكتمل تسجيل Service Worker إن وُجد
  await page.waitForFunction(() => {
    return document.getElementById('homeScreen') &&
           !document.getElementById('homeScreen').classList.contains('hidden');
  }, { timeout: 15_000 });
}

/**
 * يفتح شاشة القارئ من الزر "استكمال آخر قراءة" أو أول ركوع
 */
async function openReader(page) {
  await page.locator('#btnContinue').click();
  await page.waitForSelector('#readerScreen:not(.hidden)', { state: 'visible', timeout: 15_000 });
  await page.waitForSelector('#ayahFlow', { state: 'visible' });
}

/**
 * يفتح لوحة الإعدادات
 */
async function openSettings(page) {
  // من الشاشة الرئيسية أو من القارئ
  const settingsFromHome = page.locator('#tileSettings');
  const settingsFromReader = page.locator('#btnSettings');
  if (await settingsFromHome.isVisible().catch(() => false)) {
    await settingsFromHome.click();
  } else {
    await settingsFromReader.click();
  }
  await page.waitForSelector('#settingsPanel:not(.hidden)', { state: 'visible' });
}

/**
 * يغلق أي لوحة مفتوحة
 */
async function closePanel(page) {
  const closeBtns = [
    '#btnCloseSettings',
    '#btnCloseSearch',
    '#btnCloseSurah',
    '#btnCloseJuz',
    '#btnCloseFavorites',
    '#btnCloseIndex',
    '#btnCloseTafsir',
    '#btnCloseWaqfGuide',
  ];
  for (const sel of closeBtns) {
    const btn = page.locator(sel);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
      break;
    }
  }
}

module.exports = {
  waitForAppReady,
  openReader,
  openSettings,
  closePanel,
};
