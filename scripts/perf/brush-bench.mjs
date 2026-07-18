// Brush-variant A/B bench (ADR-0065). One build renders every candidate: the
// /dev/engine harness exposes setBrush() + setBrushVariant(), so this drives a
// fixed synthetic battery through each variant of a textured brush and reports
// its cost — no rebuild per variant (mirrors perf:sweep).
//
//   node scripts/perf/brush-bench.mjs --brush=crayon --variants=1,2,3
//   node scripts/perf/brush-bench.mjs --brush=watercolor --variants=1,2 --no-build
//
// For each variant it records, on the same battery:
//   - draw cost: total + avg + max engine.draw measure (per-pointermove stroking)
//   - rebuild cost: one undo() (a full replay from the baseline + command log)
//   - opaque pixel count (a coarse "how much ink" sanity signal)
//   - a canvas screenshot (perf-profiles/<dir>/<brush>-v<n>.png) for visual A/B
// Writes brush-bench.json + a console table.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT, chromiumExecutablePath } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const brush = flag('brush', 'crayon');
const variants = flag('variants', '1')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v));
const throttle = args.includes('--no-throttle') ? 1 : Number(flag('throttle', '4'));
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

// A deterministic battery, in a 0..1 normalized box (scaled to the real canvas
// in-page). Mixes the shapes that stress the two brushes: long sweeping
// squiggles, short dashes, and a cluster of OVERLAPPING strokes (watercolor
// pooling / crayon buildup show up where strokes cross).
function battery() {
  const strokes = [];
  // Three long horizontal squiggles.
  for (let r = 0; r < 3; r++) {
    const y = 0.15 + r * 0.12;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = 0.08 + (i / 40) * 0.84;
      pts.push({ x, y: y + Math.sin(i / 3) * 0.03 });
    }
    strokes.push(pts);
  }
  // A dense cluster of overlapping diagonal strokes (buildup / pooling).
  for (let i = 0; i < 8; i++) {
    const x0 = 0.3 + i * 0.02;
    strokes.push([
      { x: x0, y: 0.55 },
      { x: x0 + 0.18, y: 0.85 },
    ]);
  }
  // Short dashes.
  for (let i = 0; i < 10; i++) {
    const x = 0.1 + i * 0.08;
    strokes.push([
      { x, y: 0.92 },
      { x: x + 0.04, y: 0.95 },
    ]);
  }
  return strokes;
}

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  if (process.env.PERF_MARKS !== 'true') process.env.PERF_MARKS = 'true';

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-brush-${brush}`);
  mkdirSync(outDir, { recursive: true });

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  const results = [];
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__engineReady === true);
    // Grow the harness canvas from its 300×300 default to a realistic drawing
    // area so the battery lays down meaningful ink.
    await page.evaluate(() => window.__engine.resizeTo(900, 620));

    const strokes = battery();

    for (const v of variants) {
      const metrics = await page.evaluate(
        async ({ brush, v, strokes }) => {
          const eng = window.__engine;
          const canvas = document.getElementById('engineCanvas');
          const rect = canvas.getBoundingClientRect();
          // Reset: clear ink and history, then arm the brush + variant.
          if (!eng.isCanvasEmpty()) {
            eng.clearCanvas();
            eng.undo(); // drop the clear command too, back to blank history
          }
          eng.setColor('#3060c0');
          eng.setStrokeWidth(10);
          eng.setBrush(brush);
          eng.setBrushVariant(brush, v);

          const abs = (p) => ({ x: p.x * rect.width, y: p.y * rect.height });

          performance.clearMeasures('engine.draw');
          const t0 = performance.now();
          for (const s of strokes) eng.strokeSync(s.map(abs), 'pen');
          const drawWall = performance.now() - t0;

          const draws = performance.getEntriesByName('engine.draw').map((m) => m.duration);
          const sum = draws.reduce((a, b) => a + b, 0);
          const max = draws.reduce((a, b) => Math.max(a, b), 0);

          const opaque = eng.nonTransparentCount();

          // Rebuild cost: a single undo replays from the baseline + command log.
          performance.clearMeasures?.('engine.undo');
          const u0 = performance.now();
          eng.undo();
          const undoWall = performance.now() - u0;

          return {
            drawWallMs: drawWall,
            drawCount: draws.length,
            drawSumMs: sum,
            drawAvgMs: draws.length ? sum / draws.length : 0,
            drawMaxMs: max,
            undoWallMs: undoWall,
            opaquePixels: opaque,
          };
        },
        { brush, v, strokes }
      );

      // Re-draw for a clean screenshot (the metrics run ended with an undo).
      await page.evaluate(
        async ({ brush, v, strokes }) => {
          const eng = window.__engine;
          const canvas = document.getElementById('engineCanvas');
          const rect = canvas.getBoundingClientRect();
          if (!eng.isCanvasEmpty()) {
            eng.clearCanvas();
            eng.undo();
          }
          eng.setBrush(brush);
          eng.setBrushVariant(brush, v);
          const abs = (p) => ({ x: p.x * rect.width, y: p.y * rect.height });
          for (const s of strokes) eng.strokeSync(s.map(abs), 'pen');
        },
        { brush, v, strokes }
      );
      await page.locator('#engineCanvas').screenshot({ path: join(outDir, `${brush}-v${v}.png`) });

      results.push({ variant: v, ...metrics });
    }
  } finally {
    await browser.close();
    stop();
  }

  writeFileSync(
    join(outDir, 'brush-bench.json'),
    JSON.stringify({ brush, throttle, results }, null, 2)
  );

  const pad = (s, n) => String(s).padStart(n);
  console.log(`\nBrush bench — ${brush} (${throttle}× CPU throttle)\n`);
  console.log('var  draws  draw∑(ms)  avg(ms)  max(ms)  undo(ms)  opaquePx');
  for (const r of results) {
    console.log(
      `${pad(r.variant, 3)}  ${pad(r.drawCount, 5)}  ${pad(r.drawSumMs.toFixed(1), 9)}  ` +
        `${pad(r.drawAvgMs.toFixed(3), 7)}  ${pad(r.drawMaxMs.toFixed(2), 7)}  ` +
        `${pad(r.undoWallMs.toFixed(1), 8)}  ${pad(r.opaquePixels, 8)}`
    );
  }
  console.log(`\nArtifacts + screenshots: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
