import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Slow each action down when SLOWMO is set (ms), e.g. `SLOWMO=500 npm run test:headed`
    launchOptions: {
      slowMo: Number(process.env.SLOWMO) || 0
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `vite dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
