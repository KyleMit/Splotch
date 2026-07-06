// Regenerates static/large-image.png by replaying the SVG drawing instructions
// in static/large-image.svg onto the live Splotch canvas.
// The output is 1920x1080 (16:9 landscape, same as Google Play tablet spec).
//
// A dev server is started automatically (or reused if one is already on 4173):
//   node scripts/gen-large-image.mjs

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, chromiumExecutablePath } from './lib/utils.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
  pickColor,
  setStrokeSize,
  drawStroke,
  dismissMenu,
  circlePts,
} from './lib/app-driver.mjs';

const SVG_FILE = join(ROOT, 'web', 'static', 'large-image.svg');
const OUT = join(ROOT, 'web', 'static', 'large-image.png');
const PORT = 4173;

// SVG viewBox dimensions
const SVG_W = 2265,
  SVG_H = 1388;

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
  if (w <= 9) return 2; // SVG 8   → app 4px
  if (w <= 14) return 3; // SVG 14  → app 8px
  return 4; // SVG 15+ → app 14px
}

// Extract a single XML attribute value from a tag string.
function attr(tag, name) {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
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

const svgStrokes = parseSvg(readFileSync(SVG_FILE, 'utf8'));
console.log(`Parsed ${svgStrokes.length} drawing elements.`);

const { base, stop } = await ensureDevServer(PORT);
try {
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const { ctx, page } = await openAppPage(browser, base, DEVICE);
  await expandDrawer(page);

  const box = await canvasBox(page);
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
      await setStrokeSize(page, appSize);
      currentSize = appSize;
    }
    if (color !== currentColor) {
      await pickColor(page, color);
      currentColor = color;
    }
    await drawStroke(page, box, pts);
  }

  await dismissMenu(page);
  await page.screenshot({ path: OUT });
  console.log(`Saved: ${OUT}`);

  await ctx.close();
  await browser.close();
} finally {
  stop();
}
console.log('Done.');
