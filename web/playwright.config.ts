// cSpell:ignore SLOWMO
import { existsSync, readdirSync } from 'node:fs';
import { chromium, defineConfig, devices, webkit } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

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
  } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const builds = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const build of builds) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = `${base}/${build}/${sub}/chrome`;
        if (existsSync(p)) return p;
      }
    }
  } catch {}
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
  } catch {}
  if (process.env.REQUIRE_WEBKIT) {
    throw new Error('REQUIRE_WEBKIT is set but the WebKit binary is not installed');
  }
  return false;
}

const slowMo = Number(process.env.SLOWMO) || 0;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  // Use all cores everywhere. Playwright otherwise defaults to ~50% of logical
  // cores, leaving half the machine idle even though every spec is
  // parallel-safe — on a 4-core box that's the difference between ~90s and
  // ~58s for the suite.
  workers: '100%',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
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
    // Exercise the production artifact (service worker, adapter output,
    // minification) instead of the dev server. `vite preview` defaults to 4173,
    // matching PORT above. PUBLIC_ENABLE_DEV_HARNESS unlocks the /dev/* test
    // harnesses in the built app (404 otherwise); it's never set in the Netlify
    // deploy. Set DEV_SERVER=1 for fast local iteration against `vite dev`.
    command: process.env.DEV_SERVER
      ? `npx vite dev --port ${PORT}`
      : `npx vite build && npx vite preview --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // ADMIN_ACCESS_TOKEN is the known secret tests/admin.spec.ts signs in with.
    // Token mutations land in the in-memory fallback (no Netlify Blobs here),
    // so they reset with the server and never touch real data.
    env: { PUBLIC_ENABLE_DEV_HARNESS: 'true', ADMIN_ACCESS_TOKEN: 'test-admin-secret' },
  },
});
