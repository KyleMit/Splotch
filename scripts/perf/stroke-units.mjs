// Per-stroke fidelity unit tests: draw ONE stroke live (full resolution), force a
// rebuild-from-stored-ops, and STRICTLY diff the two — exact (0px) ink mismatch,
// the worst coherent shift distance, and ink-extent delta — saving live/rebuilt/
// diff PNGs per stroke. The corpus is synthetic primitives (dot → scribble, in
// rising complexity) plus individual strokes extracted from the saved real
// sessions. Each stroke is its own pass/fail unit, so a regression is pinned to a
// shape, not buried in a whole-canvas average.
//
//   npm run perf:units            # all stroke units
//   node scripts/perf/stroke-units.mjs --no-build --filter=scribble

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, chromiumExecutablePath, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const filter = (args.find((a) => a.startsWith('--filter=')) || '').split('=')[1] || '';
const mode = (args.find((a) => a.startsWith('--mode=')) || '').split('=')[1] || 'samples';
const reduce = !args.includes('--no-reduce');
const split = (args.find((a) => a.startsWith('--split=')) || '').split('=')[1] || 'corner';
const epsArg = (args.find((a) => a.startsWith('--eps=')) || '').split('=')[1];
const minArg = (args.find((a) => a.startsWith('--min=')) || '').split('=')[1];
const maxArg = (args.find((a) => a.startsWith('--max=')) || '').split('=')[1];
const DSF = 2;
const SIZE_PX = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 };
// Perceptual gate: a stroke passes if NO ink moved more than ~2 CSS px from the
// live render — the threshold below which a shift is not noticeable to the eye.
// xor (exact 0px mismatch) is reported for context but does not gate.
const MAX_SHIFT_FAIL = 2.0;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(ROOT, 'perf-profiles', `${stamp}-stroke-units`);
mkdirSync(outDir, { recursive: true });

// ---- corpus -------------------------------------------------------------

const sample = (fn, n) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));

function syntheticPrimitives() {
  const m = 60; // margin so the stroke sits inside the canvas
  return [
    { name: '01-dot', brush: 4, points: [{ x: m, y: m }] },
    {
      name: '02-short-line',
      brush: 3,
      points: [
        { x: m, y: m },
        { x: m + 80, y: m + 20 },
      ],
    },
    {
      name: '03-medium-line',
      brush: 3,
      points: sample((t) => ({ x: m + t * 260, y: m + t * 40 }), 40),
    },
    {
      name: '04-long-line',
      brush: 5,
      points: sample((t) => ({ x: m + t * 520, y: m + t * 30 }), 90),
    },
    {
      name: '05-gentle-arc',
      brush: 3,
      points: sample((t) => ({ x: m + t * 320, y: m + Math.sin(t * Math.PI) * 120 }), 70),
    },
    {
      name: '06-wave',
      brush: 4,
      points: sample((t) => ({ x: m + t * 360, y: m + 80 + Math.sin(t * Math.PI * 4) * 60 }), 120),
    },
    {
      name: '07-loop',
      brush: 3,
      points: sample(
        (t) => ({
          x: m + 140 + Math.cos(t * Math.PI * 2) * 120,
          y: m + 140 + Math.sin(t * Math.PI * 2) * 120,
        }),
        100
      ),
    },
    {
      name: '08-spiral',
      brush: 2,
      points: sample((t) => {
        const r = (1 - t) * 130;
        const a = t * Math.PI * 6;
        return { x: m + 150 + Math.cos(a) * r, y: m + 150 + Math.sin(a) * r };
      }, 150),
    },
    {
      name: '09-tight-zigzag',
      brush: 5,
      points: (() => {
        const p = [];
        let y = m;
        for (let s = 0; s < 9; s++) {
          const l = s % 2 === 0;
          for (let i = 0; i <= 24; i++) {
            const tx = i / 24;
            p.push({ x: m + (l ? tx : 1 - tx) * 360, y: (y += 1.2) });
          }
        }
        return p;
      })(),
    },
    {
      name: '10-sharp-hook',
      brush: 4,
      points: (() => {
        const a = sample((t) => ({ x: m + t * 300, y: m + 120 }), 60);
        const b = sample((t) => ({ x: m + 300 - t * 40, y: m + 120 - t * 110 }), 18);
        return a.concat(b);
      })(),
    },
  ];
}

function extractRealStrokes(file, label) {
  const path = join(ROOT, 'perf-profiles', 'recordings', file);
  if (!existsSync(path)) return [];
  const rec = JSON.parse(readFileSync(path, 'utf8'));
  let size = 2;
  const open = {};
  const strokes = [];
  for (const e of rec.events) {
    if (e.kind === 'action') {
      if (e.name === 'size') size = e.value;
    } else if (e.kind === 'pointer') {
      if (e.type === 'pointerdown') open[e.id] = { points: [{ x: e.x, y: e.y }], brush: size };
      else if (e.type === 'pointermove') open[e.id]?.points.push({ x: e.x, y: e.y });
      else if (e.type === 'pointerup' || e.type === 'pointercancel') {
        if (open[e.id]) {
          strokes.push(open[e.id]);
          delete open[e.id];
        }
      }
    }
  }
  // Normalize each to a local origin with a margin, label by length bucket.
  return strokes
    .filter((s) => s.points.length >= 1)
    .map((s, i) => {
      const xs = s.points.map((p) => p.x),
        ys = s.points.map((p) => p.y);
      const minX = Math.min(...xs),
        minY = Math.min(...ys);
      const m = 60;
      return {
        name: `${label}-${String(i).padStart(2, '0')}-n${s.points.length}`,
        brush: s.brush,
        points: s.points.map((p) => ({ x: p.x - minX + m, y: p.y - minY + m })),
      };
    });
}

// ---- run ----------------------------------------------------------------

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  let corpus = [
    ...syntheticPrimitives(),
    ...extractRealStrokes('session1.json', 'real1'),
    ...extractRealStrokes('session2.json', 'real2'),
    ...extractRealStrokes('scribble.json', 'scrib'),
  ];
  if (filter) corpus = corpus.filter((s) => s.name.includes(filter));

  const { base, stop } = await buildAndPreview(4173, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  const rows = [];
  try {
    for (const stroke of corpus) {
      const xs = stroke.points.map((p) => p.x),
        ys = stroke.points.map((p) => p.y);
      const m = 60;
      const cssW = Math.ceil(Math.max(...xs) + m);
      const cssH = Math.ceil(Math.max(...ys) + m);
      const ctx = await browser.newContext({
        viewport: { width: cssW, height: cssH },
        deviceScaleFactor: DSF,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#engineCanvas');
      await page.waitForFunction(() => window.__engineReady === true);
      await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), { w: cssW, h: cssH });
      await sleep(80);

      const res = await page.evaluate(runStroke, {
        stroke,
        sizePx: SIZE_PX,
        css: { w: cssW, h: cssH },
        // Default verifies the SHIPPING config ('samples' rebuild, ADR-0036).
        // --mode / --eps / --no-reduce / --disabled sweep the alternatives.
        params: {
          mode,
          reduce,
          split,
          enabled: !args.includes('--disabled'),
          keyframeThreshold: 1e9,
          ...(epsArg !== undefined ? { fraction: Number(epsArg) } : {}),
          ...(minArg !== undefined ? { min: Number(minArg) } : {}),
          ...(maxArg !== undefined ? { max: Number(maxArg) } : {}),
        },
      });
      writeFileSync(
        join(outDir, `${stroke.name}-live.png`),
        Buffer.from(res.livePng.split(',')[1], 'base64')
      );
      writeFileSync(
        join(outDir, `${stroke.name}-rebuilt.png`),
        Buffer.from(res.rebuiltPng.split(',')[1], 'base64')
      );
      writeFileSync(
        join(outDir, `${stroke.name}-diff.png`),
        Buffer.from(res.diffPng.split(',')[1], 'base64')
      );
      const pass = res.maxShiftPx <= MAX_SHIFT_FAIL;
      rows.push({ name: stroke.name, brush: stroke.brush, n: stroke.points.length, ...res, pass });
      delete rows[rows.length - 1].livePng;
      delete rows[rows.length - 1].rebuiltPng;
      delete rows[rows.length - 1].diffPng;
      await ctx.close();
      console.log(
        `${pass ? 'PASS' : 'FAIL'} ${stroke.name}: shift ${res.maxShiftPx.toFixed(2)}px xor ${res.xorPct.toFixed(2)}% segs ${res.segments} (${res.reduction.toFixed(1)}x)`
      );
    }
  } finally {
    await browser.close();
    stop();
  }
  writeFileSync(join(outDir, 'units.json'), JSON.stringify(rows, null, 2));
  writeFileSync(join(outDir, 'units.md'), renderReport(rows));
  const fails = rows.filter((r) => !r.pass);
  const maxShift = rows.reduce((m, r) => Math.max(m, r.maxShiftPx), 0);
  const meanRed = rows.reduce((s, r) => s + r.reduction, 0) / rows.length;
  console.log(
    `\n${fails.length} / ${rows.length} strokes FAIL (shift > ${MAX_SHIFT_FAIL}px). ` +
      `worst shift ${maxShift.toFixed(2)}px, mean reduction ${meanRed.toFixed(1)}x.`
  );
  console.log(`Artifacts: ${outDir}`);
}

// Runs in the page: draw one stroke live, snapshot, rebuild, snapshot, strict diff.
async function runStroke({ stroke, sizePx, css, params }) {
  const E = window.__engine;
  const cv = document.querySelector('#engineCanvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  E.setSimplifyParams(params);
  E.setStrokeWidth(sizePx[stroke.brush] || 8);
  E.strokeSync(stroke.points, 'touch');
  const W = cv.width,
    H = cv.height;
  const scale = W / css.w;
  const live = new Uint8ClampedArray(ctx.getImageData(0, 0, W, H).data);
  const dbg = E.getUndoDebug();
  const livePng = cv.toDataURL();

  await E.resizeTo(css.w, css.h);
  const rebuilt = ctx.getImageData(0, 0, W, H).data;
  const rebuiltPng = cv.toDataURL();

  const ink = (d, i) => d[i + 3] > 32;
  // nearest-ink distance (backing px) up to a cap, by expanding ring.
  const nearestDist = (d, x, y, cap) => {
    for (let r = 0; r <= cap; r++) {
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        const adx = r - Math.abs(dy);
        for (const dx of adx === 0 ? [0] : [-adx, adx]) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          if (d[(yy * W + xx) * 4 + 3] > 32) return r;
        }
      }
    }
    return cap + 1;
  };

  const cap = Math.ceil(8 * scale); // 8 CSS px
  let unionInk = 0,
    xor = 0,
    maxShiftBp = 0;
  const diff = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = ink(live, i),
        b = ink(rebuilt, i);
      let dr = 245,
        dg = 245,
        db = 245; // bg
      if (a || b) {
        unionInk++;
        if (a && b) {
          dr = 210;
          dg = 210;
          db = 210;
        } // unchanged (gray)
        else {
          xor++;
          const dist = a ? nearestDist(rebuilt, x, y, cap) : nearestDist(live, x, y, cap);
          if (dist > maxShiftBp) maxShiftBp = dist;
          if (a) {
            dr = 30;
            dg = 90;
            db = 230;
          } // live-only = blue
          else {
            dr = 230;
            dg = 40;
            db = 40;
          } // rebuilt-only = red
        }
      }
      diff.data[i] = dr;
      diff.data[i + 1] = dg;
      diff.data[i + 2] = db;
      diff.data[i + 3] = 255;
    }
  }
  ctx.putImageData(diff, 0, 0);
  const diffPng = cv.toDataURL();

  return {
    segments: dbg.totalSegments,
    reduction: dbg.keptPoints ? dbg.rawPoints / dbg.keptPoints : 1,
    xorPct: unionInk ? (100 * xor) / unionInk : 0,
    maxShiftPx: maxShiftBp / scale,
    livePng,
    rebuiltPng,
    diffPng,
  };
}

function renderReport(rows) {
  const out = ['# Per-stroke fidelity units (live vs. rebuilt)\n'];
  out.push(
    '`shift` = worst distance any ink moved (CSS px); `xor` = ink mismatch at 0px tolerance; `segs` = segments replayed. A unit PASSES with shift ≤ ' +
      MAX_SHIFT_FAIL +
      'px (the perceptual threshold); xor is reported for context only.\n'
  );
  out.push('| stroke | n | brush | segs | reduction | maxShift px | xor % | result |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const r of [...rows].sort((a, b) => b.maxShiftPx - a.maxShiftPx)) {
    out.push(
      `| ${r.name} | ${r.n} | ${r.brush} | ${r.segments} | ${r.reduction.toFixed(1)}x | ${r.maxShiftPx.toFixed(2)} | ${r.xorPct.toFixed(2)} | ${r.pass ? 'pass' : '**FAIL**'} |`
    );
  }
  return out.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
