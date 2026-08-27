// Which perOpGlazeReturn puts the native per-op glaze closest to the web
// pipeline's appearance?
//
//   npm run gen:crayon-glaze-match
//
// Web ('restamp') applies the glaze ONCE per pass. Native ('glaze-direct')
// applies it once per OP, and a stroke is many overlapping ops, so the two agree
// only when k per-op applications compose to one pass application —
// (1 - B)^k = colorMix. k is set by how much consecutive ops overlap, which this
// measures rather than assumes.
//
// Method: draw the same thing under both pipelines in the same browser and
// compare the colour where the strokes cross. Both arms are the real production
// code path, selected through the dev A/B seam.
//
// TWO LIMITS, both real:
//   * The answer is specific to this stroke geometry. Per-op glazing is
//     speed-dependent by construction (a slower stroke overlaps a pixel more
//     times), so no single value matches web at every speed. This finds the best
//     value for ONE representative speed and cannot do better.
//   * It compares the crossing's MEDIAN colour, not pixel for pixel. Every pass
//     takes a fresh pattern seed, so the tooth phase differs between two renders
//     of the same thing and a per-pixel diff would measure phase, not glaze.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from '@playwright/test';
import { argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { freePort, spawnViteServer } from '../lib/vite-server.mjs';
import { waitForUrl } from '../lib/net.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Under colour then over colour. Same-on-same is the control: min() is a fixed
// point and the return blit is the identity there, so both pipelines must agree
// exactly at every candidate value. A non-zero error on that row means the
// harness is measuring something other than the glaze.
const PAIRS = [
  ['Blue', 'Blue'],
  ['Yellow', 'Blue'],
  ['Blue', 'Yellow'],
  ['Blue', 'Red'],
  ['Red', 'Green'],
  ['Yellow', 'Purple'],
];
const STACK_DEPTHS = [1, 3, 10];
// Focused on the basin a first pass located (0.10-0.22 all scored 15-19 while
// 0.02 and 0.45 scored 50-70), plus one anchor outside it so a mistake that
// flattens the curve is visible rather than silently plausible.
const CANDIDATES = [0.04, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.24, 0.45];

const STROKE_WIDTH_PX = 26;
const CROSSING_SAMPLE_HALF_PX = 10;
const SERVER_READY_TIMEOUT_MS = 120_000;

function paletteByLabel() {
  const source = readFileSync(join(ROOT, 'web/src/lib/palette.ts'), 'utf8');
  const entries = [...source.matchAll(/\{\s*hex:\s*'(#[0-9a-fA-F]{3,8})',\s*label:\s*'([^']+)'/g)];
  if (!entries.length) fail('found no palette entries in web/src/lib/palette.ts');
  return new Map(entries.map((m) => [m[2], m[1]]));
}

// Draw one (under, over × depth) cell under one pipeline and report the crossing.
async function measure(page, { mode, glazeReturn, under, over, depth }) {
  return page.evaluate(
    ({ mode, glazeReturn, under, over, depth, width, half }) => {
      const engine = window.__engine;
      const canvas = document.getElementById('drawingCanvas');
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) throw new Error(`drawing canvas has no layout size (${w}x${h})`);
      const midX = Math.round(w / 2);
      const midY = Math.round(h / 2);

      engine.clearCanvas();
      engine.setCrayonDeposition(mode);
      engine.setCrayonMode(true);
      engine.setStrokeWidth(width);
      if (glazeReturn !== null) engine.setCrayonParams({ perOpGlazeReturn: glazeReturn });

      const line = (from, to) =>
        Array.from({ length: 41 }, (_, i) => ({
          x: from.x + ((to.x - from.x) * i) / 40,
          y: from.y + ((to.y - from.y) * i) / 40,
        }));

      engine.setColor(under);
      engine.strokeSync(line({ x: midX - 160, y: midY }, { x: midX + 160, y: midY }), 'pen');
      engine.setColor(over);
      for (let i = 0; i < depth; i++) {
        engine.strokeSync(line({ x: midX, y: midY - 160 }, { x: midX, y: midY + 160 }), 'pen');
      }
      if (engine.isCanvasEmpty()) throw new Error('the cell drew no ink');

      const data = engine.pixelsIn(midX - half, midY - half, half * 2, half * 2);
      const channels = [[], [], []];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] <= 128) continue;
        channels[0].push(data[i]);
        channels[1].push(data[i + 1]);
        channels[2].push(data[i + 2]);
      }
      if (!channels[0].length) throw new Error('the crossing region is empty');
      return channels.map((values) => {
        values.sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
      });
    },
    {
      mode,
      glazeReturn,
      under,
      over,
      depth,
      width: STROKE_WIDTH_PX,
      half: CROSSING_SAMPLE_HALF_PX,
    }
  );
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export async function findGlazeWebMatch() {
  const palette = paletteByLabel();
  // Narrowing flags: the full matrix takes over two hours, and a provisional
  // answer from one colour pair at two depths lands in minutes. Safe to run
  // concurrently with the full sweep because this measures COLOUR, which is
  // deterministic — host contention cannot change a pixel value, only a timing.
  const pairs = argFlag('pairs', null)
    ? argFlag('pairs', '')
        .split(',')
        .map((entry) => entry.split(':'))
    : PAIRS;
  const depths = argFlag('depths', null)
    ? argFlag('depths', '')
        .split(',')
        .map((entry) => Number.parseInt(entry, 10))
    : STACK_DEPTHS;
  const outDir = argFlag('out-dir', 'perf-profiles/crayon-glaze-match');
  const port = Number.parseInt(argFlag('port', '4206'), 10);
  await freePort(port);
  const server = spawnViteServer(port, { env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' } });
  const url = `http://localhost:${port}`;
  const browser = await webkit.launch();
  try {
    await waitForUrl(url, SERVER_READY_TIMEOUT_MS);
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
    await page.goto(`${url}/dev/engine`);
    await page.waitForFunction(() => Boolean(window.__engine));

    const rows = [];
    for (const [underLabel, overLabel] of pairs) {
      const under = palette.get(underLabel);
      const over = palette.get(overLabel);
      if (!under || !over) fail(`palette has no ${underLabel}/${overLabel}`);
      for (const depth of depths) {
        const web = await measure(page, {
          mode: 'restamp',
          glazeReturn: null,
          under,
          over,
          depth,
        });
        const errors = {};
        for (const glazeReturn of CANDIDATES) {
          const native = await measure(page, {
            mode: 'glaze-direct',
            glazeReturn,
            under,
            over,
            depth,
          });
          errors[glazeReturn] = Math.round(distance(web, native) * 10) / 10;
        }
        rows.push({ pair: `${overLabel} on ${underLabel}`, depth, web, errors });
        console.log(`${overLabel} on ${underLabel} ×${depth} — web ${web.join(',')}`);
        // Persist per ROW. Holding results in memory until the end lost a
        // 21-of-36 run to a single page crash (2026-08-27); a partial matrix is
        // still an answer, an empty file is not.
        mkdirSync(join(ROOT, outDir), { recursive: true });
        writeFileSync(
          join(ROOT, outDir, 'glaze-web-match-rows.json'),
          JSON.stringify(rows, null, 2)
        );
      }
    }

    // Mean error per candidate across every pair and depth, with the
    // same-on-same control reported separately: it must be ~0 everywhere, and if
    // it is not, nothing else on the sheet can be trusted.
    const isControl = (row) => row.pair.split(' on ')[0] === row.pair.split(' on ')[1];
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
    const summary = CANDIDATES.map((c) => ({
      glazeReturn: c,
      meanError:
        Math.round(mean(rows.filter((r) => !isControl(r)).map((r) => r.errors[c])) * 10) / 10,
      controlError: Math.round(mean(rows.filter(isControl).map((r) => r.errors[c])) * 10) / 10,
    }));
    const best = [...summary].sort((a, b) => a.meanError - b.meanError)[0];

    mkdirSync(join(ROOT, outDir), { recursive: true });
    writeFileSync(
      join(ROOT, outDir, 'glaze-web-match.json'),
      JSON.stringify({ summary, best, rows }, null, 2)
    );
    console.log('\nmean distance from the web pipeline, per candidate:');
    for (const s of summary) {
      console.log(
        `  ${String(s.glazeReturn).padEnd(5)} error ${String(s.meanError).padStart(6)}` +
          `   (same-colour control ${s.controlError})`
      );
    }
    console.log(
      `\nclosest to web: perOpGlazeReturn = ${best.glazeReturn} (error ${best.meanError})`
    );
    return best;
  } finally {
    await browser.close();
    server.stop();
  }
}

if (isMain(import.meta.url)) runMain(() => findGlazeWebMatch());
