import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173',
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  // Start the API with DEMO_MODE=true and seed-demo.mjs before running.
  // The runner intentionally never starts or resets the database.
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome',
      },
    },
  ],
});
