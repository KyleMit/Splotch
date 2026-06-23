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

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..');

const { values } = parseArgs({
  options: {
    route: { type: 'string', default: '/' },
    out: { type: 'string', default: 'screenshots/splotch.png' },
    draw: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    port: { type: 'string', default: '5199' },
    url: { type: 'string' }
  }
});

const route = values.route;
const out = resolve(repoRoot, values.out);
const draw = values.draw;
const headed = values.headed;
const keep = values.keep;
const port = Number(values.port);
const externalUrl = values.url ?? null;

// Readiness predicate per route — what to poll for before interacting.
// For "/", the <canvas> is in the DOM before onMount runs initDrawingCanvas,
// which attaches the pointer listeners. initDrawingCanvas resizes the backing
// store off its 300x150 default just before binding them, so a non-default
// width means the engine is initialized and a stroke will register.
const ready = {
  '/': () => {
    const c = document.getElementById('drawingCanvas');
    return !!c && c.width > 300;
  },
  '/dev/engine': () => window.__engineReady === true
};
const isReady = ready[route] ?? (() => document.readyState === 'complete');

let server;
function startServer() {
  // `vite dev` is fastest for a screenshot and serves every route except the
  // /api/* functions (use `npm run dev:netlify` by hand if you need those).
  // PUBLIC_ENABLE_DEV_HARNESS unlocks the /dev/* harness routes (404 otherwise).
  server = spawn('npx', ['vite', 'dev', '--port', String(port), '--strictPort'], {
    cwd: repoRoot,
    env: { ...process.env, PUBLIC_ENABLE_DEV_HARNESS: 'true' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  server.stdout.on('data', (d) => process.stderr.write(d)); // surface vite logs on stderr
}

async function waitForServer(baseURL) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const r = await fetch(baseURL, { method: 'HEAD' });
      if (r.ok || r.status === 404) return;
    } catch {}
    if (Date.now() > deadline) throw new Error(`server never came up at ${baseURL}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  const baseURL = externalUrl ? String(externalUrl) : `http://localhost:${port}`;
  if (!externalUrl) {
    startServer();
    await waitForServer(baseURL);
  }

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Cold `vite dev` re-optimizes deps on first hit, briefly 504-ing modules and
  // auto-reloading. Poll the readiness predicate (don't keep re-navigating) so we
  // ride that reload to a settled page — same trick as web/tests/global-setup.ts.
  const url = baseURL + route;
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

  if (draw && route === '/') {
    const box = await page.locator('#drawingCanvas').boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx - 200, cy - 80);
      await page.mouse.down();
      for (const [dx, dy] of [[-100, 80], [40, -120], [160, 100], [240, -40]]) {
        await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
      }
      await page.mouse.up();
      await page.waitForTimeout(200);
    }
  }

  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`screenshot: ${out}`);
  console.log(`route ready: ${baseURL}${route}`);

  await browser.close();
  if (keep && !externalUrl) {
    console.log(`server left running: ${baseURL} (pid ${server.pid}) — kill with: npx kill-port ${port}`);
  } else if (server) {
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('driver failed:', err.message);
  if (server) server.kill('SIGTERM');
  process.exit(1);
});
