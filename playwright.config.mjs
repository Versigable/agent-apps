import { defineConfig } from '@playwright/test';

const previewTestPort = Number(process.env.PLAYWRIGHT_PREVIEW_PORT || 4174);
const previewBaseUrl = `http://127.0.0.1:${previewTestPort}`;

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: previewBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: `PREVIEW_HOST=127.0.0.1 PREVIEW_PORT=${previewTestPort} npm run serve:games`,
    url: `${previewBaseUrl}/games/arcade/`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  },
  reporter: [['list'], ['html', { outputFolder: 'games/artifacts/playwright-report', open: 'never' }]],
  outputDir: 'games/artifacts/test-results'
});
