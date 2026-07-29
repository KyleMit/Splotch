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

/**
 * A managed code no spec sends, so tests/global-setup.ts can ask the server
 * that answered the port whether it holds this env without spending the
 * per-code budget the throttle spec bursts through.
 */
export const HARNESS_PROBE_CODE = 'e2e-harness-probe';

/** The managed allowlist, always carrying the harness probe code. */
export function allowedTokensList(...managedCodes: string[]): string {
  return [...managedCodes, HARNESS_PROBE_CODE].join(',');
}

/**
 * A repo that does not exist, so the feedback flow has no live target even if
 * a token reaches it some other way. Blank would be the wrong value here:
 * config.githubIssueRepo() falls back to the real repo when it's empty.
 */
const NOWHERE_ISSUE_REPO = 'splotch-tests/nowhere';

/**
 * A key Gemini refuses. Non-empty on purpose: with no key at all the managed-code
 * path answers 500 from the authorization step, before the request guards the
 * generate-image specs are there to exercise — so they would keep passing while
 * asserting nothing about the guards. No spec reaches the model call with it.
 */
const UNUSABLE_GEMINI_KEY = 'not-a-usable-gemini-key';

export const commonWebServer = {
  url: playwrightBaseURL,
  timeout: PRODUCTION_BUILD_AND_PREVIEW_BOOT_BUDGET,
  // Every credential the app reads is declared here rather than inherited, for
  // the server Playwright starts from `command`. Vite gives process.env
  // precedence over web/.env, so this is what keeps a developer's real dotenv
  // from changing what a spec exercises — or what it reaches: an ambient
  // GITHUB_ISSUE_TOKEN made the /feedback failure-path spec file live issues in
  // the tracker from its fixture text (scripts/api-smoke.mjs clears it for the
  // same reason). A blank value is a deliberate "unconfigured", which is the
  // state CI runs in.
  //
  // It says nothing about a server Playwright *adopted* — reuseExistingServer
  // hands the suite whatever is already on the port, env and all. That case is
  // caught at runtime by the probe in tests/global-setup.ts.
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
    ALLOWED_TOKENS_LIST: allowedTokensList(MANAGED_ACCESS_TOKEN),
    GEMINI_API_KEY: UNUSABLE_GEMINI_KEY,
    GITHUB_ISSUE_TOKEN: '',
    GITHUB_ISSUE_REPO: NOWHERE_ISSUE_REPO,
  },
};
