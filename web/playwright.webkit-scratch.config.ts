// Scratch config: run selected specs under WebKit to chase Safari-only input
// bugs. Not part of `npm test` — invoke explicitly with
//   node scripts/web.mjs playwright test -c playwright.webkit-scratch.config.ts -g "<test>"
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL },
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { PUBLIC_ENABLE_DEV_HARNESS: 'true', ADMIN_ACCESS_TOKEN: 'test-admin-secret' },
  },
});
