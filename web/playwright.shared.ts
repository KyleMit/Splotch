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
const PRODUCTION_BUILD_AND_PREVIEW_BOOT_BUDGET = 180_000;

/** The managed access code tests/generate-image.spec.ts bursts against. */
const MANAGED_ACCESS_TOKEN = 'daycare-club';

/**
 * A distinct code per attempt. The throttle spec fills a 60s per-token window
 * and rejected hits don't extend it, so a CI retry starting inside that window
 * would 429 on its very first request.
 */
export function managedAccessTokenForRetry(retry: number): string {
  return retry === 0 ? MANAGED_ACCESS_TOKEN : `${MANAGED_ACCESS_TOKEN}-retry${retry}`;
}

export const commonWebServer = {
  url: playwrightBaseURL,
  timeout: PRODUCTION_BUILD_AND_PREVIEW_BOOT_BUDGET,
  // Every credential the served app reads is declared here rather than
  // inherited. Vite gives process.env precedence over web/.env, so this is what
  // keeps a developer's real dotenv from changing what a spec exercises — or
  // what it reaches: an ambient GITHUB_ISSUE_TOKEN made the /feedback
  // failure-path spec file live issues in the tracker from its fixture text
  // (scripts/api-smoke.mjs clears it for the same reason). A blank value is a
  // deliberate "unconfigured", which is the state CI runs in.
  //
  // ADMIN_ACCESS_TOKEN is the known secret the shared admin test helper
  // provides to tests/admin.spec.ts and tests/a11y.spec.ts. Token mutations
  // land in the in-memory fallback (no Netlify Blobs here), so they reset with
  // the server and never touch real data.
  //
  // Every name web/src reads from $env/dynamic/private belongs in this object;
  // scripts/tests/e2e-server-env.test.mjs fails when one is missing.
  env: {
    PUBLIC_ENABLE_DEV_HARNESS: 'true',
    ADMIN_ACCESS_TOKEN,
    ALLOWED_TOKENS_LIST: MANAGED_ACCESS_TOKEN,
    GEMINI_API_KEY: '',
    GITHUB_ISSUE_TOKEN: '',
    GITHUB_ISSUE_REPO: '',
  },
};
