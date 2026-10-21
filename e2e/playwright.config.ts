// Playwright against the React Native web export, served as the Netlify deploy serves it
// (server/netlifySite.ts). README.md says how a spec is written and run.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, defineConfig, devices, firefox, webkit } from '@playwright/test';
import { chromiumExecutablePath } from '../tools/lib/playwright.mjs';
import { parseNumberFlag, TCP_PORT } from '../tools/lib/proc.mjs';
import type { FlakyReporterOptions } from '../web/playwright-flaky-reporter.ts';
import { SMOKE } from './tags.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_PORT = 4180;

// An environment variable, not a flag, so a rejection names the variable a person set.
function e2ePort(value = process.env.SPLOTCH_E2E_PORT): number {
  if (value === undefined) return DEFAULT_PORT;
  try {
    return parseNumberFlag('SPLOTCH_E2E_PORT', value, TCP_PORT);
  } catch {
    throw new Error(
      `SPLOTCH_E2E_PORT must be an integer from ${TCP_PORT.min} through ${TCP_PORT.max}; received ${JSON.stringify(value)}`
    );
  }
}

const port = e2ePort();
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Where the HTML reporter and the flaky reporter both write, which the CI jobs upload by this
 * literal path. tools/tests/playwright-report-folder.test.mjs fails if either side moves.
 */
export const REPORT_FOLDER = resolve(REPO_ROOT, 'playwright-report');

// Shared with the SvelteKit suite while both run: one reporter, one flaky.json record shape.
const FLAKY_REPORTER = resolve(REPO_ROOT, 'web', 'playwright-flaky-reporter.ts');

const SERVE_COMMAND = `node --experimental-strip-types --disable-warning=ExperimentalWarning e2e/server/serve.ts --port ${port}`;

// Builds the export first unless SPLOTCH_E2E_PREBUILT is set. Set it only where the export on disk
// was just built from this checkout, as CI's jobs do with the one the Native web build job made: a
// stale export passes specs against code that no longer exists.
const WEB_SERVER_COMMAND = process.env.SPLOTCH_E2E_PREBUILT
  ? SERVE_COMMAND
  : `npm run build:site && ${SERVE_COMMAND}`;

// The export build plus the function loader's start, on a cold dual-core machine.
const BUILD_AND_SERVE_BUDGET_MS = 240_000;

// A deadlock backstop, not a performance budget: nothing else bounds the web server wait or a
// wedged run. web/playwright.shared.ts derives it for the SvelteKit suite's full unsharded run;
// this suite's specs are ported from that one, so it never runs more and shares the ceiling.
const RUN_DEADLOCK_CEILING_MS = 1_200_000;

// Retries let a flake through on CI, and the flaky reporter annotates every retried pass so the
// masked failure still shows (ADR-0078 §4 sets the count; it is not re-measured for this suite).
const CI_RETRIES = 2;

// A non-Blink project joins only when its browser is installed. CI's engine jobs set REQUIRE_*,
// so a bad install fails there instead of dropping that engine.
function engineAvailable(
  engineName: 'Firefox' | 'WebKit',
  executablePath: () => string,
  requirement: 'REQUIRE_FIREFOX' | 'REQUIRE_WEBKIT'
): boolean {
  try {
    if (existsSync(executablePath())) return true;
  } catch {
    // An absent or unreadable browser path means the engine is unavailable unless required.
  }
  if (process.env[requirement]) {
    throw new Error(`${requirement} is set but the ${engineName} binary is not installed`);
  }
  return false;
}

export default defineConfig({
  testDir: './specs',
  outputDir: resolve(REPO_ROOT, 'test-results'),
  fullyParallel: true,
  // Playwright's default worker count, half the logical cores, is ADR-0078's measured capacity of
  // two cores per worker. The SvelteKit suite oversubscribes on CI; this one has not been measured.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? CI_RETRIES : 0,
  globalTimeout: RUN_DEADLOCK_CEILING_MS,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: REPORT_FOLDER }],
    [FLAKY_REPORTER, { outputFolder: REPORT_FOLDER } satisfies FlakyReporterOptions],
  ],
  use: { baseURL, trace: 'on-first-retry' },
  // launchOptions live per project: the Chromium executable fallback must not reach another engine.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: chromiumExecutablePath(chromium) },
      },
    },
    ...(engineAvailable('Firefox', () => firefox.executablePath(), 'REQUIRE_FIREFOX')
      ? [{ name: 'firefox', grep: SMOKE, use: devices['Desktop Firefox'] }]
      : []),
    ...(engineAvailable('WebKit', () => webkit.executablePath(), 'REQUIRE_WEBKIT')
      ? [{ name: 'webkit', grep: SMOKE, use: devices['Desktop Safari'] }]
      : []),
  ],
  webServer: {
    command: WEB_SERVER_COMMAND,
    cwd: REPO_ROOT,
    url: baseURL,
    timeout: BUILD_AND_SERVE_BUDGET_MS,
    reuseExistingServer: false,
  },
});
