// Drive the shipping crayon brush through the reference scenes and screenshot
// each one, via the /dev/engine harness. Pairs with build-compare-sheet.mjs.
//
//   node capture-current.mjs [--url=http://localhost:4188] [--out=<dir>] [--dabs]
//
// --dabs switches the deposit to the soft-alpha dab-stamp prototype
// (setCrayonParams({ dabs: CRAYON_DAB_DEFAULTS })) before capturing — the A/B
// against the shipping pattern deposit. Dab captures are nondeterministic by
// design (Math.random jitter), so don't byte-diff them run-to-run.
//
// Needs a running app server with the dev harness unlocked. The production
// build is the honest target (and `vite dev` currently 500s on /dev/engine —
// its SSR hits `window`; the minified build DCEs that statement away):
//
//   npm run build && PUBLIC_ENABLE_DEV_HARNESS=true npm run preview -- --port 4188
//
// Output goes to the gitignored screenshots/crayon-current by default; the
// keeper is the comparison sheet build-compare-sheet.mjs inlines them into.

import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dabMode = process.argv.includes('--dabs');
const baseURL = arg('url', 'http://localhost:4188');
const OUT = arg(
  'out',
  join(HERE, dabMode ? '../../../screenshots/crayon-dabs' : '../../../screenshots/crayon-current')
);

// Cloud sessions cache a Chromium whose revision can drift from Playwright's
// pinned build — same fallback as web/playwright.config.ts.
function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
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

const W = 560;
const H = 420;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
const page = await browser.newPage({
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 2,
});
await page.goto(`${baseURL}/dev/engine`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__engineReady === true, { timeout: 30_000 });

// Warm paper behind the transparent canvas so shots read like the references.
await page.evaluate(() => {
  document.body.style.background = '#faf7f0';
});
await page.evaluate((size) => window.__engine.resizeTo(size.w, size.h), { w: W, h: H });
if (dabMode) {
  await page.evaluate(() =>
    window.__engine.setCrayonParams({ dabs: window.__engine.CRAYON_DAB_DEFAULTS })
  );
}

// One synthetic stroke = one pointer gesture (down → moves → up); a light sine
// wobble keeps the polylines from being ruler-straight.
const line = (x0, y0, x1, y1, n = 40) =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / n,
    y: y0 + ((y1 - y0) * i) / n + Math.sin(i * 0.9) * 0.6,
  }));

// Back-and-forth scribble: rows of connected left-right sweeps in ONE gesture,
// so the mid-stroke pass splitting (CrayonPassTracker) is what's on camera.
function scribble(x0, x1, yTop, rows, rowGap, n = 30) {
  const pts = [];
  for (let r = 0; r < rows; r++) {
    const y = yTop + r * rowGap;
    const [a, b] = r % 2 === 0 ? [x0, x1] : [x1, x0];
    for (let i = 0; i <= n; i++) {
      pts.push({ x: a + ((b - a) * i) / n, y: y + (r > 0 && i === 0 ? -rowGap / 2 : 0) });
    }
  }
  return pts;
}

async function setup(color, width = 20) {
  await page.evaluate(
    (c) => {
      window.__engine.setCrayonMode(true);
      window.__engine.setColor(c.color);
      window.__engine.setStrokeWidth(c.width);
    },
    { color, width }
  );
  await page.waitForTimeout(300); // let warmCrayonTiles' idle build land
}

async function stroke(points) {
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'touch'), points);
  await page.waitForTimeout(80);
}

async function shot(name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: W, height: H } });
  await page.evaluate(() => window.__engine.clearCanvas());
  await page.waitForTimeout(100);
  console.log('captured', name);
}

await setup('#ee204d');
await stroke(line(60, 210, 500, 210));
await shot('1-line-red');

await setup('#1f75fe');
await stroke(line(60, 210, 500, 210));
await shot('1-line-blue');

await setup('#1cac78');
await stroke(line(60, 210, 500, 210));
await shot('1-line-green');

await setup('#ee204d');
await stroke(line(60, 210, 500, 210));
await stroke(line(60, 212, 500, 209));
await shot('2-buildup-red');

// Left half single pass, right half three more passes — the buildup gradient.
await setup('#1f75fe');
await stroke(line(60, 210, 500, 210));
await stroke(line(280, 211, 500, 209));
await stroke(line(280, 208, 500, 212));
await stroke(line(280, 210, 500, 210));
await shot('2-buildup-blue-halfoverlap');

await setup('#f7d90f');
await stroke(line(60, 210, 500, 210));
await setup('#1f75fe');
await stroke(line(280, 60, 280, 360));
await shot('3-cross-yellow-blue');

await setup('#ee204d');
await stroke(line(60, 210, 500, 210));
await setup('#1f75fe');
await stroke(line(280, 60, 280, 360));
await shot('3-cross-red-blue');

await setup('#1f75fe');
await stroke(scribble(100, 460, 120, 12, 16));
await shot('4-scribble-backforth-blue');

await setup('#ee204d', 26);
await stroke(scribble(120, 440, 110, 14, 15));
await stroke(scribble(130, 430, 118, 13, 16));
await shot('5-swatch-red');

await browser.close();
console.log('done ->', OUT);
