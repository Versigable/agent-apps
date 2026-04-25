import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run serve:games',
    url: 'http://127.0.0.1:4173/games/arcade/',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  },
  reporter: [['list'], ['html', { outputFolder: 'games/artifacts/playwright-report', open: 'never' }]],
  outputDir: 'games/artifacts/test-results'
});
