import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: process.env.PREVIEW_URL ? 'test-results/remote' : 'test-results/local',
  globalSetup: './tests/e2e/setup.ts',
  timeout: process.env.PREVIEW_URL ? 90000 : 20000,
  expect: { timeout: 6000 },
  workers: 1,
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://127.0.0.1:4173',
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
        command: 'npm run dev -- --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173/health',
        reuseExistingServer: false,
      },
  reporter: [['list']],
});
