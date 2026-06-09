// Regenerates static/large-image.png by replaying the SVG drawing instructions
// in static/large-image.svg onto the live Splotch canvas.
// The output is 1920x1080 (16:9 landscape, same as Google Play tablet spec).
//
// The dev server is started automatically; no manual setup needed.
//   node scripts/gen-large-image.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SVG_FILE = path.join(ROOT, 'static', 'large-image.svg');
const OUT = path.join(ROOT, 'static', 'large-image.png');
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;

// SVG viewBox dimensions
const SVG_W = 2265, SVG_H = 1388;

// 1280x720 @ 1.5x = 1920x1080 screenshot
const DEVICE = { width: 1280, height: 720, deviceScaleFactor: 1.5 };

// Nearest palette colour for each SVG stroke colour
const COLOR_MAP = {
  '#86aed3': '#62A2E9',
  '#95c274': '#8CC864',
  '#b57cd0': '#AB71E1',
  '#dd6158': '#EC534E',
  '#e79255': '#F89C45',
  '#e8cf77': '#F9D24F',
};

// SIZE_TO_PX: {1:2, 2:4, 3:8, 4:14, 5:22} (from strokeWidth.svelte.ts)
function svgWidthToAppSize(w) {
  if (w <= 9) return 2;   // SVG 8   → app 4px
  if (w <= 14) return 3;  // SVG 14  → app 8px
  return 4;               // SVG 15+ → app 14px
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Extract a single XML attribute value from a tag string.
function attr(tag, name) {
  const re = new RegExp(`(?:^|\\s)${name}="([^"]*)"`);
  const m = tag.match(re);
  return m ? m[1] : null;
}

// Parse an SVG 'M x y L x y …' path string into [{x,y}] points.
function parsePath(d) {
  const pts = [];
  const tokens = d.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i] === 'M' || tokens[i] === 'L') {
      pts.push({ x: parseFloat(tokens[i + 1]), y: parseFloat(tokens[i + 2]) });
      i += 3;
    } else {
      i++;
    }
  }
  return pts;
}

function circlePts(cx, cy, r, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

// Return [{color, sw, pts}] for every drawable element in the SVG.
function parseSvg(text) {
  const strokes = [];
  for (const m of text.matchAll(/<path\s[^>]*\/>/g)) {
    const d = attr(m[0], 'd');
    const color = attr(m[0], 'stroke');
    const sw = parseFloat(attr(m[0], 'stroke-width') ?? '1');
    if (d && color) {
      const pts = parsePath(d);
      if (pts.length) strokes.push({ color, sw, pts });
    }
  }
  for (const m of text.matchAll(/<circle\s[^>]*\/>/g)) {
    const cx = parseFloat(attr(m[0], 'cx') ?? '0');
    const cy = parseFloat(attr(m[0], 'cy') ?? '0');
    const r = parseFloat(attr(m[0], 'r') ?? '1');
    const color = attr(m[0], 'stroke');
    const sw = parseFloat(attr(m[0], 'stroke-width') ?? '1');
    if (color) strokes.push({ color, sw, pts: circlePts(cx, cy, r) });
  }
  return strokes;
}

async function pickColor(page, hex) {
  const sw = page.locator(`.color-swatch[data-color="${hex}"]`);
  if ((await sw.count()) && (await sw.first().isVisible())) {
    await sw.first().click({ force: true });
    await sleep(220);
    return true;
  }
  return false;
}

async function setStroke(page, size) {
  const btn = page.locator('#strokeWidthButton');
  if (!(await btn.count())) return;
  await btn.click();
  await sleep(150);
  await page.locator(`button[aria-label="Size ${size}"]`).click();
  await sleep(150);
}

async function drawStroke(page, box, pts) {
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

async function expandDrawer(page) {
  const toggle = page.locator('.drawer-toggle');
  if ((await toggle.count()) && (await page.locator('#coloringBookButton').count()) === 0) {
    await toggle.click();
    await sleep(350);
  }
}

async function waitForServer(url, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Server at ${url} did not become ready within ${timeout}ms`);
}

async function run() {
  const server = spawn('npx', ['vite', 'dev', '--port', String(PORT)], {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const cleanup = () => { try { server.kill(); } catch {} };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  try {
    console.log('Starting dev server…');
    await waitForServer(BASE);
    console.log('Server ready.');

    const svgText = readFileSync(SVG_FILE, 'utf8');
    const svgStrokes = parseSvg(svgText);
    console.log(`Parsed ${svgStrokes.length} drawing elements.`);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: DEVICE.width, height: DEVICE.height },
      deviceScaleFactor: DEVICE.deviceScaleFactor,
      hasTouch: true,
      isMobile: false,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#drawingCanvas');
    await sleep(400);

    await expandDrawer(page);

    const box = await page.locator('#drawingCanvas').boundingBox();
    console.log(`Canvas: ${box.width}×${box.height} at (${box.x}, ${box.y})`);

    const sx = box.width / SVG_W;
    const sy = box.height / SVG_H;

    let currentColor = null;
    let currentSize = null;

    for (const s of svgStrokes) {
      const color = COLOR_MAP[s.color] ?? s.color;
      const appSize = svgWidthToAppSize(s.sw);
      const pts = s.pts.map((p) => ({ x: p.x * sx, y: p.y * sy }));

      if (appSize !== currentSize) {
        await setStroke(page, appSize);
        currentSize = appSize;
      }
      if (color !== currentColor) {
        await pickColor(page, color);
        currentColor = color;
      }
      await drawStroke(page, box, pts);
    }

    // Dismiss any open menu before capturing
    await page.mouse.click(box.x + 5, box.y + 5);
    await sleep(200);

    await page.screenshot({ path: OUT });
    console.log(`Saved: ${OUT}`);

    await ctx.close();
    await browser.close();
  } finally {
    cleanup();
  }
}

run()
  .then(() => { console.log('Done.'); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
