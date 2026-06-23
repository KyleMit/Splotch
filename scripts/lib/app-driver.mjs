// Playwright helpers for scripts that drive the live Splotch app in a browser
// (store-shots.mjs, gen-large-image.mjs): dev-server lifecycle, page setup,
// and the UI gestures (pick a color, set stroke size, draw) the app needs.

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, sleep } from './utils.mjs';

const isUp = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

// Reuse a dev server already listening on the port, or start one (killed via
// the returned stop(), and on process exit as a backstop). Spawns vite's bin
// directly with node — no shell — so stop() reliably kills it on Windows too.
export async function ensureDevServer(port, timeout = 90_000) {
  const base = `http://localhost:${port}/`;
  if (await isUp(base)) {
    console.log(`Reusing dev server at ${base}`);
    return { base, stop: () => {} };
  }

  console.log('Starting dev server…');
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [vite, 'dev', '--port', String(port), '--strictPort'], {
    cwd: join(ROOT, 'web'),
    stdio: 'ignore',
  });
  const stop = () => {
    try {
      server.kill();
    } catch {}
  };
  process.on('exit', stop);
  process.on('SIGINT', () => {
    stop();
    process.exit(1);
  });

  const deadline = Date.now() + timeout;
  while (!(await isUp(base))) {
    if (Date.now() > deadline) {
      stop();
      throw new Error(`Dev server at ${base} did not become ready within ${timeout}ms`);
    }
    await sleep(500);
  }
  console.log('Server ready.');
  return { base, stop };
}

// Open the app in a fresh browser context sized to `device`; resolves once the
// drawing canvas is ready.
export async function openAppPage(browser, base, device) {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.deviceScaleFactor,
    hasTouch: true,
    isMobile: false,
  });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#drawingCanvas');
  await sleep(400);
  return { ctx, page };
}

export const canvasBox = (page) => page.locator('#drawingCanvas').boundingBox();

// The action drawer (eraser / coloring book / camera / undo) starts collapsed.
export async function expandDrawer(page) {
  const toggle = page.locator('.drawer-toggle');
  if ((await toggle.count()) && (await page.locator('#coloringBookButton').count()) === 0) {
    await toggle.click();
    await sleep(350);
  }
}

// Pick a palette swatch by hex, then respect the 100ms post-color-change guard
// the drawing engine enforces before it starts a new stroke. Returns false if
// the swatch isn't shown at this viewport width.
export async function pickColor(page, hex) {
  const swatch = page.locator(`.color-swatch[data-color="${hex}"]`);
  if ((await swatch.count()) && (await swatch.first().isVisible())) {
    await swatch.first().click({ force: true });
    await sleep(220);
    return true;
  }
  return false;
}

export async function setStrokeSize(page, size) {
  const btn = page.locator('#strokeWidthButton');
  if (!(await btn.count())) return;
  await btn.click();
  await sleep(150);
  await page.locator(`button[aria-label="Size ${size}"]`).click();
  await sleep(150);
}

// Draw one freehand stroke through a list of {x,y} canvas-relative points.
export async function drawStroke(page, box, pts) {
  if (pts.length === 0) return;
  const abs = pts.map((p) => ({ x: box.x + p.x, y: box.y + p.y }));
  await page.mouse.move(abs[0].x, abs[0].y);
  await page.mouse.down();
  for (let i = 1; i < abs.length; i++) {
    await page.mouse.move(abs[i].x, abs[i].y, { steps: 6 });
  }
  await page.mouse.up();
  await sleep(40);
}

// Click an empty canvas corner to close any open menu before a screenshot.
export async function dismissMenu(page) {
  await page.locator('#drawingCanvas').click({ position: { x: 5, y: 5 } });
  await sleep(200);
}

// --- point generators ------------------------------------------------------

export function circlePts(cx, cy, r, turns = 1, n = 48) {
  const pts = [];
  for (let i = 0; i <= n * turns; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function arcPts(cx, cy, r, a0, a1, n = 60) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function zigzag(x0, y, x1, amp, step) {
  const pts = [];
  let up = true;
  for (let x = x0; x <= x1; x += step) {
    pts.push({ x, y: y + (up ? -amp : amp) });
    up = !up;
  }
  return pts;
}
