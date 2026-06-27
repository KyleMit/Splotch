// Focused undo/keyframe profile: drives the imperative engine through three
// deliberately-shaped sessions and records, per scenario, how the command log
// behaves (keyframe count, retained commands, peak op count), the cost of
// drawing vs. the cost of undoing, and the JS-heap footprint while history is
// resident. Built to answer "is keyframing earning its keep, and is undo back
// to O(1)?" (ADR-0033/0035) and to be re-run unchanged against the old snapshot
// engine for a side-by-side comparison.
//
//   npm run perf:undo                       (tablet viewport, 4× CPU throttle)
//   node scripts/perf/undo-scenarios.mjs --no-throttle --no-build
//
// Unlike perf:web (which drives the real #drawingCanvas toddler session), this
// drives /dev/engine so it can read getUndoDebug() — the command-log internals —
// and place strokes with exact op counts. Synthetic PointerEvents don't coalesce,
// so one dispatched pointermove == one engine draw() == one recorded op; that is
// what lets a stroke deterministically land above or below OP_KEYFRAME_THRESHOLD.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';
import {
  startTrace,
  stopTrace,
  injectObservers,
  readObservers,
  heapBytes,
  markPhase,
} from './capture.mjs';
import { analyze, renderReport } from './analyze.mjs';

// The deployment target we actually worry about: a 12.9" iPad Pro in portrait —
// 1024×1366 CSS pt. iPads report devicePixelRatio 2 and the engine caps
// renderScale at min(dpr, 2) = 2, so the backing store is 2048×2732 and the
// square baseline/keyframe raster is 2732² ≈ 29.9 MB each — the real per-raster
// cost on that device (ten of them ≈ 300 MB, the worst case ADR-0033 bounds).
const DEVICE = { width: 1024, height: 1366, deviceScaleFactor: 2, label: 'ipad-pro-12.9' };

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const throttle = args.includes('--no-throttle') ? 1 : Number(flag('throttle', '4'));
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

// The regression is "one op per pointermove frame," so op volume = refresh rate
// × stroke duration. A 120 Hz ProMotion iPad Pro captures ~120 ops/second, so a
// sustained multi-second scribble is ~1,000–2,400 ops in ONE undo command
// (ADR-0035). Default to a ~10 s single-finger scribble at 120 Hz; override to
// explore. This is the data volume the harness MUST reproduce — 80-op strokes
// clear the 48-op threshold but don't stress the keyframe build the way a real
// scribble does.
const HZ = Number(flag('hz', '120'));
const LONG_SECONDS = Number(flag('long-seconds', '10'));
const LONG_OPS = Number(flag('long-ops', String(Math.round(HZ * LONG_SECONDS)))); // ≈1200
// A multi-finger gesture is a SINGLE undo unit accumulating every finger's ops.
// 5 fingers × a ~4 s drag at 120 Hz ≈ this many ops in one command — the worst
// case for a single keyframe build.
const MULTI_FINGERS = 5;
const MULTI_SECONDS = Number(flag('multi-seconds', '4'));
const MULTI_OPS_PER_FINGER = Math.round(HZ * MULTI_SECONDS);

const MARGIN = 160; // keep stroke starts away from the edge-swipe guard band

// A long, multi-second squiggle: one dense sine sweep across the canvas interior.
// `points` dispatched moves → ~points ops, so at the default LONG_OPS each of
// these is a real 120 Hz scribble that commits to a keyframe.
function longSquiggle(row, width, height, points = LONG_OPS) {
  const x0 = MARGIN;
  const x1 = width - MARGIN;
  const span = x1 - x0;
  const cy = MARGIN + ((height - 2 * MARGIN) * (row + 0.5)) / 6;
  const amp = (height - 2 * MARGIN) / 14;
  const pts = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    pts.push({ x: x0 + span * t, y: cy + Math.sin(t * Math.PI * 12) * amp });
  }
  return pts;
}

// A tap (1 point → a dot op) or a short dash (4 points → 3 ops). Either way far
// under the threshold, so these stay cheap replayable ops and never keyframe.
function shortMark(i, width, height) {
  const cols = 4;
  const x = MARGIN + ((width - 2 * MARGIN) * (i % cols)) / (cols - 1);
  const y = MARGIN + ((height - 2 * MARGIN) * Math.floor(i / cols)) / 3;
  if (i % 2 === 0) return [{ x, y }]; // dot
  return [0, 1, 2, 3].map((k) => ({ x: x + k * 12, y })); // dash
}

// One five-finger drag: every finger down, all advance in lockstep, all lift —
// the engine records them into ONE command (one undo unit), so its op list is
// fingers × points. Shaped as { multi: [{pointerId, points}] } for multiStrokeSync.
function multiFingerGesture(gi, width, height, perFinger = MULTI_OPS_PER_FINGER) {
  const fingers = [];
  for (let f = 0; f < MULTI_FINGERS; f++) {
    const cy = MARGIN + ((height - 2 * MARGIN) * (f + 0.5)) / MULTI_FINGERS;
    const x0 = MARGIN;
    const span = width - 2 * MARGIN;
    const amp = (height - 2 * MARGIN) / (MULTI_FINGERS * 3);
    const points = [];
    for (let i = 0; i < perFinger; i++) {
      const t = i / (perFinger - 1);
      points.push({ x: x0 + span * t, y: cy + Math.sin(t * Math.PI * 8 + gi) * amp });
    }
    fingers.push({ pointerId: f + 1, points });
  }
  return { multi: fingers };
}

function buildScenarios(width, height) {
  const longs = Array.from({ length: 12 }, (_, i) => longSquiggle(i % 6, width, height));
  const shorts = Array.from({ length: 12 }, (_, i) => shortMark(i, width, height));
  // Alternating long/short, 12 total.
  const mixed = Array.from({ length: 12 }, (_, i) =>
    i % 2 === 0 ? longSquiggle(i % 6, width, height) : shortMark(i, width, height)
  );
  const multi = Array.from({ length: 12 }, (_, i) => multiFingerGesture(i, width, height));
  return [
    {
      key: 'long-squiggles',
      label: `12 long squiggles (~${LONG_OPS} ops each @ ${HZ}Hz), then undo all`,
      strokes: longs,
    },
    { key: 'short-marks', label: '12 short dot/dash strokes, then undo all', strokes: shorts },
    { key: 'mixed', label: '12 mixed long+short strokes, then undo all', strokes: mixed },
    {
      key: 'multi-finger',
      label: `12 five-finger drags (~${MULTI_FINGERS * MULTI_OPS_PER_FINGER} ops/command), then undo all`,
      strokes: multi,
    },
  ];
}

const now = (page) => page.evaluate(() => performance.now());

// Engine.* user-timing measures whose startTime falls in [from, to), aggregated
// by name. Lets us attribute draw-phase vs undo-phase cost per scenario from the
// same marks the trace records globally.
function engineMeasuresIn(page, from, to) {
  return page.evaluate(
    ({ from, to }) => {
      const byName = {};
      for (const m of performance.getEntriesByType('measure')) {
        if (!m.name.startsWith('engine.')) continue;
        if (m.startTime < from || m.startTime >= to) continue;
        const e = (byName[m.name] ??= { count: 0, total: 0, max: 0 });
        e.count++;
        e.total += m.duration;
        e.max = Math.max(e.max, m.duration);
      }
      return byName;
    },
    { from, to }
  );
}

async function resetEngine(page, base, width, height) {
  await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#engineCanvas');
  await page.waitForFunction(() => window.__engineReady === true);
  await page.evaluate(({ width, height }) => window.__engine.resizeTo(width, height), {
    width,
    height,
  });
  await sleep(150);
}

async function drawStrokes(page, strokes) {
  await page.evaluate((strokes) => {
    for (const s of strokes) {
      if (s && s.multi) window.__engine.multiStrokeSync(s.multi, 'touch');
      else window.__engine.strokeSync(s, 'touch');
    }
  }, strokes);
}

// Undo until the engine reports nothing left (capped well above the log size),
// counting the steps actually performed.
async function undoAll(page) {
  return page.evaluate(async () => {
    let steps = 0;
    for (let i = 0; i < 20; i++) {
      if (!window.__engineState.canUndo) break;
      window.__engine.undo();
      steps++;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return steps;
  });
}

const undoDebug = (page) =>
  page.evaluate(() => (window.__engine.getUndoDebug ? window.__engine.getUndoDebug() : null));

// The square baseline/keyframe raster is max(w,h) of the backing store (engine
// uses max(w,h) × renderScale). performance.memory can't see canvas pixel
// buffers (they aren't on the JS heap), so history memory has to be derived from
// the raster geometry: this is the real per-raster cost a keyframe or an old-
// style snapshot occupies, and the apples-to-apples number across both engines.
async function rasterGeometry(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#engineCanvas');
    const side = Math.max(c.width, c.height);
    return { backingW: c.width, backingH: c.height, side, bytesPerRaster: side * side * 4 };
  });
}

async function main() {
  // /dev/engine is gated by PUBLIC_ENABLE_DEV_HARNESS ($env/dynamic/public, read
  // at runtime), so the preview server spawned by buildAndPreview must inherit it.
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  if (process.env.PERF_MARKS !== 'true') {
    console.warn(
      '! PERF_MARKS is not "true" — engine.* marks will be absent. Use `npm run perf:undo`.'
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const throttleTag = throttle > 1 ? `${throttle}x` : 'raw';
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-undo-scenarios-${throttleTag}`);
  mkdirSync(outDir, { recursive: true });

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({ headless: true });
  const t0 = Date.now();
  try {
    const ctx = await browser.newContext({
      viewport: { width: DEVICE.width, height: DEVICE.height },
      deviceScaleFactor: DEVICE.deviceScaleFactor,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await resetEngine(page, base, DEVICE.width, DEVICE.height);

    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    await injectObservers(page);
    const geom = await rasterGeometry(page);
    const events = await startTrace(cdp);
    const scenarios = buildScenarios(DEVICE.width, DEVICE.height);
    const results = [];

    for (const sc of scenarios) {
      console.log(`\n▶ ${sc.label}`);
      await resetEngine(page, base, DEVICE.width, DEVICE.height);
      // Reload drops the rAF FPS sampler injected before the trace; re-inject so
      // frame health still reflects this scenario.
      await injectObservers(page);

      const drawStart = await now(page);
      await markPhase(page, `${sc.key}-draw`, () => drawStrokes(page, sc.strokes));
      const drawEnd = await now(page);

      const debug = await undoDebug(page);
      const heapAfterDraw = await heapBytes(page);

      const undoStart = await now(page);
      let steps = 0;
      await markPhase(page, `${sc.key}-undo`, async () => {
        steps = await undoAll(page);
      });
      const undoEnd = await now(page);
      const heapAfterUndo = await heapBytes(page);

      const drawMarks = await engineMeasuresIn(page, drawStart, drawEnd);
      const undoMarks = await engineMeasuresIn(page, undoStart, undoEnd);

      const draw = drawMarks['engine.draw'] || { count: 0, total: 0, max: 0 };
      const keyframe = drawMarks['engine.keyframe'] || { count: 0, total: 0, max: 0 };
      const undoM = undoMarks['engine.undo'] || { count: 0, total: 0, max: 0 };

      results.push({
        key: sc.key,
        label: sc.label,
        strokes: sc.strokes.length,
        debug, // { commands, keyframes, maxOps } or null on the snapshot engine
        undoSteps: steps,
        draw: {
          ops: draw.count,
          totalMs: draw.total,
          keyframeBuilds: keyframe.count,
          keyframeMs: keyframe.total,
          keyframeMaxMs: keyframe.max,
        },
        undo: {
          steps: undoM.count,
          totalMs: undoM.total,
          avgMs: undoM.count ? undoM.total / undoM.count : 0,
          maxMs: undoM.max,
        },
        heap: {
          afterDrawMB: heapAfterDraw ? heapAfterDraw / 1048576 : null,
          afterUndoMB: heapAfterUndo ? heapAfterUndo / 1048576 : null,
        },
        // History raster memory the way it actually lives — off the JS heap, in
        // canvas backing stores. keyframes resident now + 1 always-present
        // baseline, each bytesPerRaster.
        historyRasterMB:
          debug != null ? ((debug.keyframes + 1) * geom.bytesPerRaster) / 1048576 : null,
      });
      console.log(
        `  keyframes=${debug?.keyframes ?? 'n/a'} commands=${debug?.commands ?? 'n/a'} ` +
          `maxOps=${debug?.maxOps ?? 'n/a'} | undo ${undoM.count} steps ` +
          `avg ${(undoM.count ? undoM.total / undoM.count : 0).toFixed(1)}ms max ${undoM.max.toFixed(1)}ms`
      );
    }

    const obs = await readObservers(page);
    await stopTrace(cdp);
    await page.screenshot({ path: join(outDir, 'screenshot.png') }).catch(() => {});

    // Standard trace artifacts (engine hot paths, frame health) via the shared
    // analyzer, plus the bespoke per-scenario undo/keyframe summary.
    const settings = {
      target: 'web/dev-engine (headless Chromium — not WebKit/real GPU)',
      device: DEVICE.label,
      viewport: DEVICE,
      throttle: throttle > 1 ? throttle : 0,
      refreshHz: HZ,
      frameBudgetMs: 1000 / HZ,
      longOps: LONG_OPS,
      buildMode: build ? 'production-preview' : 'production-preview (reused build)',
      captureMode: 'cdp-trace',
      raster: { ...geom, mbPerRaster: geom.bytesPerRaster / 1048576 },
      startedAt: new Date(t0).toISOString(),
      durationMs: Date.now() - t0,
    };
    const metrics = {
      settings,
      longTasks: obs.longTasks,
      frames: obs.frames,
      heap: { beforeBytes: 0, afterBytes: obs.heapBytes ?? 0 },
    };
    writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents: events }));
    writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));

    const summary = analyze(events, metrics);
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(outDir, 'report.md'), renderReport(summary));

    const undoSummary = { settings, scenarios: results };
    writeFileSync(join(outDir, 'undo-scenarios.json'), JSON.stringify(undoSummary, null, 2));
    const md = renderUndoReport(undoSummary);
    writeFileSync(join(outDir, 'undo-scenarios.md'), md);

    console.log(`\n${md}\n`);
    console.log(`Artifacts: ${outDir}`);
  } finally {
    await browser.close();
    stop();
  }
}

const f1 = (n) => (n == null ? 'n/a' : n.toFixed(1));

function renderUndoReport({ settings, scenarios }) {
  const out = [];
  out.push('# Undo / keyframe scenario profile\n');
  out.push(
    `Target **${settings.target}** · device **${settings.device}** ` +
      `(${settings.viewport?.width}×${settings.viewport?.height} @ dsf ${settings.viewport?.deviceScaleFactor}) · ` +
      `refresh **${settings.refreshHz}Hz** (frame budget **${f1(settings.frameBudgetMs)} ms**) · ` +
      `CPU throttle **${settings.throttle ? settings.throttle + '×' : 'none'}** · ` +
      `build **${settings.buildMode}**\n`
  );
  out.push(
    `> Fidelity: long strokes are ~${settings.longOps} ops (≈ ${settings.refreshHz}Hz × ` +
      `stroke seconds) to mirror real input volume. Headless Chromium (Blink/V8) is **not** ` +
      `WebKit/JavaScriptCore or the iPad GPU, and CPU throttle models a slow CPU, not the ` +
      `tighter ${f1(settings.frameBudgetMs)} ms ProMotion frame. Absolute ms want a real-device ` +
      `Safari Web Inspector timeline (\`perf:ios\` / the \`mobile\` skill); this run is for ` +
      `command-log behavior, op-volume scaling, and relative cost.\n`
  );
  out.push(
    `> Note: strokes are dispatched synchronously (to land exact op counts), so the ` +
      `draw phase is one big task — its FPS/long-task numbers in report.md are a harness ` +
      `artifact. The clean live-draw signal is **engine.draw avg** (per pointermove); the ` +
      `keyframe-build and undo costs below don't depend on pacing.\n`
  );
  out.push('## Command log after drawing (getUndoDebug)\n');
  out.push('| Scenario | Strokes | Commands retained | Keyframes | Max ops in a command |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    out.push(
      `| ${s.label} | ${s.strokes} | ${s.debug?.commands ?? 'n/a'} | ` +
        `${s.debug?.keyframes ?? 'n/a'} | ${s.debug?.maxOps ?? 'n/a'} |`
    );
  }
  out.push('\n## Drawing cost (engine.draw + keyframe builds)\n');
  out.push(
    'The keyframe build runs once at finger-lift (off the draw frame), but a slow ' +
      'one still hitches the moment the stroke ends — so **max build** vs the frame budget ' +
      'is the number to watch.\n'
  );
  out.push(
    '| Scenario | draw() calls | draw total | keyframe builds | keyframe total | **keyframe max (1 build)** |'
  );
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    out.push(
      `| ${s.label} | ${s.draw.ops} | ${f1(s.draw.totalMs)} ms | ` +
        `${s.draw.keyframeBuilds} | ${f1(s.draw.keyframeMs)} ms | **${f1(s.draw.keyframeMaxMs)} ms** |`
    );
  }
  out.push('\n## Undo cost (engine.undo)\n');
  out.push('| Scenario | Undo steps | Total | Avg / step | Max step |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    out.push(
      `| ${s.label} | ${s.undo.steps} | ${f1(s.undo.totalMs)} ms | ` +
        `${f1(s.undo.avgMs)} ms | ${f1(s.undo.maxMs)} ms |`
    );
  }
  const r = settings.raster;
  out.push('\n## History raster memory (the real undo cost — off the JS heap)\n');
  out.push(
    `Each square raster is ${r?.side}×${r?.side} → **${f1(r?.mbPerRaster)} MB**. ` +
      `Canvas backing stores are **not** counted by performance.memory, so the JS-heap ` +
      `table below stays flat regardless of history — the raster figure is the one that matters.\n`
  );
  out.push('| Scenario | Rasters resident (keyframes + baseline) | History raster memory |');
  out.push('| --- | --- | --- |');
  for (const s of scenarios) {
    const rasters = s.debug != null ? `${s.debug.keyframes} + 1` : 'n/a';
    out.push(`| ${s.label} | ${rasters} | ${f1(s.historyRasterMB)} MB |`);
  }
  out.push('\n## JS heap (performance.memory — excludes canvas pixels; coarse, GC-dependent)\n');
  out.push('| Scenario | After draw (history resident) | After undo-to-empty |');
  out.push('| --- | --- | --- |');
  for (const s of scenarios) {
    out.push(`| ${s.label} | ${f1(s.heap.afterDrawMB)} MB | ${f1(s.heap.afterUndoMB)} MB |`);
  }
  out.push('\n---\nSee the `profiling` skill and ADR-0035 for how to read these.\n');
  return out.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
