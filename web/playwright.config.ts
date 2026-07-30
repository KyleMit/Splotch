// cSpell:ignore SLOWMO
import { existsSync, readdirSync } from 'node:fs';
import { chromium, defineConfig, devices, webkit } from '@playwright/test';
import {
  allowedTokensList,
  commonPlaywrightConfig,
  commonWebServer,
  managedAccessTokenForRetry,
  playwrightPort,
  productionPreviewCommand,
} from './playwright.shared';

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

// The WebKit smoke project only joins the run when the WebKit binary is
// actually installed: CI installs it explicitly (test.yml), but local checkouts
// and cloud sessions often have Chromium only, and `npm test` must not start
// failing there. REQUIRE_WEBKIT (set on CI's e2e step) turns a missing binary
// from a silent project drop into a hard failure, so the subset can't quietly
// stop running there.
function webkitAvailable(): boolean {
  try {
    if (existsSync(webkit.executablePath())) return true;
  } catch {
    // An absent or unreadable browser path means WebKit is unavailable unless required.
  }
  if (process.env.REQUIRE_WEBKIT) {
    throw new Error('REQUIRE_WEBKIT is set but the WebKit binary is not installed');
  }
  return false;
}

const slowMo = Number(process.env.SLOWMO) || 0;
const ciRetries = 2;
const ciAllowedTokens = allowedTokensList(
  ...Array.from({ length: ciRetries + 1 }, (_, retry) => managedAccessTokenForRetry(retry))
);

export default defineConfig({
  ...commonPlaywrightConfig,
  // Measured per environment, not assumed (ADR-0078; full study in
  // scrapbook/e2e-tuning/). A percentage is the wrong shape for this knob: a
  // Playwright worker is a whole Chromium plus a Node runner and costs ~2 cores,
  // so "one worker per core" oversubscribes on any machine.
  //
  // CI retries absorb flakes cheaply and the measured flake rate barely moves
  // between 1 and 6 workers there, so wall clock decides: 4 was fastest.
  // Locally there are no retries, so a flake costs a re-run plus triage — 2
  // workers cut the red-run rate for ~10.2s of wall clock (92.3s vs 82.1s),
  // which the break-even says is worth it after ~15s of attention.
  //
  // Re-measure on new hardware; the shape transfers, the optimum does not.
  workers: process.env.CI ? 4 : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? ciRetries : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...commonPlaywrightConfig.use,
    trace: 'on-first-retry',
  },
  // launchOptions live per-project: the Chromium executable-path fallback must
  // not leak into the WebKit launch. SLOWMO applies to both (ms), e.g.
  // `SLOWMO=500 npm run test:e2e:headed`.
  projects: [
    {
      name: 'chromium',
      // webkit-smoke.spec.ts is the WebKit project's critical-path subset —
      // everything it covers already runs under Chromium via the full suite.
      testIgnore: /webkit-smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { slowMo, executablePath: chromiumExecutablePath() },
      },
    },
    ...(webkitAvailable()
      ? [
          {
            name: 'webkit',
            testMatch: /webkit-smoke\.spec\.ts/,
            use: { ...devices['Desktop Safari'], launchOptions: { slowMo } },
          },
        ]
      : []),
  ],
  webServer: {
    ...commonWebServer,
    env: {
      ...commonWebServer.env,
      ...(process.env.CI ? { ALLOWED_TOKENS_LIST: ciAllowedTokens } : {}),
    },
    // Exercise the production artifact (service worker, adapter output,
    // minification) instead of the dev server. PUBLIC_ENABLE_DEV_HARNESS unlocks
    // the /dev/* test harnesses in the built app (404 otherwise); it's never set
    // in the Netlify deploy. Set DEV_SERVER=1 for fast local iteration against
    // `vite dev`.
    command: process.env.DEV_SERVER
      ? `npx vite dev --port ${playwrightPort}`
      : productionPreviewCommand,
    reuseExistingServer: !process.env.CI,
  },
});
