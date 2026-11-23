import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 20000,
  expect: { timeout: 6000 },
  workers: 1,
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://127.0.0.1:5173',
    headless: true,
    launchOptions: existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? {
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        }
      : {},
    trace: 'retain-on-failure',
  },
  webServer: process.env.PREVIEW_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5173/health',
        reuseExistingServer: true,
      },
  reporter: [['list']],
});
