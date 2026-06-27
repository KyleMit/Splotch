// Empirical sweep of stroke-simplification fidelity vs. performance (ADR-0036).
//
//   npm run perf:sweep            # synthetic battery
//   node scripts/perf/simplify-sweep.mjs --no-build
//
// For each tolerance setting it draws a grid of non-overlapping strokes (live,
// full fidelity), forces ONE rebuild-from-stored-ops (resize-to-same → replays
// every retained command, the way a single undo does), and diffs the rebuilt
// canvas against the live one — per grid cell, so each stroke's shift is measured
// independently despite the all-at-once rebuild. Fidelity = AA-tolerant "moved
// ink" + ink-extent delta; performance = total segments replayed + rebuild ms.
// The scale=0 row keeps all points (≈ no thinning) → the representation floor.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';
import { buildBattery, batteryExtent } from './lib/strokes.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const port = 4173;

// Single scalar swept across the whole width-scaled tolerance. scale 0 ≈ keep all
// points (representation floor); 1 = current ADR-0036 default.
const SCALES = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3];
const BASE = { fraction: 0.2, min: 2, max: 16 };
const FIDELITY_CEILING = 0.15; // % of a stroke's ink allowed to move > tolerance
const EXTENT_CEILING = 2; // CSS px the ink bounding box may shrink/grow

const CELL = 320;
const COLS = 3;
const SIZE_PX = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 };
const DSF = 2;

const battery = buildBattery({ cell: CELL, cols: COLS });
const extent = batteryExtent({ cell: CELL, cols: COLS });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(ROOT, 'perf-profiles', `${stamp}-simplify-sweep`);
mkdirSync(outDir, { recursive: true });

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  try {
    for (const scale of SCALES) {
      const params =
        scale === 0
          ? { fraction: 0, min: 0.01, max: 0.01, keyframeThreshold: Infinity }
          : {
              fraction: BASE.fraction * scale,
              min: BASE.min * scale,
              max: BASE.max * scale,
              keyframeThreshold: Infinity,
            };

      const ctx = await browser.newContext({
        viewport: { width: extent.width, height: extent.height },
        deviceScaleFactor: DSF,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#engineCanvas');
      await page.waitForFunction(() => window.__engineReady === true);
      await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), {
        w: extent.width,
        h: extent.height,
      });
      await sleep(120);

      const cfg = {
        params: { ...params, keyframeThreshold: 1e9 }, // Infinity isn't JSON-safe
        strokes: battery,
        sizePx: SIZE_PX,
        canvas: { w: extent.width, h: extent.height },
        tolPx: 3, // backing-px dilation tolerance for "moved ink" (~1.5 CSS px @2x)
      };
      const dbg = await page.evaluate(drawLive, cfg);
      await page.screenshot({ path: join(outDir, `scale-${scale}-live.png`), clip: clipBox() });
      const result = await page.evaluate(rebuildAndDiff, cfg);
      await page.screenshot({ path: join(outDir, `scale-${scale}-rebuilt.png`), clip: clipBox() });

      rows.push({ scale, epsilonAt32: epsilonFor(params, 32 * DSF), ...dbg, ...result });
      await ctx.close();
      console.log(
        `scale ${scale}: segs ${dbg.totalSegments} reduction ${dbg.reduction.toFixed(2)}x ` +
          `worstMoved ${result.worstMovedPct.toFixed(3)}% worstExtent ${result.worstExtentPx.toFixed(1)}px`
      );
    }
  } finally {
    await browser.close();
    stop();
  }

  const report = renderReport(rows);
  writeFileSync(
    join(outDir, 'sweep.json'),
    JSON.stringify({ battery: battery.map((b) => b.name), rows }, null, 2)
  );
  writeFileSync(join(outDir, 'sweep.md'), report);
  console.log(`\n${report}\nArtifacts: ${outDir}`);
}

function epsilonFor(p, lineWidth) {
  if (p.max <= 0.02) return 0;
  return Math.min(p.max, Math.max(p.min, lineWidth * p.fraction));
}
function clipBox() {
  return { x: 0, y: 0, width: extent.width, height: extent.height };
}

// Runs in the page: set the tolerance, draw the battery live, stash the live
// pixels on window (kept in-page — too big to transfer), return the command-log
// debug. The caller screenshots between this and rebuildAndDiff.
function drawLive({ params, strokes, sizePx }) {
  const E = window.__engine;
  const cv = document.querySelector('#engineCanvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  E.setSimplifyParams({
    fraction: params.fraction,
    min: params.min,
    max: params.max,
    keyframeThreshold: params.keyframeThreshold,
  });
  for (const s of strokes) {
    E.setStrokeWidth(sizePx[s.brush] || 8);
    E.strokeSync(s.points, 'touch');
  }
  window.__sweepLive = new Uint8ClampedArray(ctx.getImageData(0, 0, cv.width, cv.height).data);
  const d = E.getUndoDebug();
  return {
    totalSegments: d.totalSegments,
    rawPoints: d.rawPoints,
    keptPoints: d.keptPoints,
    reduction: d.keptPoints ? d.rawPoints / d.keptPoints : 1,
  };
}

// Runs in the page: force a full rebuild from the stored (simplified) ops and
// diff it against the stashed live pixels, per non-overlapping cell.
function rebuildAndDiff({ strokes, canvas, tolPx }) {
  const E = window.__engine;
  const cv = document.querySelector('#engineCanvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const W = cv.width;
  const H = cv.height;
  const scale = W / canvas.w; // backing px per CSS px
  const live = window.__sweepLive;

  performance.clearMeasures();
  E.resizeTo(canvas.w, canvas.h);
  const rebuilt = ctx.getImageData(0, 0, W, H).data;
  const resizeMeasure = performance.getEntriesByName('engine.resize').pop();
  const resizeMs = resizeMeasure ? resizeMeasure.duration : null;

  const isInk = (d, i) => d[i + 3] > 32;
  const nearInk = (d, x, y) => {
    for (let dy = -tolPx; dy <= tolPx; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -tolPx; dx <= tolPx; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        if (d[(yy * W + xx) * 4 + 3] > 32) return true;
      }
    }
    return false;
  };

  const cells = [];
  for (const s of strokes) {
    const bx0 = Math.max(0, Math.floor(s.cell.x0 * scale) - 8);
    const by0 = Math.max(0, Math.floor(s.cell.y0 * scale) - 8);
    const bx1 = Math.min(W, Math.ceil((s.cell.x0 + s.cell.size) * scale) + 8);
    const by1 = Math.min(H, Math.ceil((s.cell.y0 + s.cell.size) * scale) + 8);
    let inkA = 0,
      moved = 0,
      xor = 0;
    let aMinX = W,
      aMaxX = -1,
      bMinX = W,
      bMaxX = -1,
      aMinY = H,
      aMaxY = -1,
      bMinY = H,
      bMaxY = -1;
    for (let y = by0; y < by1; y++) {
      for (let x = bx0; x < bx1; x++) {
        const i = (y * W + x) * 4;
        const a = isInk(live, i);
        const b = isInk(rebuilt, i);
        if (a) {
          inkA++;
          if (x < aMinX) aMinX = x;
          if (x > aMaxX) aMaxX = x;
          if (y < aMinY) aMinY = y;
          if (y > aMaxY) aMaxY = y;
        }
        if (b) {
          if (x < bMinX) bMinX = x;
          if (x > bMaxX) bMaxX = x;
          if (y < bMinY) bMinY = y;
          if (y > bMaxY) bMaxY = y;
        }
        if (a !== b) {
          xor++;
          // "moved" = a changed pixel with no matching ink within tolerance in
          // the other image → a real displacement, not AA jitter.
          if (a && !nearInk(rebuilt, x, y)) moved++;
          else if (b && !nearInk(live, x, y)) moved++;
        }
      }
    }
    const extentPx =
      Math.max(
        Math.abs(aMinX - bMinX),
        Math.abs(aMaxX - bMaxX),
        Math.abs(aMinY - bMinY),
        Math.abs(aMaxY - bMaxY)
      ) / scale;
    cells.push({
      name: s.name,
      inkA,
      movedPct: inkA ? (100 * moved) / inkA : 0,
      xorPct: inkA ? (100 * xor) / inkA : 0,
      extentPx: isFinite(extentPx) ? extentPx : 0,
    });
  }

  return {
    resizeMs,
    worstMovedPct: Math.max(...cells.map((c) => c.movedPct)),
    meanMovedPct: cells.reduce((a, c) => a + c.movedPct, 0) / cells.length,
    worstExtentPx: Math.max(...cells.map((c) => c.extentPx)),
    cells,
  };
}

function renderReport(rows) {
  const out = [];
  out.push('# Stroke-simplification fidelity vs. performance sweep (ADR-0036)\n');
  out.push(
    'Live full-resolution draw vs. one forced rebuild-from-stored-ops, diffed per ' +
      'non-overlapping grid cell. `moved%` = a stroke’s ink that shifted beyond ' +
      '~1.5px (AA-tolerant); `extent` = its bounding-box delta. `segs` = total ' +
      'segments replayed on rebuild (the iPad cost proxy). scale 0 = keep all ' +
      'points (representation floor).\n'
  );
  out.push(
    '| scale | ε@32px | segs | reduction | rebuild ms | worst moved% | mean moved% | worst extent px |'
  );
  out.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    out.push(
      `| ${r.scale} | ${r.epsilonAt32.toFixed(1)} | ${r.totalSegments} | ${r.reduction.toFixed(2)}x | ` +
        `${r.resizeMs == null ? 'n/a' : r.resizeMs.toFixed(1)} | ${r.worstMovedPct.toFixed(3)} | ` +
        `${r.meanMovedPct.toFixed(3)} | ${r.worstExtentPx.toFixed(1)} |`
    );
  }

  const floor = rows.find((r) => r.scale === 0);
  out.push('\n## Representation floor (scale 0, no thinning)\n');
  out.push(
    `worst moved **${floor.worstMovedPct.toFixed(3)}%**, worst extent **${floor.worstExtentPx.toFixed(1)}px**, ` +
      `segs ${floor.totalSegments}. This is the irreducible live-vs-rebuild difference ` +
      `(Catmull-Rom rebuild vs. live midpoint-quadratic); tolerance tuning cannot go below it.`
  );

  // Recommendation: fewest segments meeting both ceilings.
  const ok = rows.filter(
    (r) => r.scale > 0 && r.worstMovedPct <= FIDELITY_CEILING && r.worstExtentPx <= EXTENT_CEILING
  );
  const pick = ok.sort((a, b) => a.totalSegments - b.totalSegments)[0];
  out.push('\n## Recommendation\n');
  if (pick) {
    out.push(
      `scale **${pick.scale}** (ε@32px ${pick.epsilonAt32.toFixed(1)}px): worst moved ` +
        `${pick.worstMovedPct.toFixed(3)}% ≤ ${FIDELITY_CEILING}%, extent ${pick.worstExtentPx.toFixed(1)}px, ` +
        `${pick.totalSegments} segs (${pick.reduction.toFixed(2)}x reduction).`
    );
  } else {
    out.push(
      `No tolerance meets worst-moved ≤ ${FIDELITY_CEILING}% and extent ≤ ${EXTENT_CEILING}px. ` +
        `If even the floor exceeds them, the residual is representation-bound — change the ` +
        `algorithm (deviation-bounded curve fitting / unify live + rebuild smoothing).`
    );
  }

  out.push('\n## Worst-cell breakdown at scale 1 (current default)\n');
  const cur = rows.find((r) => r.scale === 1);
  if (cur) {
    out.push('| stroke | moved% | xor% | extent px |');
    out.push('|---|---|---|---|');
    for (const c of [...cur.cells].sort((a, b) => b.movedPct - a.movedPct)) {
      out.push(
        `| ${c.name} | ${c.movedPct.toFixed(3)} | ${c.xorPct.toFixed(3)} | ${c.extentPx.toFixed(1)} |`
      );
    }
  }
  return out.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
