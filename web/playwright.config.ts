// cSpell:ignore SLOWMO
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Slow each action down when SLOWMO is set (ms), e.g. `SLOWMO=500 npm run test:e2e:headed`
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
    // Exercise the production artifact (service worker, adapter output,
    // minification) instead of the dev server. `vite preview` defaults to 4173,
    // matching PORT above. PUBLIC_ENABLE_DEV_HARNESS unlocks the /dev/* test
    // harnesses in the built app (404 otherwise); it's never set in the Netlify
    // deploy. Set DEV_SERVER=1 for fast local iteration against `vite dev`.
    command: process.env.DEV_SERVER
      ? `npx vite dev --port ${PORT}`
      : `npx vite build && npx vite preview --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // ADMIN_ACCESS_TOKEN is the known secret tests/admin.spec.ts signs in with.
    // Token mutations land in the in-memory fallback (no Netlify Blobs here),
    // so they reset with the server and never touch real data.
    env: { PUBLIC_ENABLE_DEV_HARNESS: 'true', ADMIN_ACCESS_TOKEN: 'test-admin-secret' }
  }
});
