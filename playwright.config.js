// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright config for مصحف الركوع PWA
 *
 * تشغيل:
 *   npm install
 *   npx playwright install chromium   # مرة واحدة
 *   npm run test:e2e
 *
 * للاختبارات offline تحتاج chromium (service worker + cache).
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // PWA + SW أفضل تسلسليًا في البداية
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    colorScheme: 'light',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // مهم لـ Service Worker و cache
    serviceWorkers: 'allow',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // يمكن تفعيلها لاحقًا:
    // { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    // { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],

  webServer: {
    command: 'npx serve -l 4173 .',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
