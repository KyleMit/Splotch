import { chromium, defineConfig, devices } from '@playwright/test';
import { chromiumExecutablePath } from '../tools/lib/playwright.mjs';
import { REPORT_FOLDER } from './playwright.config.ts';

const RUN_BACKSTOP_MS = 240_000;

export default defineConfig({
  globalSetup: './server/buildApiExport.ts',
  testDir: './specs',
  testMatch: 'api-integration.spec.ts',
  workers: 1,
  retries: 0,
  globalTimeout: RUN_BACKSTOP_MS,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: REPORT_FOLDER }]],
  use: {
    ...devices['Desktop Chrome'],
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: chromiumExecutablePath(chromium) },
  },
});
