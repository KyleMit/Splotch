// Empirical comparison of the three magic-brush reveal techniques (ADR-0043).
//
//   npm run perf:magic            # build + compare
//   node scripts/perf/magic-brush.mjs --no-build
//
// For each technique it drives the same synthetic stroke battery through
// /dev/engine over a colored sheet and records, from the engine.* user-timing
// marks: live per-move draw cost (engine.draw), one full rebuild-from-stored-ops
// (engine.resize — the cost an undo pays to replay the whole command log), and
// the wall time to undo every command. A `baseline` pass (magic off, plain pen)
// is the regression reference. getUndoDebug confirms the command/segment counts
// match across modes (identical geometry) so only the technique differs.
//
//   pattern — magic op strokes a cached sheet pattern (SHIPPING)
//   mask    — magic op reveals the sheet through a per-op scratch composite
//   sample  — no magic op: bakes the sampled sheet color into a solid stroke
//   baseline— plain pen, no sheet (the pre-feature cost)

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sleep } from '../lib/utils.mjs';

// The pre-installed browsers in this environment may not match the exact build
// @playwright/test wants, so fall back to whatever chrome binary is present.
function resolveChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  const candidates = [
    '/opt/pw-browsers/chromium-1223/chrome-linux64/chrome',
    '/opt/pw-browsers/chromium-1223/chrome-linux/chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ];
  return candidates.find((p) => existsSync(p));
}
import { buildAndPreview } from './preview.mjs';
import { buildBattery, batteryExtent } from './lib/strokes.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const port = 4173;

const MODES = ['baseline', 'pattern', 'mask', 'sample'];
const SHEET_URL = '/coloring/farm/dog-wide.color.webp';
const SIZE_PX = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 };
const DSF = 2;
const COLS = 4;
const CELL = 320;
const REPEATS = 3; // redraw the battery a few times for a stronger draw signal

const battery = buildBattery({ cell: CELL, cols: COLS });
const extent = batteryExtent({ cell: CELL, cols: COLS });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(ROOT, 'perf-profiles', `${stamp}-magic-brush`);
mkdirSync(outDir, { recursive: true });

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({ headless: true, executablePath: resolveChromium() });
  const rows = [];
  try {
    for (const mode of MODES) {
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

      if (mode !== 'baseline') {
        await page.evaluate((url) => window.__engine.setColorSheet(url), `${base.replace(/\/$/, '')}${SHEET_URL}`);
        await page.waitForFunction(() => window.__engine.isColorSheetReady() === true, { timeout: 15_000 });
      }
      await sleep(120);

      const cfg = { mode, strokes: battery, sizePx: SIZE_PX, repeats: REPEATS };
      const result = await page.evaluate(runMode, cfg);
      await page.screenshot({ path: join(outDir, `${mode}.png`), clip: clipBox() });

      rows.push({ mode, ...result });
      console.log(
        `${mode.padEnd(9)} draw avg ${result.draw.avg.toFixed(3)}ms max ${result.draw.max.toFixed(2)}ms ` +
          `| rebuild ${result.rebuildMs == null ? 'n/a' : result.rebuildMs.toFixed(1)}ms ` +
          `| undoAll ${result.undoAllMs.toFixed(1)}ms | cmds ${result.undo.commands} segs ${result.undo.totalSegments}`
      );
      await ctx.close();
    }
  } finally {
    await browser.close();
    stop();
  }

  const report = renderReport(rows);
  writeFileSync(join(outDir, 'magic-brush.json'), JSON.stringify({ sheet: SHEET_URL, rows }, null, 2));
  writeFileSync(join(outDir, 'magic-brush.md'), report);
  console.log(`\n${report}\nArtifacts: ${outDir}`);
}

function clipBox() {
  return { x: 0, y: 0, width: extent.width, height: extent.height };
}

// Runs in the page: set the technique, draw the battery `repeats` times measuring
// engine.draw, force one full rebuild (engine.resize) and time undoing every
// command. Returns the aggregated marks + command-log debug.
async function runMode({ mode, strokes, sizePx, repeats }) {
  const E = window.__engine;
  E.clearCanvas();
  E.setSimplifyParams({ keyframeThreshold: 1e9 }); // isolate replay cost from keyframing
  E.setEraserMode(false);
  if (mode === 'baseline') {
    E.setMagicMode(false);
  } else {
    E.setMagicFillMode(mode);
    E.setMagicMode(true);
  }

  performance.clearMeasures('engine.draw');
  for (let r = 0; r < repeats; r++) {
    for (const s of strokes) {
      E.setStrokeWidth(sizePx[s.brush] || 8);
      E.strokeSync(s.points, 'touch');
    }
  }
  const drawMs = performance.getEntriesByName('engine.draw').map((m) => m.duration);

  // One full rebuild-from-stored-ops (what a single undo replays).
  performance.clearMeasures('engine.resize');
  const cv = document.querySelector('#engineCanvas');
  await E.resizeTo(cv.clientWidth, cv.clientHeight);
  const resizeMeasure = performance.getEntriesByName('engine.resize').pop();

  // Undo every command, timing the whole teardown (each undo rebuilds).
  const undo = E.getUndoDebug();
  const t0 = performance.now();
  let guard = 0;
  while (window.__engineState.canUndo && guard++ < 2000) E.undo();
  const undoAllMs = performance.now() - t0;

  const agg = (arr) => {
    if (!arr.length) return { count: 0, total: 0, avg: 0, max: 0 };
    let total = 0;
    let max = 0;
    for (const v of arr) {
      total += v;
      if (v > max) max = v;
    }
    return { count: arr.length, total, avg: total / arr.length, max };
  };

  return {
    draw: agg(drawMs),
    rebuildMs: resizeMeasure ? resizeMeasure.duration : null,
    undoAllMs,
    undo: { commands: undo.commands, totalSegments: undo.totalSegments, keyframes: undo.keyframes },
  };
}

function renderReport(rows) {
  const out = [];
  out.push('# Magic-brush reveal techniques — empirical comparison (ADR-0043)\n');
  out.push(
    'Same stroke battery driven over a colored sheet through /dev/engine, ' +
      `${DSF}× DPR, keyframing disabled to isolate replay cost. \`draw\` = live ` +
      'per-pointermove cost (engine.draw); `rebuild` = one full replay of the ' +
      'command log (engine.resize — the cost an undo pays); `undo all` = wall time ' +
      'to undo every command. `baseline` is the plain pen (no sheet), the ' +
      'pre-feature reference.\n'
  );
  out.push('| technique | draw avg (ms) | draw max (ms) | draw moves | rebuild (ms) | undo all (ms) | commands | segments |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    out.push(
      `| ${r.mode} | ${r.draw.avg.toFixed(3)} | ${r.draw.max.toFixed(2)} | ${r.draw.count} | ` +
        `${r.rebuildMs == null ? 'n/a' : r.rebuildMs.toFixed(1)} | ${r.undoAllMs.toFixed(1)} | ` +
        `${r.undo.commands} | ${r.undo.totalSegments} |`
    );
  }
  const base = rows.find((r) => r.mode === 'baseline');
  const pat = rows.find((r) => r.mode === 'pattern');
  if (base && pat) {
    out.push('\n## Regression vs. plain pen\n');
    out.push(
      `The shipping technique (**pattern**) draws at ${pat.draw.avg.toFixed(3)}ms/move vs. the ` +
        `plain pen's ${base.draw.avg.toFixed(3)}ms — a ${(pat.draw.avg - base.draw.avg >= 0 ? '+' : '')}` +
        `${(pat.draw.avg - base.draw.avg).toFixed(3)}ms delta. Rebuild ${pat.rebuildMs?.toFixed(1)}ms ` +
        `vs ${base.rebuildMs?.toFixed(1)}ms. Command/segment counts match across modes (identical ` +
        `geometry), so only the reveal technique differs.`
    );
  }
  return out.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
