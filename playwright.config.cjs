const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [process.env.CI ? ['github'] : ['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4192',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'webkit-ipad', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run build && node scripts/serve-e2e.cjs',
    url: 'http://127.0.0.1:4192',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
