// cSpell:ignore SLOWMO
import { existsSync, readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
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

// A Playwright worker is a whole Chromium (browser, renderer, GPU, network and
// utility processes) plus a Node runner, and demands ~2 cores to run
// unthrottled: per-test latency inflation tracked w/2 past saturation on two
// unrelated 4-core machines — 2.0–2.5 locally, 2.2–2.8 on CI (ADR-0078 §2, full
// study in scrapbook/e2e-tuning/). That ratio is what generalises, so the count
// is derived from it rather than hardcoded, and a percentage is the wrong shape
// for the knob entirely: "one worker per core" oversubscribes on any machine.
const CORES_PER_WORKER = 2;

// availableParallelism() rather than cpus().length — it respects cgroup CPU
// quotas, so it does not over-report inside a container.
const cores = availableParallelism();

// The CI/local split encodes flake COST, not hardware, which is why it survives
// the derivation:
//   • Locally flakes are expensive (retries: 0 — a re-run plus the attention to
//     notice and triage it), so sit at saturation: cores / CORES_PER_WORKER.
//   • On CI retries absorb them cheaply and the measured flake rate barely moves
//     between 1 and 6 workers, so wall clock decides and oversubscribing pays:
//     2→4 workers bought 9.4s there despite being past saturation.
// At 4 cores this reproduces both measured optima exactly (local 2, CI 4).
//
// Two limits to respect before trusting it on new hardware. Only 4 cores was
// ever measured, so 8 and 16 are extrapolation; and availableParallelism()
// counts LOGICAL CPUs while the measurement box had one thread per core, so SMT
// is untested and is where the formula is most likely to be wrong — on 8
// logical / 4 physical it says 4 where physical capacity argues 2. Override with
// `--workers=N`; re-measure with .github/workflows/worker-sweep.yml.
const workers = process.env.CI
  ? Math.max(2, cores)
  : Math.max(1, Math.floor(cores / CORES_PER_WORKER));

const slowMo = Number(process.env.SLOWMO) || 0;
const ciRetries = 2;
const ciAllowedTokens = allowedTokensList(
  ...Array.from({ length: ciRetries + 1 }, (_, retry) => managedAccessTokenForRetry(retry))
);

export default defineConfig({
  ...commonPlaywrightConfig,
  workers,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? ciRetries : 0,
  // The flaky reporter collects nothing when retries are off, so it needs no
  // branch — it only has anything to say where retries can mask a failure.
  reporter: [['list'], ['html', { open: 'never' }], ['./playwright-flaky-reporter.ts']],
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
