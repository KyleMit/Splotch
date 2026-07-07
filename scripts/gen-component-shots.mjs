// Generates the Drawing Canvas screenshots embedded in the /components catalog
// route by driving the real app in a headless browser (the canvas can't be
// mounted as an inert demo — it owns the imperative engine). Re-run after any
// visual change to the canvas, palette colors, or the Farm coloring book:
//   npm run gen:component-shots
// Output is committed alongside the route: web/src/routes/components/*.jpg

import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { ROOT, chromiumExecutablePath, sleep } from './lib/utils.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
  pickColor,
  drawStroke,
  circlePts,
  arcPts,
  zigzag,
} from './lib/app-driver.mjs';

const OUT = join(ROOT, 'web', 'src', 'routes', 'components');
const PORT = 5230;
const VIEWPORT = { width: 1100, height: 760, deviceScaleFactor: 1 };

// Brand palette (from src/lib/state/colors.svelte.ts)
const C = {
  blue: '#62A2E9',
  green: '#8CC864',
  yellow: '#F9D24F',
  orange: '#F89C45',
  red: '#EC534E',
};

const shot = (page, file) =>
  page
    .locator('.canvas-container')
    .screenshot({ path: join(OUT, file), type: 'jpeg', quality: 82 });

// Rainbow, sun, grass, and a flower — the same cheerful scene as the store
// shots, trimmed to fit a single landscape canvas.
async function drawScene(page, box) {
  const W = box.width,
    H = box.height;
  const cx = W * 0.55,
    cy = H * 0.55;
  const r0 = Math.min(W * 0.34, H * 0.4);
  const step = Math.max(18, r0 * 0.16);
  const arcColors = [C.red, C.orange, C.yellow, C.green];
  for (let i = 0; i < arcColors.length; i++) {
    if (await pickColor(page, arcColors[i])) {
      await drawStroke(page, box, arcPts(cx, cy, r0 - i * step, Math.PI, Math.PI * 2));
    }
  }
  if (await pickColor(page, C.yellow)) {
    const sx = W * 0.14,
      sy = H * 0.2,
      r = Math.min(W, H) * 0.07;
    await drawStroke(page, box, circlePts(sx, sy, r, 2));
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      await drawStroke(page, box, [
        { x: sx + Math.cos(a) * r * 1.5, y: sy + Math.sin(a) * r * 1.5 },
        { x: sx + Math.cos(a) * r * 2.1, y: sy + Math.sin(a) * r * 2.1 },
      ]);
    }
  }
  if (await pickColor(page, C.green)) {
    await drawStroke(page, box, zigzag(W * 0.15, H * 0.92, W * 0.92, 12, 24));
    await drawStroke(page, box, [
      { x: W * 0.82, y: H * 0.9 },
      { x: W * 0.82, y: H * 0.72 },
    ]);
  }
  if (await pickColor(page, C.red)) {
    await drawStroke(page, box, circlePts(W * 0.82, H * 0.68, Math.min(W, H) * 0.045, 2));
  }
}

// Loose magic-brush scribbles that reveal the coloring page's colored twin.
async function scribbleMagic(page, box) {
  const W = box.width,
    H = box.height;
  for (const [cx, cy, rx, ry] of [
    [0.5, 0.42, 0.2, 0.18],
    [0.32, 0.68, 0.12, 0.1],
    [0.7, 0.65, 0.13, 0.11],
  ]) {
    const pts = [];
    for (let i = 0; i <= 70; i++) {
      const a = (i / 7) * Math.PI;
      const rr = i / 70;
      pts.push({ x: W * cx + Math.cos(a) * W * rx * rr, y: H * cy + Math.sin(a) * H * ry * rr });
    }
    await drawStroke(page, box, pts);
  }
}

async function applyColoringPage(page) {
  await expandDrawer(page);
  await page.locator('#coloringBookButton').click();
  const dialog = page.locator('#coloring-book-dialog');
  await dialog
    .getByRole('button', { name: /coloring book/i })
    .first()
    .click();
  await dialog
    .getByRole('button', { name: /coloring page/i })
    .first()
    .click();
  await page.locator('#coloringOverlay').waitFor({ state: 'visible' });
  await sleep(600);
}

async function enableMagicBrush(page) {
  const magic = page.locator('#magicBrushButton');
  if ((await magic.getAttribute('aria-pressed')) !== 'true') await magic.click();
  await sleep(200);
}

const { base, stop } = await ensureDevServer(PORT);
try {
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });

  {
    const { ctx, page } = await openAppPage(browser, base, VIEWPORT);
    const box = await canvasBox(page);
    await drawScene(page, box);
    await sleep(300);
    await shot(page, 'drawing-canvas.jpg');
    console.log('wrote drawing-canvas.jpg');
    await ctx.close();
  }

  {
    const { ctx, page } = await openAppPage(browser, base, VIEWPORT);
    await applyColoringPage(page);
    await enableMagicBrush(page);
    const box = await canvasBox(page);
    await scribbleMagic(page, box);
    await sleep(300);
    await shot(page, 'coloring-page.jpg');
    console.log('wrote coloring-page.jpg');
    await ctx.close();
  }

  await browser.close();
} finally {
  stop();
}
