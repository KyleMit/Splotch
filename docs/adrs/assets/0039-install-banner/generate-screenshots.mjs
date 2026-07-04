#!/usr/bin/env node
// One-off generator for the ADR-0039 install-banner screenshots that live in
// this folder. Not wired into npm scripts and not kept in sync automatically —
// re-run it by hand if the banner changes enough that the ADR images mislead:
//
//   node docs/adrs/assets/0039-install-banner/generate-screenshots.mjs [--url http://localhost:5173]
//
// Each scenario gets a fresh Playwright browser context (clean localStorage)
// with an emulated user agent + viewport, draws the three strokes that earn
// the banner, then forces the banner into the mode under test:
//   • one-tap  — dispatch a synthetic `beforeinstallprompt` (the module's
//                capture listener treats it exactly like Chromium's real one)
//   • manual   — the UA alone selects the ios/android hint; click "How?" to
//                expand the inline steps
//   • none     — iOS Chrome (CriOS) UA; the shot documents the banner's absence

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const outDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(outDir, '../../../..');

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
};

const scenarios = [
  {
    out: 'desktop-chrome-one-tap.png',
    viewport: { width: 1280, height: 800 },
    oneTap: true,
  },
  {
    out: 'android-phone-one-tap.png',
    userAgent: UA.androidChrome,
    viewport: { width: 412, height: 915 },
    mobile: true,
    oneTap: true,
  },
  {
    out: 'android-phone-menu-hint.png',
    userAgent: UA.androidChrome,
    viewport: { width: 412, height: 915 },
    mobile: true,
    expandHint: true,
  },
  {
    out: 'ios-phone-safari-share-hint.png',
    userAgent: UA.iphoneSafari,
    viewport: { width: 390, height: 844 },
    mobile: true,
    expandHint: true,
  },
  {
    out: 'ios-tablet-safari-share-hint.png',
    userAgent: UA.ipadSafari,
    viewport: { width: 1180, height: 820 },
    mobile: true,
    expandHint: true,
  },
  {
    out: 'ios-phone-chrome-no-banner.png',
    userAgent: UA.iphoneChrome,
    viewport: { width: 390, height: 844 },
    mobile: true,
    expectAbsent: true,
  },
];

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    port: { type: 'string', default: '5199' },
  },
});

let server;
async function startServer(port) {
  server = spawn('npx', ['vite', 'dev', '--port', String(port), '--strictPort'], {
    cwd: resolve(repoRoot, 'web'),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  server.stdout.on('data', (d) => process.stderr.write(d));
  const baseURL = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const r = await fetch(baseURL, { method: 'HEAD' });
      if (r.ok || r.status === 404) return baseURL;
    } catch {}
    if (Date.now() > deadline) throw new Error(`server never came up at ${baseURL}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// Same readiness trick as the run-splotch driver: the engine resizes the canvas
// backing store off its 300×150 default right before it binds pointer listeners.
async function waitForCanvas(page, url) {
  const deadline = Date.now() + 90_000;
  let lastNav = 0;
  for (;;) {
    if (Date.now() - lastNav > 15_000) {
      await page.goto(url, { waitUntil: 'commit', timeout: 60_000 }).catch(() => {});
      lastNav = Date.now();
    }
    const ready = await page
      .evaluate(() => {
        const c = document.getElementById('drawingCanvas');
        return !!c && c.width > 300;
      })
      .catch(() => false);
    if (ready) return;
    if (Date.now() > deadline) throw new Error('canvas never became interactive');
    await page.waitForTimeout(500);
  }
}

// The banner only appears after STROKES_BEFORE_PROMPT committed strokes.
async function drawThreeStrokes(page) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.min(box.width, box.height) * 0.28;
  for (const [x1, y1, x2, y2] of [
    [cx - r, cy - r * 0.6, cx + r, cy - r * 0.2],
    [cx - r * 0.8, cy, cx + r * 0.7, cy + r * 0.4],
    [cx - r * 0.5, cy + r * 0.5, cx + r * 0.9, cy - r * 0.5],
  ]) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  }
}

async function run() {
  const baseURL = values.url ?? (await startServer(Number(values.port)));
  const browser = await chromium.launch();

  for (const s of scenarios) {
    const context = await browser.newContext({
      viewport: s.viewport,
      userAgent: s.userAgent,
      deviceScaleFactor: 2,
      isMobile: !!s.mobile,
      hasTouch: !!s.mobile,
    });
    const page = await context.newPage();
    await waitForCanvas(page, baseURL + '/');

    if (s.oneTap) {
      await page.evaluate(() => {
        const e = new Event('beforeinstallprompt', { cancelable: true });
        e.prompt = () => Promise.resolve();
        e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: '' });
        window.dispatchEvent(e);
      });
    }

    await drawThreeStrokes(page);

    if (s.expectAbsent) {
      await page.waitForTimeout(1000);
      if (await page.locator('.install-banner').count()) {
        throw new Error(`${s.out}: banner appeared but this context should show none`);
      }
    } else {
      await page.locator('.install-banner').waitFor({ timeout: 5000 });
      if (s.expandHint) {
        await page.locator('.install-cta').click();
        await page.locator('.install-hint').waitFor({ timeout: 5000 });
      }
      await page.waitForTimeout(600); // let the fly/fade transitions settle
    }

    const out = resolve(outDir, s.out);
    await page.screenshot({ path: out });
    console.log(`✓ ${s.out}`);
    await context.close();
  }

  await browser.close();
  if (server) server.kill('SIGTERM');
}

run().catch((err) => {
  console.error('generate-screenshots failed:', err.message);
  if (server) server.kill('SIGTERM');
  process.exit(1);
});
