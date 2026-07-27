import { ADMIN_ACCESS_TOKEN } from './tests/admin-helpers';

export const playwrightPort = 4173;
export const playwrightBaseURL = `http://localhost:${playwrightPort}`;

export const commonPlaywrightConfig = {
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  use: { baseURL: playwrightBaseURL },
};

export const productionPreviewCommand = `npx vite build && npx vite preview --port ${playwrightPort}`;

export const commonWebServer = {
  url: playwrightBaseURL,
  timeout: 180_000,
  // ADMIN_ACCESS_TOKEN is the known secret the shared admin test helper provides
  // to tests/admin.spec.ts and tests/a11y.spec.ts.
  // Token mutations land in the in-memory fallback (no Netlify Blobs here),
  // so they reset with the server and never touch real data.
  env: { PUBLIC_ENABLE_DEV_HARNESS: 'true', ADMIN_ACCESS_TOKEN },
};
