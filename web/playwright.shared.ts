// cSpell:ignore SLOWMO
import { existsSync, readdirSync } from 'node:fs';
import { chromium, type LaunchOptions, type PlaywrightTestConfig } from '@playwright/test';

import { ADMIN_ACCESS_TOKEN } from './tests/admin-helpers';

const DEFAULT_PLAYWRIGHT_PORT = 4173;
const MAX_TCP_PORT = 65_535;

function invalidPlaywrightPort(value: string): never {
  throw new Error(
    `SPLOTCH_E2E_PORT must be an integer from 1 through ${MAX_TCP_PORT}; received ${JSON.stringify(value)}`
  );
}

export function resolvePlaywrightPort(value = process.env.SPLOTCH_E2E_PORT): number {
  if (value === undefined) return DEFAULT_PLAYWRIGHT_PORT;
  if (!/^\d+$/.test(value)) invalidPlaywrightPort(value);

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) invalidPlaywrightPort(value);
  return port;
}

export const playwrightPort = resolvePlaywrightPort();
export const playwrightBaseURL = `http://localhost:${playwrightPort}`;

/**
 * A deadlock backstop, not a performance budget.
 *
 * Playwright's per-test timeout already bounds a hanging test. What nothing
 * bounds is globalSetup, globalTeardown and the webServer wait, so without this
 * a wedged run hangs its invoker — a developer, or an agent session — until the
 * machine goes away.
 *
 * Derived rather than guessed: wall clock models as fixed overhead plus summed
 * test time divided by workers, and `workers` is itself derived from the machine
 * (playwright.config.ts), so the slowest supported shape is a single worker on a
 * dual-core box. This is roughly twice that modeled floor, and it is sized for
 * the full unsharded run — the local and cloud-session shape. CI shards and
 * bounds each shard with `timeout-minutes` (.github/workflows/test.yml), so it
 * never reaches this ceiling.
 *
 * Re-derive it if the suite grows substantially. Tuning it *down* toward
 * observed runtimes turns it into a flake generator whose failure reads as the
 * very hang it exists to catch.
 */
const RUN_DEADLOCK_CEILING_MS = 1_200_000;

// Cloud sessions cache Chromium under PLAYWRIGHT_BROWSERS_PATH, but the pinned
// revision can drift from what playwright-core resolves (e.g. the env installed
// 1223 while this version wants 1228), so the run fails with "Executable doesn't
// exist". If the resolved binary is missing, fall back to any Chromium present
// so E2E still runs. `PLAYWRIGHT_CHROMIUM` overrides; undefined lets Playwright
// use its own (correct) binary. Keep `.claude/cloud/setup.sh` pinned to this
// package's version so the fallback is rarely needed.
function chromiumExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  try {
    if (existsSync(chromium.executablePath())) return undefined; // pinned build present
  } catch {
    // An absent or unreadable browser path should fall through to discovery.
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const chromiumPrefix = 'chromium-';
  try {
    const builds = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort(
        (a, b) => Number(b.slice(chromiumPrefix.length)) - Number(a.slice(chromiumPrefix.length))
      );
    for (const build of builds) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = `${base}/${build}/${sub}/chrome`;
        if (existsSync(p)) return p;
      }
    }
  } catch {
    // An absent or unreadable browser path should fall through to Playwright.
  }
  return undefined;
}

/** Slow every browser interaction down by this many ms — `SLOWMO=500 npm run test:e2e:headed`. */
export const playwrightSlowMo = Number(process.env.SLOWMO) || 0;

/** The Chromium project's launch options, also spread by any spec that has to
 *  launch its own Chromium (scrollbar-chrome.spec.ts drops a default arg). */
export function chromiumLaunchOptions(): LaunchOptions {
  return { slowMo: playwrightSlowMo, executablePath: chromiumExecutablePath() };
}

export const commonPlaywrightConfig = {
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  globalTimeout: RUN_DEADLOCK_CEILING_MS,
  use: { baseURL: playwrightBaseURL },
} satisfies PlaywrightTestConfig;

export const developmentServerCommand = `npx vite dev --port ${playwrightPort} --strictPort`;
/**
 * Serves an already-built bundle without rebuilding it. Selected by
 * SPLOTCH_E2E_PREBUILT (playwright.config.ts) for a caller that just built and
 * runs `playwright test` repeatedly — the worker sweep
 * (tools/e2e-tuning/run-worker-sweep.mjs) builds once so its reps don't spend
 * a full `vite build` each inside the measurement.
 */
export const previewOnlyCommand = `npx vite preview --port ${playwrightPort} --strictPort`;
export const productionPreviewCommand = `npx vite build && ${previewOnlyCommand}`;
const PRODUCTION_BUILD_AND_PREVIEW_BOOT_BUDGET_MS = 180_000;

/** The managed access code tests/generate-image.spec.ts bursts against. */
export const MANAGED_ACCESS_TOKEN = 'daycare-club';

/**
 * A distinct code per attempt. The throttle spec fills a 60s per-token window
 * and rejected hits don't extend it, so a CI retry starting inside that window
 * would 429 on its very first request.
 */
export function managedAccessTokenForRetry(retry: number): string {
  return retry === 0 ? MANAGED_ACCESS_TOKEN : `${MANAGED_ACCESS_TOKEN}-retry${retry}`;
}

/**
 * A managed code no generation spec sends, so tests/global-setup.ts can ask
 * the server that answered the port whether it holds this env without
 * spending the per-code budget the throttle spec bursts through.
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
 * A key the provider refuses. Non-empty on purpose: with no key at all the managed-code
 * path answers 500 from the authorization step, before the request guards the
 * generate-image specs are there to exercise — so they would keep passing while
 * asserting nothing about the guards. No spec reaches the model call with it.
 */
const UNUSABLE_PROVIDER_KEY = 'not-a-usable-openai-key';

export const commonWebServer = {
  url: playwrightBaseURL,
  timeout: PRODUCTION_BUILD_AND_PREVIEW_BOOT_BUDGET_MS,
  // Every credential the app reads is declared here rather than inherited, for
  // the server Playwright starts from `command`. Vite gives process.env
  // precedence over web/.env, so this is what keeps a developer's real dotenv
  // from changing what a spec exercises — or what it reaches: an ambient
  // GITHUB_ISSUE_TOKEN made the /feedback failure-path spec file live issues in
  // the tracker from its fixture text (tools/api-smoke/run-local-contract.mjs clears it for the
  // same reason). A blank value is a deliberate "unconfigured", which is the
  // state CI runs in.
  //
  // Both production configs disable server reuse and every command uses
  // strictPort. The runtime probe in tests/global-setup.ts remains a defense in
  // depth for the credentials boundary.
  //
  // ADMIN_ACCESS_TOKEN is the known secret the shared admin test helper
  // provides to tests/admin.spec.ts and tests/a11y.spec.ts. The production
  // preview has no Netlify Blobs, so env-seeded token reads remain available
  // while mutations fail closed and never touch real data.
  //
  // Every name web/src reads from $env/dynamic/private belongs in this object;
  // tools/tests/e2e-server-env.test.mjs fails when one is missing.
  env: {
    PUBLIC_ENABLE_DEV_HARNESS: 'true',
    ADMIN_ACCESS_TOKEN,
    ALLOWED_TOKENS_LIST: allowedTokensList(MANAGED_ACCESS_TOKEN),
    OPENAI_API_KEY: UNUSABLE_PROVIDER_KEY,
    // Blank on purpose: the shipped generation deadline is what the specs should
    // exercise. Only the manual red-team suite raises it, and only because a
    // local server has no platform ceiling to stay under.
    GENERATE_DEADLINE_MS_OVERRIDE: '',
    GITHUB_ISSUE_TOKEN: '',
    GITHUB_ISSUE_REPO: NOWHERE_ISSUE_REPO,
    // Non-blank on purpose: the free-tier report spec needs generate-image to
    // mint a token report-image will accept. Blank would close that path.
    REPORT_TOKEN_SECRET: 'test-report-token-secret',
    USAGE_GRANT_ID_SECRET: 'test-usage-grant-id-secret',
  },
} satisfies Partial<NonNullable<PlaywrightTestConfig['webServer']>> & {
  url: string;
};
