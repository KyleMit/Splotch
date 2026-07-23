// Focused undo profile: drives the imperative engine through deliberately-
// shaped sessions and records, per scenario, how the snapshot stack behaves
// (depth, hot rasters vs encoded blobs), the cost of drawing vs. the cost of
// undoing — the commit hitch (paper copy) and per-step restore — and the
// memory footprint while history is resident. Built to watch the ADR-0066
// gates: commit max, snapshot copy max, undo avg/max, history MB.
//
//   npm run perf:undo                       (tablet viewport, 4× CPU throttle)
//   node scripts/perf/undo-scenarios.mjs --no-throttle --no-build
//
// Unlike perf:web (which drives the real #drawingCanvas toddler session), this
// drives /dev/engine so it can read getUndoDebug() — the snapshot-stack
// internals — and place strokes with exact op counts. Synthetic PointerEvents
// don't coalesce, so one dispatched pointermove == one engine draw() == one
// recorded op — real 120 Hz input volume, deterministically.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, chromiumExecutablePath, sleep } from '../lib/utils.mjs';
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
// square paper/snapshot raster is 2732² ≈ 29.9 MB each — the real per-raster
// cost on that device (the hot tier holds 2 of them + the paper).
const DEVICE = { width: 1024, height: 1366, deviceScaleFactor: 2, label: 'ipad-pro-12.9' };

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const throttle = args.includes('--no-throttle') ? 1 : Number(flag('throttle', '4'));
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

// Op volume = refresh rate × stroke duration. A 120 Hz ProMotion iPad Pro
// captures ~120 ops/second, so a sustained multi-second scribble is
// ~1,000–2,400 ops in ONE undo command. Default to a ~10 s single-finger
// scribble at 120 Hz; override to explore. This is the data volume the
// harness MUST reproduce — it's what made the replay era's stroke-end
// keyframe builds hitch, and what the commit fold now absorbs.
const HZ = Number(flag('hz', '120'));
const LONG_SECONDS = Number(flag('long-seconds', '10'));
const LONG_OPS = Number(flag('long-ops', String(Math.round(HZ * LONG_SECONDS)))); // ≈1200
// A multi-finger gesture is a SINGLE undo unit accumulating every finger's ops.
// 5 fingers × a ~4 s drag at 120 Hz ≈ this many ops in one command — the
// heaviest single commit fold.
const MULTI_FINGERS = 5;
const MULTI_SECONDS = Number(flag('multi-seconds', '4'));
const MULTI_OPS_PER_FINGER = Math.round(HZ * MULTI_SECONDS);

const MARGIN = 160; // keep stroke starts away from the edge-swipe guard band

// A long, multi-second squiggle: one dense sine sweep across the canvas interior.
// `points` dispatched moves → ~points ops, so at the default LONG_OPS each of
// these is a real 120 Hz scribble.
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

// A reversal-heavy back-and-forth scribble: x sweeps the interior in a triangle
// wave (a sharp reversal at each end) while y drifts down the row's band — the
// canonical toddler fill gesture. Drawn with the crayon, every reversal re-covers
// the just-laid strip, so the pass tracker splits mid-stroke and records a
// crayonFlush stamp per sweep; drawn with the pen it's the shape-matched control.
function scribble(row, width, height, points = LONG_OPS) {
  const sweeps = 8;
  const x0 = MARGIN;
  const span = width - 2 * MARGIN;
  const bandTop = MARGIN + ((height - 2 * MARGIN) * row) / 6;
  const bandH = (height - 2 * MARGIN) / 8;
  const pts = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const tri = Math.abs(((t * sweeps) % 2) - 1);
    pts.push({ x: x0 + span * (1 - tri), y: bandTop + bandH * t });
  }
  return pts;
}

// A tap (1 point → a dot op) or a short dash (4 points → 3 ops) — the cheap
// end of the commit-cost spectrum.
function shortMark(i, width, height) {
  const cols = 4;
  const rows = Math.ceil(STROKES / cols);
  const x = MARGIN + ((width - 2 * MARGIN) * (i % cols)) / (cols - 1);
  // Clamp the divisor: a single-row run (--strokes ≤ 4) would otherwise be 0/0.
  const y = MARGIN + ((height - 2 * MARGIN) * Math.floor(i / cols)) / Math.max(rows - 1, 1);
  if (i % 2 === 0) return [{ x, y }]; // dot
  return [0, 1, 2, 3].map((k) => ({ x: x + k * 12, y })); // dash
}

// One five-finger drag: every finger down, all advance in lockstep, all lift —
// the engine records them into ONE command (one undo unit, one snapshot), so its
// op list is fingers × points. Shaped as { multi: [{pointerId, points}] } for
// multiStrokeSync.
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

// Two strokes past MAX_UNDO_DEPTH, so every scenario fills the snapshot
// stack AND exercises the depth-cap shift path.
const STROKES = Number(flag('strokes', '22'));

function buildScenarios(width, height) {
  const longs = Array.from({ length: STROKES }, (_, i) => longSquiggle(i % 6, width, height));
  const shorts = Array.from({ length: STROKES }, (_, i) => shortMark(i, width, height));
  // Alternating long/short.
  const mixed = Array.from({ length: STROKES }, (_, i) =>
    i % 2 === 0 ? longSquiggle(i % 6, width, height) : shortMark(i, width, height)
  );
  const multi = Array.from({ length: STROKES }, (_, i) => multiFingerGesture(i, width, height));
  const scribbles = Array.from({ length: STROKES }, (_, i) => scribble(i % 6, width, height));
  return [
    {
      key: 'long-squiggles',
      label: `${STROKES} long squiggles (~${LONG_OPS} ops each @ ${HZ}Hz), then undo all`,
      strokes: longs,
    },
    {
      key: 'short-marks',
      label: `${STROKES} short dot/dash strokes, then undo all`,
      strokes: shorts,
    },
    { key: 'mixed', label: `${STROKES} mixed long+short strokes, then undo all`, strokes: mixed },
    {
      key: 'multi-finger',
      label: `${STROKES} five-finger drags (~${MULTI_FINGERS * MULTI_OPS_PER_FINGER} ops/command), then undo all`,
      strokes: multi,
    },
    // The crayon rows (ADR-0065): same input volume, but every pass close
    // stamps the pass buffer, so the crayon fold is the heaviest per-commit
    // render. The pen scribble is the shape-matched control.
    {
      key: 'scribbles',
      label: `${STROKES} pen back-and-forth scribbles (~${LONG_OPS} ops each), then undo all`,
      strokes: scribbles,
    },
    {
      key: 'crayon-squiggles',
      label: `${STROKES} crayon long squiggles (~${LONG_OPS} ops each), then undo all`,
      strokes: longs,
      crayon: true,
    },
    {
      key: 'crayon-scribbles',
      label: `${STROKES} crayon back-and-forth scribbles (mid-stroke pass splits), then undo all`,
      strokes: scribbles,
      crayon: true,
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

async function drawStrokes(page, strokes, crayon = false) {
  await page.evaluate(
    ({ strokes, crayon }) => {
      window.__engine.setCrayonMode(crayon);
      for (const s of strokes) {
        if (s && s.multi) window.__engine.multiStrokeSync(s.multi, 'touch');
        else window.__engine.strokeSync(s, 'touch');
      }
    },
    { strokes, crayon }
  );
}

// Undo until the engine reports nothing left (capped well above the stack
// size), counting the steps actually performed. Restores settle asynchronously
// (a deep entry decodes from its blob), so each step waits for its engine.undo
// measure to land before firing the next — otherwise the loop outruns the
// restore queue and the phase window misses the tail steps.
async function undoAll(page) {
  return page.evaluate(async () => {
    const completed = () => performance.getEntriesByName('engine.undo', 'measure').length;
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      if (!window.__engineState.canUndo) break;
      const before = completed();
      window.__engine.undo();
      steps++;
      const t0 = performance.now();
      // PERF_MARKS builds land one measure per completed restore; cap the wait
      // so a marks-less build still advances (on the old rAF cadence).
      while (completed() === before && performance.now() - t0 < 5000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return steps;
  });
}

const undoDebug = (page) =>
  page.evaluate(() => (window.__engine.getUndoDebug ? window.__engine.getUndoDebug() : null));

// Cold-tier demotion is async (encodeColdSnapshots' toBlob callbacks), and the
// batched draw phase returns before those callbacks run — sampled immediately,
// below-window entries still hold their ~30 MB rasters, so historyRasterMB
// transiently reports hundreds of MB of a healthy tier (nondeterministically,
// against the ≲150 MB gate) and the undo phase would measure live-raster
// restores instead of the blob decodes it exists to validate. Mirror the E2E
// spec (engine.spec.ts): poll until only the hot window still holds rasters
// — a raster is only dropped after its blob lands and validates, so
// liveRasters ≤ MAX_HOT_RASTERS means every below-window entry is encoded.
const MAX_HOT_RASTERS = 2;
async function settleColdTier(page, timeoutMs = 10_000) {
  const t0 = Date.now();
  for (;;) {
    const d = await undoDebug(page);
    if (d == null) return null;
    if (d.liveRasters <= MAX_HOT_RASTERS && (d.snapshots <= MAX_HOT_RASTERS || d.blobBytes > 0))
      return d;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `cold tier never settled within ${timeoutMs} ms: snapshots=${d.snapshots} ` +
          `liveRasters=${d.liveRasters} blobBytes=${d.blobBytes} ` +
          `(want liveRasters ≤ ${MAX_HOT_RASTERS} with below-window entries encoded)`
      );
    }
    await sleep(100);
  }
}

// The square paper/snapshot raster is max(w,h) of the backing store (engine
// uses max(w,h) × renderScale). performance.memory can't see canvas pixel
// buffers (they aren't on the JS heap), so history memory has to be derived
// from the raster geometry: this is the real per-raster cost each live
// snapshot (and the paper) occupies.
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
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
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
    // --scenarios=key1,key2 runs a subset (fast iteration on one question).
    const only = flag('scenarios', '');
    let scenarios = buildScenarios(DEVICE.width, DEVICE.height);
    if (only) {
      const keys = only.split(',');
      scenarios = scenarios.filter((sc) => keys.includes(sc.key));
      if (scenarios.length === 0) throw new Error(`--scenarios matched nothing: ${only}`);
    }
    const results = [];

    for (const sc of scenarios) {
      console.log(`\n▶ ${sc.label}`);
      await resetEngine(page, base, DEVICE.width, DEVICE.height);
      // Reload drops the rAF FPS sampler injected before the trace; re-inject so
      // frame health still reflects this scenario.
      await injectObservers(page);

      const drawStart = await now(page);
      await markPhase(page, `${sc.key}-draw`, () => drawStrokes(page, sc.strokes, !!sc.crayon));
      const drawEnd = await now(page);

      const debug = await settleColdTier(page);
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
      // engine.commit wraps the whole stroke-end pipeline (paper copy → fold),
      // so its max is the pointerup hitch the user feels. engine.snapshot
      // isolates the paper copy inside it.
      const commit = drawMarks['engine.commit'] || { count: 0, total: 0, max: 0 };
      const snapshot = drawMarks['engine.snapshot'] || { count: 0, total: 0, max: 0 };
      const undoM = undoMarks['engine.undo'] || { count: 0, total: 0, max: 0 };

      // History raster memory the way it actually lives — off the JS heap, in
      // canvas backing stores: live snapshot patches + the paper, plus the
      // encoded blobs. rasterBytes is the patches' real pixel cost (dirty-rect
      // snapshots, ADR-0069); liveRasters × full-raster is the fallback for a
      // build that predates it.
      const historyRasterMB =
        debug == null
          ? null
          : ((debug.rasterBytes ?? debug.liveRasters * geom.bytesPerRaster) +
              geom.bytesPerRaster +
              debug.blobBytes) /
            1048576;

      results.push({
        key: sc.key,
        label: sc.label,
        strokes: sc.strokes.length,
        crayon: !!sc.crayon,
        debug,
        undoSteps: steps,
        draw: {
          ops: draw.count,
          totalMs: draw.total,
          commitMs: commit.total,
          commitMaxMs: commit.max,
          snapshotMs: snapshot.total,
          snapshotMaxMs: snapshot.max,
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
        historyRasterMB,
      });
      console.log(
        `  snapshots=${debug?.snapshots ?? 'n/a'} liveRasters=${debug?.liveRasters ?? 'n/a'} ` +
          `blobKB=${debug ? Math.round(debug.blobBytes / 1024) : 'n/a'} | ` +
          `commit max ${commit.max.toFixed(1)}ms (copy max ${snapshot.max.toFixed(1)}ms) | ` +
          `undo ${undoM.count} steps ` +
          `avg ${(undoM.count ? undoM.total / undoM.count : 0).toFixed(1)}ms max ${undoM.max.toFixed(1)}ms`
      );
    }

    const obs = await readObservers(page);
    await stopTrace(cdp);
    await page.screenshot({ path: join(outDir, 'screenshot.png') }).catch(() => {});

    // Standard trace artifacts (engine hot paths, frame health) via the shared
    // analyzer, plus the bespoke per-scenario undo summary.
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
  out.push('# Undo scenario profile (snapshot stack, ADR-0066)\n');
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
      `WebKit/JavaScriptCore or the iPad GPU — SwiftShader software rendering exaggerates ` +
      `full-canvas blits (the paper copy, restores, blob decodes) heavily — and CPU throttle ` +
      `models a slow CPU, not the tighter ${f1(settings.frameBudgetMs)} ms ProMotion frame. ` +
      `Absolute ms want the on-device run (\`scripts/perf/ipad-console-driver.js\` / the ` +
      `\`profiling\` skill); this run is for stack behavior, op-volume scaling, and relative cost.\n`
  );
  out.push(
    `> Note: strokes are dispatched synchronously (to land exact op counts), so the ` +
      `draw phase is one big task — its FPS/long-task numbers in report.md are a harness ` +
      `artifact. The clean live-draw signal is **engine.draw avg** (per pointermove); the ` +
      `commit and undo costs below don't depend on pacing.\n`
  );
  out.push('## Snapshot stack after drawing (getUndoDebug)\n');
  out.push('| Scenario | Strokes | Snapshots | Live rasters | Blob bytes | Pending commands |');
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    const blobKB = s.debug ? Math.round((s.debug.blobBytes ?? 0) / 1024) : 'n/a';
    out.push(
      `| ${s.label} | ${s.strokes} | ${s.debug?.snapshots ?? 'n/a'} | ` +
        `${s.debug?.liveRasters ?? 'n/a'} | ${blobKB} KB | ${s.debug?.pendingCommands ?? 'n/a'} |`
    );
  }
  out.push('\n## Drawing cost (engine.draw + the stroke-end pipeline)\n');
  out.push(
    'engine.commit wraps the whole stroke-end pipeline (paper copy → fold), so **commit max** ' +
      'is the pointerup hitch the user feels; engine.snapshot isolates the paper copy inside it.\n'
  );
  out.push(
    '| Scenario | draw() calls | draw total | snapshot copy max | **commit max (1 stroke end)** |'
  );
  out.push('| --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    out.push(
      `| ${s.label} | ${s.draw.ops} | ${f1(s.draw.totalMs)} ms | ` +
        `${f1(s.draw.snapshotMaxMs)} ms | **${f1(s.draw.commitMaxMs)} ms** |`
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
      `table below stays flat regardless of history — the raster figure is the one that ` +
      `matters. Resident rasters = live snapshots + the paper, plus the encoded blob bytes.\n`
  );
  out.push('| Scenario | Rasters resident | Blob bytes | History memory |');
  out.push('| --- | --- | --- | --- |');
  for (const s of scenarios) {
    const rasters = s.debug == null ? 'n/a' : `${s.debug.liveRasters} + 1`;
    const blobKB = s.debug ? Math.round((s.debug.blobBytes ?? 0) / 1024) : 'n/a';
    out.push(`| ${s.label} | ${rasters} | ${blobKB} KB | ${f1(s.historyRasterMB)} MB |`);
  }
  out.push('\n## JS heap (performance.memory — excludes canvas pixels; coarse, GC-dependent)\n');
  out.push('| Scenario | After draw (history resident) | After undo-to-empty |');
  out.push('| --- | --- | --- |');
  for (const s of scenarios) {
    out.push(`| ${s.label} | ${f1(s.heap.afterDrawMB)} MB | ${f1(s.heap.afterUndoMB)} MB |`);
  }
  out.push('\n---\nSee the `profiling` skill and ADR-0066 for how to read these.\n');
  return out.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
