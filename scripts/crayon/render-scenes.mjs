// Render the CURRENT crayon brush into the same three scenes as the references
// (single stroke, same-colour buildup ramp, scribble fill), composited over the
// app's paper colour so the tooth reads as paper showing through. One production
// build renders every variant, because variants are runtime-selectable via
// setCrayonParams (engine dev seam). Screenshots land next to the references so
// the judge and my eyes can compare.
//
//   node scripts/crayon/render-scenes.mjs                 # default variants
//   node scripts/crayon/render-scenes.mjs --no-build      # reuse the last build
//   node scripts/crayon/render-scenes.mjs --variants=waxy,bold,light
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, chromiumExecutablePath, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from '../perf/preview.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const variants = ((args.find((a) => a.startsWith('--variants=')) || '').split('=')[1] || 'waxy')
  .split(',')
  .filter(Boolean);
// Free-form param overrides, e.g. --set=density:0.9,toothFloor:0.28,grain:3
const setArg = (args.find((a) => a.startsWith('--set=')) || '').split('=')[1] || '';
const overrides = Object.fromEntries(
  setArg
    .split(',')
    .filter(Boolean)
    .map((kv) => {
      const [k, v] = kv.split(':');
      return [k, Number(v)];
    })
);

const OUT = process.env.CRAYON_OUT || join(tmpdir(), 'splotch-crayon');
mkdirSync(OUT, { recursive: true });

const PAPER = '#fcfbf8';
const INK = '#d1442a'; // crayon red-orange, matches the references
const DSF = 2;
const CSS = 520;

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  const { base, stop } = await buildAndPreview(4183, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    for (const variant of variants) {
      const ctx = await browser.newContext({
        viewport: { width: CSS, height: CSS },
        deviceScaleFactor: DSF,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#engineCanvas');
      await page.waitForFunction(() => window.__engineReady === true);
      await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), { w: CSS, h: CSS });
      await sleep(120);

      for (const scene of ['single', 'buildup', 'scribble']) {
        const dataUrl = await page.evaluate(renderScene, {
          scene,
          variant,
          overrides,
          ink: INK,
          paper: PAPER,
          css: CSS,
        });
        writeFileSync(
          join(OUT, `mine-${variant}-${scene}.png`),
          Buffer.from(dataUrl.split(',')[1], 'base64')
        );
        console.log(`rendered ${variant}/${scene}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    stop();
  }
  console.log('renders at', OUT);
}

// Runs in the page: select the crayon + variant, draw one scene, composite over
// paper, return a PNG data URL.
function renderScene({ scene, variant, overrides, ink, paper, css }) {
  const E = window.__engine;
  const cv = document.querySelector('#engineCanvas');
  E.clearCanvas();
  E.setCrayonParams({ variant, ...overrides });
  E.setCrayonMode(true);
  E.setColor(ink);

  const line = (x0, y0, x1, y1, n) =>
    Array.from({ length: n + 1 }, (_, i) => ({
      x: x0 + ((x1 - x0) * i) / n,
      y: y0 + ((y1 - y0) * i) / n,
    }));
  // A back-and-forth fill of a rectangle, `passes` times over the same area.
  const fill = (x0, y0, x1, y1, rows, passes) => {
    const pts = [];
    for (let p = 0; p < passes; p++) {
      for (let r = 0; r <= rows; r++) {
        const y = y0 + ((y1 - y0) * r) / rows;
        const l = r % 2 === 0;
        pts.push(...line(l ? x0 : x1, y, l ? x1 : x0, y, 24));
      }
    }
    return pts;
  };

  const draw = (points, width) => {
    E.setStrokeWidth(width);
    E.strokeSync(points, 'pen');
  };

  if (scene === 'single') {
    // A gentle S so both straights and a turn show.
    const s = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      s.push({ x: 70 + t * 380, y: 260 + Math.sin(t * Math.PI * 2) * 90 });
    }
    draw(s, 26);
  } else if (scene === 'buildup') {
    // Four columns, each a vertical scribble fill drawn 1/2/3/4 times in the
    // SAME colour — the buildup ramp. Same hue throughout; density should climb.
    const colW = css / 4;
    for (let k = 0; k < 4; k++) {
      const x0 = k * colW + 24;
      const x1 = (k + 1) * colW - 24;
      draw(fill(x0, 90, x1, css - 90, 14, k + 1), 22);
    }
  } else {
    // A dense toddler scribble fill.
    draw(fill(70, 90, css - 70, css - 90, 26, 2), 30);
  }

  const out = document.createElement('canvas');
  out.width = cv.width;
  out.height = cv.height;
  const octx = out.getContext('2d');
  octx.fillStyle = paper;
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(cv, 0, 0);
  return out.toDataURL();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
