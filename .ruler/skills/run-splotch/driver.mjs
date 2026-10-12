#!/usr/bin/env node
// Drive the running Splotch web app: launch a server, open a real browser,
// optionally draw a stroke, and save a screenshot. Uses Playwright's bundled
// Chromium (already a devDependency; `npm run test:e2e:install` fetches it) —
// there is no chromium-cli on this project.
//
// Usage:
//   node .claude/skills/run-splotch/driver.mjs [options]
//
// Options:
//   --route <path>     Route to open (default "/"). e.g. /admin, /privacy, /dev/engine
//   --out <file>       Screenshot path (default screenshots/splotch.png)
//   --draw             Drag a stroke across the canvas before the shot (route "/" only)
//   --headed           Show the browser window (default headless)
//   --port <n>         Dev server port (default 5199)
//   --keep             Leave the dev server running after the shot (prints the URL)
//   --url <baseURL>    Drive an already-running server instead of launching one
//
// Exit code is non-zero if the target route never became interactive.

import { chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
// The generated copies under .claude/skills/ and .agents/skills/ sit at the same
// depth as this .ruler/skills/ source, so one relative specifier resolves from
// all three; tools/tests/run-splotch-driver.test.mjs holds that depth.
import { RELEASABLE_STDIO, spawnViteServer } from '../../../tools/lib/vite-server.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..');
const SERVER_OWNERSHIP_SETTLE_MS = 250;

// Cloud sessions cache Chromium under PLAYWRIGHT_BROWSERS_PATH, but the pinned
// revision can drift from what playwright-core resolves (e.g. the env installed
// 1223 while this version wants 1228), so `chromium.launch()` fails with
// "Executable doesn't exist". If the resolved binary is missing, fall back to
// any Chromium present under the browsers path so a screenshot still works.
// `PLAYWRIGHT_CHROMIUM` overrides; returning undefined lets Playwright use its
// own (correct) binary.
function chromiumExecutablePath() {
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

const { values } = parseArgs({
  options: {
    route: { type: 'string', default: '/' },
    out: { type: 'string', default: 'screenshots/splotch.png' },
    draw: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    port: { type: 'string', default: '5199' },
    url: { type: 'string' },
  },
});

const route = values.route;
const out = resolve(repoRoot, values.out);
const draw = values.draw;
const headed = values.headed;
const keep = values.keep;
const port = Number(values.port);
const externalUrl = values.url ?? null;

// Readiness predicate per route — what to poll for before interacting.
// For "/", the engine boots at module-evaluation time, before hydration
// (ADR-0072), and changes the canvas backing store off the browser's 300x150
// default just before binding pointer listeners. Production tiled mode uses a
// deliberate 1x1 input bitmap (ADR-0089), so readiness also requires visible
// CSS bounds rather than a large bitmap.
const ready = {
  '/': () => {
    const c = document.getElementById('drawingCanvas');
    if (!(c instanceof HTMLCanvasElement)) return false;
    const rect = c.getBoundingClientRect();
    return (c.width !== 300 || c.height !== 150) && rect.width > 0 && rect.height > 0;
  },
  '/dev/engine': () => window.__engineReady === true,
};
const isReady = ready[route] ?? (() => document.readyState === 'complete');

// { server, stop, release } from spawnViteServer once this run owns a server.
let vite = null;

function startServer() {
  // `vite dev` is fastest for a screenshot and serves every route except the
  // /api/* functions (use `npm run dev:netlify` by hand if you need those).
  // PUBLIC_ENABLE_DEV_HARNESS unlocks the /dev/* harness routes (404 otherwise).
  //
  // spawnViteServer runs vite's bin directly in a detached process group, so
  // stop() reaps the process that actually holds the port — `spawn('npx', …)` +
  // child.kill() orphans a `vite dev` on the port for hours, the failure this
  // skill's own SKILL.md warns about.
  //
  // --keep releases that group instead of killing it, so a kept server takes
  // RELEASABLE_STDIO: /dev/null on both streams, the only sink that outlives
  // this process. Inheriting either one pins the caller's pipe open and the
  // invoking command never sees EOF (every agent Bash call and CI log capture);
  // piping either one is the opposite hazard, because release() would have to
  // drop the pipe and the survivor's next log line then dies of EPIPE. Both
  // halves are load-bearing: vite's routine chatter is stdout (a few HMR
  // reloads), its diagnostics are stderr (one fs-allowlist 403). A kept server
  // therefore prints nothing; run without --keep to watch it.
  vite = spawnViteServer(port, {
    env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' },
    ...(keep ? RELEASABLE_STDIO : { stdout: 'pipe', stderr: 'inherit' }),
  });
  // vite's own chatter joins its diagnostics on our stderr, leaving this
  // process's stdout to the report main() prints.
  vite.server.stdout?.on('data', (chunk) => process.stderr.write(chunk));
}

function finishServer(baseURL) {
  if (!vite) return;
  if (!keep) {
    vite.stop();
    return;
  }
  vite.release();
  console.log(
    `server left running: ${baseURL} (process group ${vite.server.pid}) — stop with: kill -- -${vite.server.pid}`
  );
}

function serverStartError(baseURL) {
  return new Error(
    `dev server could not start on ${baseURL}; select another unused port with --port and retry`
  );
}

async function waitForServer(baseURL) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (vite?.server.exitCode !== null) throw serverStartError(baseURL);
    let response;
    try {
      response = await fetch(baseURL, { method: 'HEAD' });
    } catch {}
    if (response?.ok || response?.status === 404) {
      await new Promise((resolve) => setTimeout(resolve, SERVER_OWNERSHIP_SETTLE_MS));
      if (vite?.server.exitCode !== null) throw serverStartError(baseURL);
      return;
    }
    if (Date.now() > deadline) throw new Error(`server never came up at ${baseURL}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// Cold `vite dev` re-optimizes deps on first hit, briefly 504-ing modules and
// auto-reloading. Poll the readiness predicate (don't keep re-navigating) so we
// ride that reload to a settled page — same trick as web/tests/global-setup.ts.
async function waitForRoute(page, url) {
  const deadline = Date.now() + 90_000;
  let last = 0;
  for (;;) {
    if (Date.now() - last > 15_000) {
      await page.goto(url, { waitUntil: 'commit', timeout: 60_000 }).catch(() => {});
      last = Date.now();
    }
    if (await page.evaluate(isReady).catch(() => false)) break;
    if (Date.now() > deadline) throw new Error(`${route} never became interactive`);
    await page.waitForTimeout(500);
  }
}

async function drawStroke(page) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 200, cy - 80);
  await page.mouse.down();
  for (const [dx, dy] of [
    [-100, 80],
    [40, -120],
    [160, 100],
    [240, -40],
  ]) {
    await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
}

// The browser is closed in a finally so a throw between launch and screenshot
// still reaps it; the server's own teardown is main()'s job either way.
async function captureRoute(baseURL) {
  const executablePath = chromiumExecutablePath();
  if (executablePath) {
    process.stderr.write(`playwright's pinned Chromium is missing; using ${executablePath}\n`);
  }
  const browser = await chromium.launch({ headless: !headed, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await waitForRoute(page, baseURL + route);
    if (draw && route === '/') await drawStroke(page);
    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
  } finally {
    await browser.close();
  }
}

async function main() {
  const baseURL = externalUrl ? String(externalUrl) : `http://localhost:${port}`;
  if (!externalUrl) {
    startServer();
    await waitForServer(baseURL);
  }

  await captureRoute(baseURL);
  console.log(`screenshot: ${out}`);
  console.log(`route ready: ${baseURL}${route}`);

  finishServer(baseURL);
}

main().catch((err) => {
  console.error('driver failed:', err.message);
  vite?.stop();
  process.exit(1);
});
