// Render a proof sheet of the native crayon glaze across candidate strengths.
//
//   npm run gen:crayon-glaze-sheet
//   npm run gen:crayon-glaze-sheet -- --returns=0.03,0.06,0.1,0.16 --passes=1,2,4
//
// The value being chosen is `perOpGlazeReturn` (ADR-0148), and it cannot be
// judged from one number: it sets BOTH how green a first crossing reads AND how
// quickly redrawing walks the pixel to the new colour. Those pull in opposite
// directions, which is why the sheet is a grid — one row per candidate value,
// one column per number of times the top colour is drawn over the bottom one.
//
// Rendered in WebKit on this machine rather than on the iPad, deliberately. The
// glaze is canvas compositing, which is spec-defined, and on-device samples on
// 2026-08-27 matched the arithmetic to within antialiasing — so the PIXELS here
// are the device's pixels. The frame cost is NOT: the desktop compositor is not
// the WKWebView's, and reading performance off this sheet would be wrong. Use
// `perf:ios:xcuitest:screen` for that.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { freePort, spawnViteServer } from '../lib/vite-server.mjs';
import { waitForUrl } from '../lib/net.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The candidates worth looking at, bracketing the shipped default. 0.45 is the
// pass-cadence `1 - colorMix` reused per op — the first thing tried, and the
// one a reader is most likely to reach for again.
const DEFAULT_RETURNS = [0.04, 0.06, 0.08, 0.1, 0.14, 0.18, 0.24, 0.45];
// How many times the crossing colour is drawn over the underlying band. One is
// the first crossing; the rest are a child going back over it.
const DEFAULT_PASSES = [1, 2, 3, 5, 8];

const CELL_PX = 190;
const STROKE_WIDTH_PX = 26;
// Half-width of the square the crossing colour is read from, in canvas px. Wide
// enough that the median has a population, narrow enough to stay inside both
// strokes — see the note at the sample site.
const CROSSING_SAMPLE_HALF_PX = 10;
// The dev server compiles the route on first request, so this covers a cold start.
const SERVER_READY_TIMEOUT_MS = 120_000;

// The palette by label, read out of its single source. A tool cannot import the
// TS module, and a copied hex is exactly what tools/tests/palette-source.test.mjs
// exists to reject — so the hexes are extracted from the file text, the same way
// that test extracts them.
function paletteByLabel() {
  const source = readFileSync(join(ROOT, 'web/src/lib/palette.ts'), 'utf8');
  const entries = [...source.matchAll(/\{\s*hex:\s*'(#[0-9a-fA-F]{3,8})',\s*label:\s*'([^']+)'/g)];
  if (!entries.length) fail('found no palette entries in web/src/lib/palette.ts');
  return new Map(entries.map((m) => [m[2], m[1]]));
}

// Validated rather than coerced, because every bad value here produces a
// PLAUSIBLE sheet rather than an error: `--returns=2` would label a row 2 while
// getPerOpGlazeReturn clamps it to 1, `--passes=1.5` would run two iterations
// under a header saying 1.5, and parseFloat happily accepts a partial token like
// `0.1abc`. A sheet whose labels disagree with what was rendered is worse than
// no sheet.
function parseNumberList(value, fallback, { label, check, describe }) {
  if (!value) return fallback;
  return value.split(',').map((raw) => {
    const token = raw.trim();
    // Whole-token match: Number.parseFloat stops at the first bad character.
    if (!/^\d*\.?\d+$/.test(token)) fail(`${label}: "${token}" is not a number`);
    const parsed = Number(token);
    if (!check(parsed)) fail(`${label}: ${token} ${describe}`);
    return parsed;
  });
}

// One cell: the under band, then `passes` strokes of the over colour across it,
// every stroke a separate pass so the glaze compounds the way redrawing does.
//
// Returns the measured crossing colour beside the image. The whole point of the
// sweep is a colour, and an eyeballed thumbnail cannot be compared across twenty
// cells — `pixelsIn` reads what the glaze actually produced.
async function renderCell(page, { mode, glazeReturn, passes, under, over }) {
  return page.evaluate(
    ({ mode, glazeReturn, passes, under, over, width, CROSSING_SAMPLE_HALF_PX }) => {
      const engine = window.__engine;
      const canvas = document.getElementById('drawingCanvas');
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) throw new Error(`drawing canvas has no layout size (${w}x${h})`);
      const midX = Math.round(w / 2);
      const midY = Math.round(h / 2);

      engine.clearCanvas();
      engine.setCrayonMode(true);
      engine.setStrokeWidth(width);
      engine.setCrayonDeposition(mode);
      if (glazeReturn !== null) engine.setCrayonParams({ perOpGlazeReturn: glazeReturn });

      const line = (from, to) =>
        Array.from({ length: 41 }, (_, i) => ({
          x: from.x + ((to.x - from.x) * i) / 40,
          y: from.y + ((to.y - from.y) * i) / 40,
        }));

      engine.setColor(under);
      engine.strokeSync(line({ x: midX - 160, y: midY }, { x: midX + 160, y: midY }), 'pen');
      engine.setColor(over);
      for (let pass = 0; pass < passes; pass++) {
        engine.strokeSync(line({ x: midX, y: midY - 160 }, { x: midX, y: midY + 160 }), 'pen');
      }

      // A tool that renders nothing and reports success is the exact failure this
      // repo keeps re-finding, so the cell proves its own ink before it is kept.
      if (engine.isCanvasEmpty()) throw new Error('the cell drew no ink');

      // The crossing only: a small square at the exact intersection. It has to
      // stay well inside both strokes — widen it and the mean is diluted by
      // single-colour and paper pixels until the parameter's effect disappears
      // into them, which is how the first version of this sheet reported values
      // that moved the wrong way.
      const half = CROSSING_SAMPLE_HALF_PX;
      const data = engine.pixelsIn(midX - half, midY - half, half * 2, half * 2);
      // MEDIAN per channel, not mean. The wax is a binary tooth — a pixel is
      // either deposited or a pit showing what is underneath — so the window is
      // bimodal, and a mean slides with whichever pits happen to fall in it. The
      // first version of this sheet used a mean and reported values that moved
      // the wrong way between adjacent cells.
      const channels = [[], [], []];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] <= 128) continue;
        channels[0].push(data[i]);
        channels[1].push(data[i + 1]);
        channels[2].push(data[i + 2]);
      }
      if (!channels[0].length) throw new Error('the crossing region is empty');
      const rgb = channels.map((values) => {
        values.sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
      });
      return { rgb, centre: { x: midX, y: midY } };
    },
    { mode, glazeReturn, passes, under, over, width: STROKE_WIDTH_PX, CROSSING_SAMPLE_HALF_PX }
  );
}

export async function generateGlazeSheet() {
  const returns = parseNumberList(argFlag('returns', null), DEFAULT_RETURNS, {
    label: '--returns',
    check: (v) => v >= 0 && v <= 1,
    describe: 'is outside the 0-1 range a glaze return can take',
  });
  const passCounts = parseNumberList(argFlag('passes', null), DEFAULT_PASSES, {
    label: '--passes',
    check: (v) => Number.isInteger(v) && v > 0,
    describe: 'is not a positive whole number of redraws',
  });
  const outDir = argFlag('out-dir', 'perf-profiles/crayon-glaze-sheet');
  const browserType = argFlag('engine', 'webkit') === 'chromium' ? chromium : webkit;
  const palette = paletteByLabel();
  const under = palette.get('Yellow');
  const over = palette.get('Blue');
  if (!under || !over) fail('the palette no longer has a Yellow and a Blue swatch');

  const port = Number.parseInt(argFlag('port', '4198'), 10);
  await freePort(port);
  const server = spawnViteServer(port, { env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' } });
  // vite binds ::1 by default, so an IPv4 literal never answers here.
  const url = `http://localhost:${port}`;
  // The protected scope opens BEFORE the launch, not after. spawnViteServer's
  // process-exit net already covers the CLI path, but this function is exported:
  // a caller that catches a launch rejection and keeps running would otherwise
  // hold the port for the life of the process — expensive on a host shared with
  // other worktrees.
  let browser = null;
  try {
    browser = await browserType.launch();
    await waitForUrl(url, SERVER_READY_TIMEOUT_MS);
    // Large enough that the drawing canvas gets a real layout size; the cells are
    // clipped out of it, not sized by it.
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
    await page.goto(`${url}/dev/engine`);
    await page.waitForFunction(() => Boolean(window.__engine));

    // The web pipeline first, as the row every candidate is being judged against.
    // Without it the sheet shows how the values differ from EACH OTHER and not
    // how any of them differ from the appearance that already ships.
    const cells = [];
    for (const arm of [{ label: 'web', mode: 'restamp', glazeReturn: null }].concat(
      returns.map((glazeReturn) => ({
        label: String(glazeReturn),
        mode: 'glaze-direct',
        glazeReturn,
      }))
    )) {
      const { label, mode, glazeReturn } = arm;
      const row = [];
      for (const passes of passCounts) {
        const { rgb, centre } = await renderCell(page, { mode, glazeReturn, passes, under, over });
        // The centre is in CANVAS coordinates; page.screenshot clips in viewport
        // coordinates, so the canvas's own box has to be added or every cell is
        // cropped from the wrong place.
        const box = await page.locator('#drawingCanvas').boundingBox();
        row.push({
          rgb,
          png: await page.screenshot({
            clip: {
              x: box.x + centre.x - CELL_PX / 2,
              y: box.y + centre.y - CELL_PX / 2,
              width: CELL_PX,
              height: CELL_PX,
            },
          }),
        });
      }
      cells.push({ label, row });
    }

    mkdirSync(join(ROOT, outDir), { recursive: true });
    const sheet = join(ROOT, outDir, 'crayon-glaze-sheet.html');
    writeFileSync(sheet, renderSheetHtml(cells, passCounts));
    console.log(`wrote ${outDir}/crayon-glaze-sheet.html`);
    return sheet;
  } finally {
    await browser?.close();
    server.stop();
  }
}

// A self-contained page rather than a composited PNG: the labels stay legible at
// any zoom, and the sheet can be opened on the iPad itself for a second look at
// the screen the decision is actually for.
function renderSheetHtml(cells, passCounts) {
  const header = passCounts.map((n) => `<th>${n} pass${n === 1 ? '' : 'es'} of blue</th>`).join('');
  const rows = cells
    .map(
      ({ label, row }) =>
        `<tr class="${label === 'web' ? 'ref' : ''}"><th class="v">${label}</th>${row
          .map(
            ({ png, rgb }) =>
              `<td><img alt="" src="data:image/png;base64,${png.toString('base64')}">` +
              `<code>${rgb.join(', ')}</code></td>`
          )
          .join('')}</tr>`
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>Crayon glaze sweep</title>
<style>
  body { font: 14px system-ui; margin: 24px; color: #222; background: #fafafa; }
  table { border-collapse: collapse; }
  th, td { padding: 6px; text-align: center; }
  th.v { font-variant-numeric: tabular-nums; }
  tr.ref { background: #eef3ff; }
  tr.ref th.v { font-weight: 700; }
  code { display: block; font-size: 12px; color: #666; padding-top: 4px; }
  img { display: block; width: ${CELL_PX}px; height: ${CELL_PX}px; border: 1px solid #ddd; }
  p { max-width: 60ch; line-height: 1.5; }
</style>
<h1>Crayon glaze sweep — <code>perOpGlazeReturn</code></h1>
<p>Yellow drawn first, then blue across it. Down the rows the per-op return rises, so the first
crossing keeps more of the crayon's own colour. Across the columns the blue is redrawn, so each row
shows how fast that value walks the crossing toward blue.</p>
<p>The highlighted top row is the <strong>web pipeline</strong> — the appearance that ships today on
Safari, glazed once per pass. It is the reference each candidate below is trying to resemble, not
another candidate.</p>
<p>The number under each cell is the median rgb at the crossing. Read the TREND along a row or a
column, not a single cell: the wax is a binary tooth, so which pits fall in the sample window varies
with the pattern seed and an individual value carries real variance.</p>
<p><strong>Pixels only.</strong> Rendered in desktop WebKit, which reproduces the device's colour but
not its frame cost — never read performance off this sheet.</p>
<table><tr><th></th>${header}</tr>${rows}</table>`;
}

if (isMain(import.meta.url)) runMain(() => generateGlazeSheet());
