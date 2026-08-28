// cSpell:ignore SLOWMO
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { defineConfig, devices, firefox, webkit } from '@playwright/test';
import {
  allowedTokensList,
  chromiumLaunchOptions,
  playwrightSlowMo,
  commonPlaywrightConfig,
  commonWebServer,
  developmentServerCommand,
  managedAccessTokenForRetry,
  previewOnlyCommand,
  productionPreviewCommand,
} from './playwright.shared';
import { ENGINE_SMOKE } from './tests/tags';

// An engine-smoke project only joins when its browser binary is installed: CI
// installs each engine explicitly, while local checkouts often have Chromium
// only and `npm test` must keep working there. The standalone jobs set the
// corresponding REQUIRE_* variable so a bad install fails instead of quietly
// dropping that engine's project.
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

// How far past capacity CI goes. Retries make a flake cheap there, so wall clock
// decides among settings whose flake rates don't differ — and at 4 cores they
// don't. Measured 35 reps each with retries off (ADR-0078 §4): 4 workers went
// 1/35 runs red against 3 workers' 3/35, for 3.2s less per run. Twice capacity is
// also the most oversubscription ever measured as safe, so this doubles as the
// ceiling — a re-tune edits this constant rather than re-deriving why `cores`
// meant twice capacity.
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
const CI_OVERSUBSCRIPTION = 2;

const workers = process.env.CI
  ? Math.max(2, Math.floor(saturation * CI_OVERSUBSCRIPTION))
  : Math.max(1, Math.floor(saturation));

// Two, and re-measured rather than inherited (issue #653, ADR-0078 §4). At the
// shipped worker count, 1 of 35 unretried runs went red — 2.9%, but with a 95%
// confidence interval reaching 12.9%, because one observed failure in 35 cannot
// establish a rate. (3 workers, which CI never selects, was 3/35. Pooling the two
// into "4 in 70" would be quoting a number for a configuration that was measured
// 35 times.)
//
// That interval is the whole argument. `0` reddens a run whenever the residual
// does, with no evidence it is rare enough to bear. `1` needs a spec to fail
// twice, which looks like ~0.1% if the attempts are independent — and they are
// not: a retry runs immediately afterwards on the same starved machine, so the
// squaring flatters exactly the failure mode being retried. Dropping to 1 on a
// point estimate whose interval spans 12.9% would be choosing a knob against a
// number the data doesn't support, which is the mistake §4 records above.
//
// What changes instead is that the debt is no longer silent: every retried pass
// is annotated (playwright-flaky-reporter.ts).
//
// Those three specs are fixed and re-measured at 0/35 (ADR-0078 §4a): they were
// one bug — a pinch aimed at a dialog still flying in, so the modal's launch dead
// zone swallowed it. The red-run rate did not move with them; the same sweep put a
// run red on `pointer exploration still snaps a hexagon gap and commits the
// highlighted color`, a spec in a different subsystem. So every argument above
// still holds, and reducing this number is downstream of that spec rather than of
// another sweep.
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
  // not leak into another engine's launch. SLOWMO applies to every engine (ms), e.g.
  // `SLOWMO=500 npm run test:e2e:headed`.
  projects: [
    {
      name: 'chromium',
      // The full suite covers this critical behavior elsewhere; tagged smoke
      // specs are reserved for the non-Blink engine projects.
      grepInvert: ENGINE_SMOKE,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumLaunchOptions(),
      },
    },
    ...(engineAvailable('Firefox', () => firefox.executablePath(), 'REQUIRE_FIREFOX')
      ? [
          {
            name: 'firefox',
            grep: ENGINE_SMOKE,
            use: { ...devices['Desktop Firefox'], launchOptions: { slowMo: playwrightSlowMo } },
          },
        ]
      : []),
    ...(engineAvailable('WebKit', () => webkit.executablePath(), 'REQUIRE_WEBKIT')
      ? [
          {
            name: 'webkit',
            grep: ENGINE_SMOKE,
            use: { ...devices['Desktop Safari'], launchOptions: { slowMo: playwrightSlowMo } },
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
    // `vite dev`. SPLOTCH_E2E_PREBUILT skips the build and serves the existing
    // bundle — set it only from a harness that just built (the worker sweep
    // builds once for all its reps), never to dodge a build: a stale bundle
    // passes tests against code that no longer exists.
    command: process.env.DEV_SERVER
      ? developmentServerCommand
      : process.env.SPLOTCH_E2E_PREBUILT
        ? previewOnlyCommand
        : productionPreviewCommand,
    reuseExistingServer: false,
  },
});
