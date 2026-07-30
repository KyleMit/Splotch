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

// Capacity in workers. Local runs sit here: with retries off a flake costs a
// re-run plus the attention to triage it, which no wall-clock saving covers.
const saturation = cores / CORES_PER_WORKER;

// How far past capacity CI goes: twice it, i.e. `cores`. Retries make a flake
// cheap there, so wall clock decides among settings whose flake rates don't
// differ — and at 4 cores they don't. Measured 35 reps each with retries off
// (ADR-0078 §4): 4 workers went 1/35 runs red against 3 workers' 3/35, for 3.2s
// less per run. `cores` is also self-limiting at twice capacity, which is the
// most oversubscription ever measured as safe.
//
// Worth knowing before re-tuning: an earlier pass of that same re-measure put
// this at 1.5× on a 15-rep sweep where 3 workers were 0/15 and 4 were 6/15. Both
// numbers were real; nearly all of the difference was ONE spec whose fixed sleep
// failed more often the more starved the worker (the tell was 6 workers failing
// in exactly 15 of 15 reps — deterministic, not flaky). Fixing that spec removed
// the gradient. A worker count tuned against a rate one bad spec dominates is
// tuning around the spec.
//
// Two caveats the hardware here cannot settle:
//   • Only 4 cores was ever measured, so bigger machines are extrapolation from a
//     ratio fitted at one point. 6 and 8 workers on 4 cores — 3× and 4× capacity
//     — were only ever measured *before* that spec was fixed, so the ceiling
//     above 2× is genuinely unknown rather than merely untested.
//   • availableParallelism() counts LOGICAL CPUs, and both measurement boxes ran
//     one thread per core, so "cores / 2" and "physical cores" were the same
//     number there. On 8 logical / 4 physical this says 8 where physical capacity
//     argues 4 — the likeliest place it is wrong.
// Override with `--workers=N`; re-measure with .github/workflows/worker-sweep.yml.
const workers = process.env.CI ? Math.max(2, cores) : Math.max(1, Math.floor(saturation));

const slowMo = Number(process.env.SLOWMO) || 0;

// Two, and re-measured rather than inherited (issue #653, ADR-0078 §4). The
// residual unretried red-run rate at the shipped worker count is ~5.7% — 4 red
// runs in 70, spread over three zoom/pinch specs, the worst at 2/35 attempts.
//
// So `0` would redden about one run in eighteen. `1` looks sufficient on paper
// (5.7%² ≈ 0.3% per spec) but that squaring assumes the two attempts are
// independent, and a retry runs immediately afterwards on the same starved
// machine — precisely the correlation the assumption denies. At a per-attempt
// rate this close to the threshold, the cost of being wrong is a red PR gate on
// work that is fine.
//
// What changes instead is that the debt is no longer silent: every retried pass
// is annotated (playwright-flaky-reporter.ts). Reducing this number is downstream
// of fixing those three specs (issue #665), the way fixing one spec took 4
// workers from 6/15 red to 1/35.
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
