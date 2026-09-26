const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test/e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 45000, expect: { timeout: 7000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3118', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node test/e2e/support/server.js', url: 'http://127.0.0.1:3118/up',
    reuseExistingServer: false, timeout: 120000,
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 568 } } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], viewport: { width: 320, height: 568 } } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 } } },
  ],
});
