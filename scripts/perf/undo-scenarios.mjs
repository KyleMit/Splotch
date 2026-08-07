// Focused undo profile: drives the imperative engine through deliberately-
// shaped sessions and records, per scenario, how the snapshot stack behaves
// (depth, hot rasters vs encoded blobs), the cost of drawing vs. the cost of
// undoing — the commit hitch (paper copy) and per-step restore — and the
// memory footprint while history is resident. Built to watch the ADR-0066
// gates: commit P95, snapshot copy max, undo avg/max, history MB.
//
//   npm run perf:undo                       (tablet viewport, 4× CPU throttle)
//   node scripts/perf/undo-scenarios.mjs --no-throttle --no-build
//
// Unlike perf:web (which drives the real #drawingCanvas toddler session), this
// drives /dev/engine so it can read getUndoDebug() — the snapshot-stack
// internals — and place strokes with exact op counts. Synthetic PointerEvents
// don't coalesce, so one dispatched pointermove == one engine draw() == one
// recorded op — real 120 Hz input volume, deterministically.

import { chromium, webkit } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { fail, isMain, runMain, sleep } from '../lib/proc.mjs';
import { parsePerfArgs } from './args.mjs';
import { buildAndPreview } from './preview.mjs';
import {
  startTrace,
  stopTrace,
  collectMeasures,
  createMeasureTimeline,
  injectObservers,
  readObservers,
  heapBytes,
  markPhase,
} from './capture.mjs';
import { IPAD_PRO } from './devices.mjs';
import { profilePath } from './paths.mjs';
import { buildMetrics, writeProfileArtifacts } from './profile-artifacts.mjs';
import { percentile } from './real-screen-stats.mjs';
import {
  ALL_UNDO_SCENARIO_KEYS,
  FAST_UNDO_SCENARIO_KEYS,
  UNDO_SCENARIO_KEYS,
  UNDO_SCENARIO_PATHS,
} from './undo-scenario-keys.mjs';
import { appendFullRun, evaluateFastSet, readFastSetHistory } from './undo-fast-set.mjs';
import { toMiB } from './units.mjs';
import {
  COMMIT_GATE_MS,
  COMMIT_GATE_PERCENTILE,
  evaluateCommitTiming,
} from './undo-commit-gate.mjs';
import { warnIfNoPerfMarks } from './warnings.mjs';

// The deployment target we actually worry about: a 12.9" iPad Pro in portrait —
// 1024×1366 CSS pt. iPads report devicePixelRatio 2 and the engine caps
// renderScale at min(dpr, 2) = 2, so the backing store is 2048×2732 and the
// square paper/snapshot raster is 2732² ≈ 29.9 MB each — the real per-raster
// cost on that device (the hot tier holds 2 of them + the paper).
const { flag, throttle, port, build } = parsePerfArgs({
  throttleDefault: 4,
  extra: [
    'cold-tier-timeout-ms',
    'engine',
    'hz',
    'long-seconds',
    'long-ops',
    'multi-seconds',
    'fast-set-history',
    'strokes',
    'scenarios',
    'suite',
  ],
  entry: isMain(import.meta.url),
});
const COLD_TIER_TIMEOUT_MS = Number(flag('cold-tier-timeout-ms', '10000'));
const FAST_SET_HISTORY_SEED_PATH = fileURLToPath(
  new URL('./undo-fast-set-history.seed.json', import.meta.url)
);

// One decimal place, or 'n/a' for an absent measure.
const f1 = (n) => (n == null ? 'n/a' : n.toFixed(1));

// Which browser engine drives the scenarios, and everything that varies with it.
// Chromium is the default because it carries the instruments (CDP trace, CPU
// throttle, performance.memory); WebKit carries the engine family the iOS app
// actually ships (WebKit + JavaScriptCore), where per-engine canvas API
// behaviour differs in ways no amount of Chromium precision can see.
//
// `gated` is deliberately its own field rather than a reading of `hasCdp`. The
// two coincide for the engines here, but they are unrelated claims: `hasCdp` is
// about instruments, `gated` is about whether this engine's absolute
// milliseconds mean anything (see COMMIT_GATE_MS). An engine added later could
// easily be CDP-less *and* unfaithful for reasons of its own, and inheriting a
// gate calibrated against WebKit endpoints is not a default worth having.
const ENGINES = {
  chromium: {
    launcher: chromium,
    launchOptions: () => ({ headless: true, executablePath: chromiumExecutablePath(chromium) }),
    // CDP is Chromium-only: it carries the Chrome trace, the CPU throttle, and
    // the RunTask/CPU-sampler sections of report.md.
    hasCdp: true,
    gated: false,
    script: 'npm run perf:undo',
    label: 'headless Chromium (Blink/V8) — not WebKit/JavaScriptCore or the iPad GPU',
    fidelity: ({ frameBudgetMs }) =>
      `Headless Chromium (Blink/V8) is **not** WebKit/JavaScriptCore or the iPad GPU — ` +
      `SwiftShader software rendering exaggerates full-canvas blits (the paper copy, ` +
      `restores, blob decodes) heavily, and its spec-compliant in-parallel \`toBlob\` ` +
      `reports ~0 ms for an encode that costs WebKit a whole frame budget (#635). ` +
      `CPU throttle models a slow CPU, not the tighter ${f1(frameBudgetMs)} ms ProMotion frame.`,
  },
  webkit: {
    launcher: webkit,
    launchOptions: () => ({ headless: true }),
    hasCdp: false,
    gated: true,
    script: 'npm run perf:undo:webkit',
    label: "Playwright WebKit (WebKit/JavaScriptCore) — the iOS app's engine family, desktop build",
    fidelity: () =>
      `Playwright's WebKit is the engine family the iOS app ships (WebKit/JavaScriptCore), ` +
      `so per-engine canvas API behaviour — the synchronous \`toBlob\` encode behind #635 — ` +
      `is reproduced here and cannot be on Chromium at any precision. It is still a desktop ` +
      `build on desktop silicon, not an iPad: it has no CPU throttle and no ` +
      `\`performance.memory\`, so the JS-heap table below reads n/a. WebKit also clamps ` +
      `\`performance.now()\` to ~1 ms, so every duration here is quantized to whole ` +
      `milliseconds — read them as coarse magnitudes, never as sub-ms comparisons.`,
  },
};
const engineName = flag('engine', 'chromium');
const engine = ENGINES[engineName];
if (!engine) {
  fail(
    `--engine=${engineName} is not a known engine — expected one of ${Object.keys(ENGINES).join(', ')}`
  );
}

// Op volume = refresh rate × stroke duration. A 120 Hz ProMotion iPad Pro
// captures ~120 ops/second, so a sustained multi-second scribble is
// ~1,000–2,400 ops in ONE undo command. Default to a ~10 s single-finger
// scribble at 120 Hz; override to explore. This is the data volume the
// harness MUST reproduce — it's what made the replay era's stroke-end
// keyframe builds hitch, and what the commit fold now absorbs.
const HZ = Number(flag('hz', '120'));
// One frame at the target refresh — 8.3 ms on a 120 Hz ProMotion iPad. ADR-0066
// states the commit gate in these terms ("commit max ≈ one 120 Hz frame").
const FRAME_BUDGET_MS = 1000 / HZ;
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
const MAX_UNDO_DEPTH = 20;
const MAX_UNDO_STEPS = 60;
const STROKES = Number(flag('strokes', String(MAX_UNDO_DEPTH + 2)));

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
      key: UNDO_SCENARIO_KEYS.longSquiggles,
      label: `${STROKES} long squiggles (~${LONG_OPS} ops each @ ${HZ}Hz), then undo all`,
      strokes: longs,
    },
    {
      key: UNDO_SCENARIO_KEYS.shortMarks,
      label: `${STROKES} short dot/dash strokes, then undo all`,
      strokes: shorts,
    },
    {
      key: UNDO_SCENARIO_KEYS.mixed,
      label: `${STROKES} mixed long+short strokes, then undo all`,
      strokes: mixed,
    },
    {
      key: UNDO_SCENARIO_KEYS.multiFinger,
      label: `${STROKES} five-finger drags (~${MULTI_FINGERS * MULTI_OPS_PER_FINGER} ops/command), then undo all`,
      strokes: multi,
    },
    // The crayon rows (ADR-0065): same input volume, but every pass close
    // stamps the pass buffer, so the crayon fold is the heaviest per-commit
    // render. The pen scribble is the shape-matched control.
    {
      key: UNDO_SCENARIO_KEYS.scribbles,
      label: `${STROKES} pen back-and-forth scribbles (~${LONG_OPS} ops each), then undo all`,
      strokes: scribbles,
    },
    {
      key: UNDO_SCENARIO_KEYS.crayonSquiggles,
      label: `${STROKES} crayon long squiggles (~${LONG_OPS} ops each), then undo all`,
      strokes: longs,
      crayon: true,
    },
    {
      key: UNDO_SCENARIO_KEYS.crayonScribbles,
      label: `${STROKES} crayon back-and-forth scribbles (mid-stroke pass splits), then undo all`,
      strokes: scribbles,
      crayon: true,
    },
  ].map((scenario) => ({ ...scenario, paths: UNDO_SCENARIO_PATHS[scenario.key] }));
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
        if (m.name === 'engine.commit') (e.durationsMs ??= []).push(m.duration);
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
  return page.evaluate(
    ({ strokes, crayon }) => {
      window.__engine.setCrayonMode(crayon);
      for (const s of strokes) {
        if (s && s.multi) window.__engine.multiStrokeSync(s.multi, 'touch');
        else window.__engine.strokeSync(s, 'touch');
      }
      return performance.now();
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
  return page.evaluate(async (maxUndoSteps) => {
    const completed = () => performance.getEntriesByName('engine.undo', 'measure').length;
    let steps = 0;
    for (let i = 0; i < maxUndoSteps; i++) {
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
  }, MAX_UNDO_STEPS);
}

const undoDebug = (page) =>
  page.evaluate(() => (window.__engine.getUndoDebug ? window.__engine.getUndoDebug() : null));

// The tier re-balances asynchronously — encodes land on an idle callback,
// decodes on a promise — and the batched draw phase returns before either runs.
// Sampled immediately, entries still hold rasters a pending encode is about to
// free, so historyRasterMB transiently reports hundreds of MB of a healthy tier
// (nondeterministically, against the ≲150 MB gate) and the undo phase would
// measure raster restores instead of the blob decodes it exists to validate.
//
// What the harness needs is that the tier has *quiesced*, not that it reached
// any particular shape. An earlier version waited for `liveRasters <= 2`,
// mirroring the hot-entry count undoHistory used at the time; ADR-0082 replaced
// that count with a byte budget and the predicate became unreachable, skipping
// every scenario with an all-`n/a` report (docs/AUDIT.md had already filed the
// mirror as a drift risk). Polling for a stable reading instead is independent
// of whatever the tiering policy is.
const SETTLE_POLL_MS = 100;
// Stability has to outlast a pending encode that has not started yet: scheduleIdle
// (web/src/lib/idle.ts) falls back to a 200 ms timeout wherever requestIdleCallback
// is missing, so fewer samples than that could read "unchanged" before any work ran.
const SETTLE_STABLE_SAMPLES = 4;
async function settleColdTier(page, timeoutMs = 10_000) {
  const t0 = Date.now();
  const sameTier = (a, b) =>
    a != null &&
    a.snapshots === b.snapshots &&
    a.liveRasters === b.liveRasters &&
    a.blobBytes === b.blobBytes &&
    a.rasterBytes === b.rasterBytes;
  let prev = null;
  let stable = 0;
  for (;;) {
    const d = await undoDebug(page);
    if (d == null) return null;
    stable = sameTier(prev, d) ? stable + 1 : 0;
    if (stable >= SETTLE_STABLE_SAMPLES - 1) return d;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `cold tier never settled within ${timeoutMs} ms: snapshots=${d.snapshots} ` +
          `liveRasters=${d.liveRasters} blobBytes=${d.blobBytes} ` +
          `(want ${SETTLE_STABLE_SAMPLES} consecutive identical samples)`
      );
    }
    prev = d;
    await sleep(SETTLE_POLL_MS);
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

export async function runUndoScenario(
  page,
  base,
  sc,
  geom,
  coldTierTimeoutMs = COLD_TIER_TIMEOUT_MS
) {
  console.log(`\n▶ ${sc.label}`);
  await resetEngine(page, base, IPAD_PRO.width, IPAD_PRO.height);
  // Reload drops the rAF FPS sampler injected before the trace; re-inject so
  // frame health still reflects this scenario.
  await injectObservers(page);

  const drawStart = await now(page);
  const drawEnd = await markPhase(page, `${sc.key}-draw`, () =>
    drawStrokes(page, sc.strokes, !!sc.crayon)
  );

  const debug = await settleColdTier(page, coldTierTimeoutMs);
  // The cold encode is scheduled off the commit (scheduleColdEncode →
  // scheduleIdle), and the draw phase is one synchronous batch with no idle
  // gaps, so a correctly-deferred encode can only land between drawEnd and
  // here. That makes this boundary the one that separates an encode on the
  // commit path from an encode off it.
  const settleEnd = await now(page);
  const heapAfterDraw = await heapBytes(page);

  const undoStart = await now(page);
  let steps = 0;
  await markPhase(page, `${sc.key}-undo`, async () => {
    steps = await undoAll(page);
  });
  const undoEnd = await now(page);
  const heapAfterUndo = await heapBytes(page);
  // Drain the sampler this scenario injected, for the same reason it had to be
  // re-injected: the next scenario's reload wipes window.__perf, so reading
  // once at the end of the run would describe the final scenario only.
  const observers = await readObservers(page);

  const drawMarks = await engineMeasuresIn(page, drawStart, drawEnd);
  // Deliberately disjoint from the draw window, not a superset of it: an encode
  // that ran on the commit path would otherwise be counted as deferred as well,
  // and the two figures could never be read against each other. Split at
  // drawEnd, "on the commit" and "off it" partition the encode cost.
  const postDrawMarks = await engineMeasuresIn(page, drawEnd, settleEnd);
  const undoMarks = await engineMeasuresIn(page, undoStart, undoEnd);

  const draw = drawMarks['engine.draw'] || { count: 0, total: 0, max: 0 };
  // engine.commit wraps the whole stroke-end pipeline (paper copy → fold), so
  // its max is the pointerup hitch the user feels; engine.snapshot (the paper
  // copy), engine.fold (rendering the committed ops), and engine.encode
  // (demoting cold patches to blobs) are the candidates it decomposes into, so
  // a hot commit attributes to one of them rather than to the pipeline at large.
  const commit = drawMarks['engine.commit'] || { count: 0, total: 0, max: 0, durationsMs: [] };
  const snapshot = drawMarks['engine.snapshot'] || { count: 0, total: 0, max: 0 };
  const fold = drawMarks['engine.fold'] || { count: 0, total: 0, max: 0 };
  const encode = postDrawMarks['engine.encode'] || { count: 0, total: 0, max: 0 };
  // The encode that landed in the *draw* window rather than the settle window.
  // The draw phase is one synchronous batch with no idle gaps (see settleEnd),
  // so scheduleIdle cannot have run inside it — an encode measured here is an
  // encode back on the commit path, and it is the only encode figure that
  // belongs beside snapshot/fold/commit, which all come from this same window.
  const encodeInCommit = drawMarks['engine.encode'] || { count: 0, total: 0, max: 0 };
  const undoM = undoMarks['engine.undo'] || { count: 0, total: 0, max: 0 };
  const commitP95Ms = percentile(commit.durationsMs, COMMIT_GATE_PERCENTILE) ?? 0;

  // History raster memory the way it actually lives — off the JS heap, in
  // canvas backing stores: live snapshot patches + the paper, plus the
  // encoded blobs. rasterBytes is the patches' real pixel cost (dirty-rect
  // snapshots, ADR-0069); liveRasters × full-raster is the fallback for a
  // build that predates it.
  const historyRasterMB =
    debug == null
      ? null
      : toMiB(
          (debug.rasterBytes ?? debug.liveRasters * geom.bytesPerRaster) +
            geom.bytesPerRaster +
            debug.blobBytes
        );

  const result = {
    key: sc.key,
    label: sc.label,
    paths: sc.paths,
    strokes: sc.strokes.length,
    crayon: !!sc.crayon,
    debug,
    undoSteps: steps,
    draw: {
      ops: draw.count,
      totalMs: draw.total,
      // Sample count, not just cost: zero commits measured across a whole run
      // means the served bundle carries no engine.* marks at all, which the
      // gate has to tell apart from a genuinely fast commit (both read 0 ms).
      commitCount: commit.count,
      commitMs: commit.total,
      commitP95Ms,
      headroomRatio: commitP95Ms / COMMIT_GATE_MS,
      commitMaxMs: commit.max,
      commitDurationsMs: commit.durationsMs,
      snapshotMs: snapshot.total,
      snapshotMaxMs: snapshot.max,
      foldMs: fold.total,
      foldMaxMs: fold.max,
      encodeMs: encode.total,
      encodeMaxMs: encode.max,
      encodeInCommitMs: encodeInCommit.total,
      encodeInCommitMaxMs: encodeInCommit.max,
    },
    undo: {
      steps: undoM.count,
      totalMs: undoM.total,
      avgMs: undoM.count ? undoM.total / undoM.count : 0,
      maxMs: undoM.max,
    },
    heap: {
      afterDrawMB: heapAfterDraw ? toMiB(heapAfterDraw) : null,
      afterUndoMB: heapAfterUndo ? toMiB(heapAfterUndo) : null,
    },
    historyRasterMB,
    observers,
  };
  console.log(
    `  snapshots=${debug?.snapshots ?? 'n/a'} liveRasters=${debug?.liveRasters ?? 'n/a'} ` +
      `blobKB=${debug ? Math.round(debug.blobBytes / 1024) : 'n/a'} | ` +
      `commit p95 ${commitP95Ms.toFixed(1)}ms ` +
      `max ${commit.max.toFixed(1)}ms (copy ${snapshot.max.toFixed(1)} ` +
      `fold ${fold.max.toFixed(1)} encode ${encodeInCommit.max.toFixed(1)}; ` +
      `deferred encode ${encode.max.toFixed(1)}) | ` +
      `undo ${undoM.count} steps ` +
      `avg ${(undoM.count ? undoM.total / undoM.count : 0).toFixed(1)}ms max ${undoM.max.toFixed(1)}ms`
  );
  return result;
}

function buildUndoSettings({ throttle, build, geom, t0 }) {
  return {
    target: `web/dev-engine (${engine.label})`,
    engine: engineName,
    device: IPAD_PRO.label,
    viewport: IPAD_PRO,
    // WebKit exposes no CPU-throttling control, so a WebKit run is always
    // unthrottled regardless of --throttle (see the warning in runUndoScenarios).
    throttle: engine.hasCdp ? throttle.forSettings : 0,
    refreshHz: HZ,
    frameBudgetMs: FRAME_BUDGET_MS,
    longOps: LONG_OPS,
    buildMode: build ? 'production-preview' : 'production-preview (reused build)',
    captureMode: engine.hasCdp ? 'cdp-trace' : 'user-timing (no CDP on WebKit)',
    // Baked in rather than re-derived at render time, so the report stays a pure
    // function of the summary and regenerates identically from the JSON.
    fidelity: engine.fidelity({ frameBudgetMs: FRAME_BUDGET_MS }),
    raster: { ...geom, mbPerRaster: toMiB(geom.bytesPerRaster) },
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
  };
}

// Session frame health is the union of the per-scenario sampling windows, so
// the counts and spans add and the rate is recomputed over the combined span —
// carrying one scenario's fps forward would label it "whole session" in the
// report while describing a single scenario.
function aggregateObservers(results) {
  const longTasks = [];
  let count = 0;
  let durationMs = 0;
  let longFrames = 0;
  let heapBytes = null;
  for (const result of results) {
    if (!result.observers) continue;
    longTasks.push(...result.observers.longTasks);
    count += result.observers.frames.count;
    durationMs += result.observers.frames.durationMs;
    longFrames += result.observers.frames.longFrames;
    if (result.observers.heapBytes != null) heapBytes = result.observers.heapBytes;
  }
  return {
    longTasks,
    frames: {
      count,
      durationMs,
      fps: durationMs > 0 ? ((count - 1) / durationMs) * 1000 : null,
      longFrames,
    },
    heapBytes,
  };
}

export async function runUndoScenarios() {
  // /dev/engine is gated by PUBLIC_ENABLE_DEV_HARNESS ($env/dynamic/public, read
  // at runtime), so the preview server spawned by buildAndPreview must inherit it.
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  warnIfNoPerfMarks(engine.script);

  const suite = flag('suite', 'full');
  if (!['full', 'fast'].includes(suite)) {
    throw new Error(`--suite=${suite} is not known — expected full or fast`);
  }
  const only = flag('scenarios', '');
  if (suite === 'fast' && only) {
    throw new Error('--suite=fast cannot be combined with --scenarios');
  }
  const requestedKeys =
    suite === 'fast' ? FAST_UNDO_SCENARIO_KEYS : only ? only.split(',') : ALL_UNDO_SCENARIO_KEYS;
  const unknownKeys = requestedKeys.filter((key) => !ALL_UNDO_SCENARIO_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `--scenarios contains unknown key(s): ${unknownKeys.join(', ')}; expected ${ALL_UNDO_SCENARIO_KEYS.join(', ')}`
    );
  }

  const outDir = profilePath('undo-scenarios', engineName, throttle.tag);
  mkdirSync(outDir, { recursive: true });

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await engine.launcher.launch(engine.launchOptions());
  const t0 = Date.now();
  try {
    const ctx = await browser.newContext({
      viewport: { width: IPAD_PRO.width, height: IPAD_PRO.height },
      deviceScaleFactor: IPAD_PRO.deviceScaleFactor,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await resetEngine(page, base, IPAD_PRO.width, IPAD_PRO.height);

    // No CDP outside Chromium: no Chrome trace, no CPU throttle, no
    // performance.memory. The engine.* user-timing marks — the primary signal
    // here — come from the Performance API and survive, so a WebKit run gives
    // up the report.md trace sections and the JS-heap table, not the gates.
    const cdp = engine.hasCdp ? await ctx.newCDPSession(page) : null;
    if (throttle.active) {
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.rate });
      else
        console.warn(
          `! --throttle is Chromium-only (CDP Emulation) — the ${engineName} run is unthrottled.`
        );
    }

    await injectObservers(page);
    const geom = await rasterGeometry(page);
    const events = cdp ? await startTrace(cdp) : null;
    // --scenarios=key1,key2 runs a subset (fast iteration on one question).
    const scenarios = buildScenarios(IPAD_PRO.width, IPAD_PRO.height).filter((scenario) =>
      requestedKeys.includes(scenario.key)
    );
    const results = [];
    // Each scenario reloads /dev/engine, and a navigation wipes the Performance
    // API entries — so without CDP the measures have to be drained *per
    // scenario*, while that document is still current, and stitched. Reading
    // once at the end would silently describe the final scenario only.
    const timeline = cdp ? null : createMeasureTimeline();

    for (const sc of scenarios) {
      try {
        results.push(await runUndoScenario(page, base, sc, geom));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Skipping undo scenario ${sc.key}: ${message}`);
        results.push({
          key: sc.key,
          label: sc.label,
          strokes: sc.strokes.length,
          crayon: !!sc.crayon,
          skipped: true,
          error: message,
        });
      }
      if (timeline) {
        // A scenario that threw may still have produced measures worth keeping,
        // and one that left the page unusable must not sink the whole run's
        // artifacts on the way out.
        try {
          timeline.append(await collectMeasures(page));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Could not collect measures after ${sc.key}: ${message}`);
        }
      }
    }

    const obs = aggregateObservers(results);
    // Without CDP there is no Chrome trace to stop; the stitched user-timing
    // timeline is the minimal trace the shared analyzer needs instead.
    const traceEvents = cdp ? (await stopTrace(cdp), events) : timeline.events;

    // Standard trace artifacts (engine hot paths, frame health) via the shared
    // analyzer, plus the bespoke per-scenario undo summary.
    const settings = buildUndoSettings({ throttle, build, geom, t0 });
    await page.screenshot({ path: join(outDir, 'screenshot.png') }).catch(() => {});
    const metrics = buildMetrics({
      settings,
      obs,
      heapBefore: null,
      heapAfter: obs.heapBytes,
    });
    writeProfileArtifacts({
      outDir,
      traceEvents,
      metrics,
    });

    const gate = reportCommitGate(results, {
      normalizeSharedRunnerCrayon: suite === 'fast',
    });
    const fullRun =
      requestedKeys.length === ALL_UNDO_SCENARIO_KEYS.length &&
      ALL_UNDO_SCENARIO_KEYS.every((key) => requestedKeys.includes(key));
    const fastSetEvaluation =
      engine.gated && fullRun
        ? persistFastSetHistory({
            results,
            settings,
            outDir,
            historyPath: flag('fast-set-history', ''),
          })
        : null;
    const gateSummary = {
      ...gate,
      breaches: gate.breaches.map((scenario) => scenario.key),
    };
    const undoSummary = { settings, scenarios: results, gate: gateSummary, fastSetEvaluation };
    writeFileSync(join(outDir, 'undo-scenarios.json'), JSON.stringify(undoSummary, null, 2));
    const md = renderUndoReport(undoSummary);
    writeFileSync(join(outDir, 'undo-scenarios.md'), md);

    console.log(`\n${md}\n`);
    console.log(`Artifacts: ${outDir}`);
    return { ...gate, fastSetEvaluation };
  } finally {
    await browser.close();
    stop();
  }
}

function persistFastSetHistory({ results, settings, outDir, historyPath }) {
  const restored = readRestoredHistoryOrSeed(historyPath);
  let history = restored.history;
  const complete =
    results.length === ALL_UNDO_SCENARIO_KEYS.length &&
    results.every(
      (result) =>
        !result.skipped && result.draw?.commitCount > 0 && Number.isFinite(result.draw.commitP95Ms)
    );
  if (complete) {
    history = appendFullRun({
      history,
      results,
      startedAt: settings.startedAt,
      budgetMs: COMMIT_GATE_MS,
    });
  }

  const artifactPath = join(outDir, 'undo-fast-set-history.json');
  const json = `${JSON.stringify(history, null, 2)}\n`;
  writeFileSync(artifactPath, json);
  if (historyPath && restored.canUpdateHistoryPath) {
    mkdirSync(dirname(historyPath), { recursive: true });
    writeFileSync(historyPath, json);
  }

  if (!complete) {
    return {
      evaluated: false,
      reason:
        'The full run did not produce valid commit samples for every scenario, so its timings were not recorded.',
    };
  }

  const evaluation = { evaluated: true, ...evaluateFastSet(history) };
  if (evaluation.drifted) {
    process.exitCode = 1;
    console.error(
      `\n✗ Fast-set membership drifted: committed ${evaluation.committed.join(', ')}; ` +
        `ideal ${evaluation.ideal.join(', ')} from ${evaluation.historyWindowRuns} full run(s).`
    );
  } else {
    console.log(
      `✓ Fast-set membership matches ${evaluation.historyWindowRuns} full run(s): ` +
        evaluation.committed.join(', ')
    );
  }
  if (evaluation.consecutiveMisses >= 2) {
    process.exitCode = 1;
    console.error(
      `\n✗ The fast set missed ${evaluation.consecutiveMisses} consecutive full-run breaches; ` +
        `reselect it from the recorded headroom before the next release.`
    );
  }
  return evaluation;
}

function readRestoredHistoryOrSeed(historyPath) {
  if (historyPath && existsSync(historyPath)) {
    try {
      return { history: readFastSetHistory(historyPath), canUpdateHistoryPath: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Could not use restored fast-set history (${message}); falling back to the compatible seed.`
      );
    }
  }
  return {
    history: readFastSetHistory(FAST_SET_HISTORY_SEED_PATH),
    canUpdateHistoryPath: !historyPath || !existsSync(historyPath),
  };
}

// The commit gate, and why only WebKit gets it.
//
// ADR-0066 states the product gate as "commit max ≈ one 120 Hz frame" (8.3 ms),
// but that is a claim about an iPad and this is a desktop build. What a desktop
// run can still decide is a question of *shape*: does the stroke-end commit do
// work that scales with the whole raster, or only with the dirty rect the stroke
// touched? Those regimes are far enough apart to separate with a blunt
// threshold. Measured on this harness, both endpoints on the same machine:
//
//   healthy    commit max 1–8 ms   (8 ms = crayon-scribbles, all fold)
//   #635 shape commit max 47–56 ms (98% of it engine.encode, run to run)
//
// so the gate sits ~3× above the healthy worst case and ~2× below the cheapest
// observed regression. A shared runner can still suspend WebKit inside one
// measured commit, so the gate uses P95 to require the expensive shape to recur
// while preserving max and every raw duration for diagnosis. It is deliberately
// blunt: the point is to catch a full-raster operation reappearing on the
// pointerup path, not to police millisecond drift, which only the on-device run
// can honestly judge.
//
// Chromium is deliberately NOT gated. Its absolute milliseconds are unfaithful
// in both directions — SwiftShader exaggerates full-canvas blits, and its
// spec-compliant in-parallel toBlob reports almost nothing for an encode that
// costs WebKit its whole frame budget. Reverting the #635 fix and running both
// engines shows exactly that: WebKit reports a 47 ms commit with a 47 ms encode
// inside it, Chromium a 11.4 ms commit with a 2.5 ms encode. Gating Chromium on
// numbers it cannot measure would rebuild the false assurance that let #635 hide
// behind a passing profile for a year.
function formatCommitBreach(scenario, timing) {
  const gateTiming = timing.normalized
    ? `gate ${f1(timing.gateP95Ms)} ms after ${f1(timing.slowdownFactor)}× ` +
      `same-run renderer normalization (raw ${f1(timing.rawP95Ms)} ms · ` +
      `draw ${f1(timing.drawMsPerCall)} ms/call), `
    : `commit p95 ${f1(timing.rawP95Ms)} ms, `;
  return (
    `  ${scenario.key}: ${gateTiming}` +
    `max ${f1(scenario.draw.commitMaxMs)} ms ` +
    `(copy ${f1(scenario.draw.snapshotMaxMs)} · fold ${f1(scenario.draw.foldMaxMs)} · ` +
    `encode ${f1(scenario.draw.encodeInCommitMaxMs)}; deferred ${f1(scenario.draw.encodeMaxMs)})`
  );
}

function formatCompletedBreaches(breaches, timings) {
  return breaches.length > 0
    ? `\n  Completed scenario breaches:\n${breaches
        .map((scenario) => formatCommitBreach(scenario, timings.get(scenario.key)))
        .join('\n')}\n`
    : '\n';
}

function reportCommitGate(results, { normalizeSharedRunnerCrayon = false } = {}) {
  const budgetMs = COMMIT_GATE_MS;
  const { gated } = engine;
  const measured = results.filter((s) => !s.skipped);
  const skipped = results.filter((s) => s.skipped);
  const scenarioTimings = measured.map((scenario) =>
    evaluateCommitTiming(scenario, { normalizeSharedRunnerCrayon })
  );
  const timings = new Map(scenarioTimings.map((timing) => [timing.key, timing]));
  const breaches = gated ? measured.filter((scenario) => timings.get(scenario.key).breached) : [];

  if (!gated) {
    console.log(
      `Commit gate: not evaluated on ${engineName} — its absolute ms are advisory ` +
        `(see COMMIT_GATE_MS). Run \`${ENGINES.webkit.script}\` for the gated engine.`
    );
    return {
      engine: engineName,
      gated,
      budgetMs,
      percentile: COMMIT_GATE_PERCENTILE,
      breaches,
      scenarioTimings,
    };
  }

  if (skipped.length > 0) {
    process.exitCode = 1;
    console.error(
      `\n✗ Commit gate NOT EVALUATED on ${engineName}: ${skipped.length} requested ` +
        `scenario(s) did not complete.\n` +
        `  A gated run must measure every requested scenario; skipped coverage cannot pass.\n` +
        skipped.map((s) => `  ${s.key}: ${s.error}`).join('\n') +
        formatCompletedBreaches(breaches, timings)
    );
    return {
      engine: engineName,
      gated,
      budgetMs,
      percentile: COMMIT_GATE_PERCENTILE,
      breaches,
      scenarioTimings,
      evaluated: false,
      skipped: skipped.length,
    };
  }

  // Every measure absent reads exactly like a very fast commit — 0 ms, no
  // breach, green gate. That happens whenever the *served bundle* was built
  // without PERF_MARKS, which --no-build makes reachable since it reuses
  // whatever is on disk. warnIfNoPerfMarks cannot catch it: it reads this
  // process's env var, which the npm script always sets, not the build. Nor can
  // the encode-path warning below — blobBytes comes from getUndoDebug(), which
  // reports tiering whether or not the marks were compiled in. So check the
  // sample count, and fail rather than certify a run that measured nothing.
  if (measured.length === 0 || measured.every((s) => s.draw.commitCount === 0)) {
    process.exitCode = 1;
    console.error(
      `\n✗ Commit gate NOT EVALUATED on ${engineName}: no engine.commit samples in any of ` +
        `${measured.length} scenario(s).\n` +
        `  The served bundle carries no engine.* marks, so every duration reads 0 ms and a\n` +
        `  pass would mean nothing. Rebuild with marks — \`${engine.script}\` without\n` +
        `  --no-build — and re-run.\n`
    );
    return {
      engine: engineName,
      gated,
      budgetMs,
      percentile: COMMIT_GATE_PERCENTILE,
      breaches: [],
      scenarioTimings,
      evaluated: false,
    };
  }

  // The encode path only runs for a scenario whose patches exhaust the resident
  // byte budget (ADR-0082). Today that is multi-finger alone, so the gate's
  // cover for #635's defect class rests on one scenario producing blobs. If a
  // tiering change ever stops it, the run measured no coverage for that defect
  // class and cannot certify the commit path.
  const encoding = measured.filter((s) => (s.debug?.blobBytes ?? 0) > 0);
  if (encoding.length === 0) {
    process.exitCode = 1;
    console.error(
      `\n✗ Commit gate NOT EVALUATED on ${engineName}: no scenario demoted a patch to a ` +
        `blob, so this run did not exercise the encode path.\n` +
        `  The commit gate cannot see a #635-class regression. Check whether the resident byte\n` +
        `  budget (HOT_PATCH_BUDGET_PAPER_MULTIPLE) now covers every requested scenario.` +
        formatCompletedBreaches(breaches, timings)
    );
    return {
      engine: engineName,
      gated,
      budgetMs,
      percentile: COMMIT_GATE_PERCENTILE,
      breaches,
      scenarioTimings,
      encoding: 0,
      evaluated: false,
    };
  }

  const unevaluable = scenarioTimings.filter((timing) => !timing.evaluable);
  if (unevaluable.length > 0) {
    process.exitCode = 1;
    console.error(
      `\n✗ Commit gate NOT EVALUATED on ${engineName}: the same-run renderer control ` +
        `had no engine.draw samples for ${unevaluable.map((timing) => timing.key).join(', ')}.\n`
    );
    return {
      engine: engineName,
      gated,
      budgetMs,
      percentile: COMMIT_GATE_PERCENTILE,
      breaches,
      scenarioTimings,
      evaluated: false,
    };
  }

  if (breaches.length === 0) {
    console.log(
      `✓ Commit gate: every scenario's gate p95 is within ${budgetMs} ms on ${engineName} ` +
        `(${measured.length} measured, ${encoding.length} exercising the encode path).`
    );
    return {
      engine: engineName,
      gated,
      budgetMs,
      percentile: COMMIT_GATE_PERCENTILE,
      breaches,
      scenarioTimings,
      encoding: encoding.length,
    };
  }

  process.exitCode = 1;
  console.error(
    `\n✗ Commit gate FAILED on ${engineName}: ${breaches.length} scenario(s) had commit p95 ` +
      `above ${budgetMs} ms of synchronous stroke-end work.\n` +
      `  Repeated commits this hot are doing full-raster work on the pointerup path. ` +
      `The parts below\n` +
      `  all come from inside engine.commit and sum to it — an engine.encode among them is\n` +
      `  #635 recurring (the cold encode belongs off the commit, on scheduleIdle). The\n` +
      `  trailing "deferred" figure is the encode that ran off-commit, which is where it\n` +
      `  belongs: large there is healthy, and it is never the cause of a breach.\n`
  );
  for (const scenario of breaches) {
    console.error(formatCommitBreach(scenario, timings.get(scenario.key)));
  }
  return {
    engine: engineName,
    gated,
    budgetMs,
    percentile: COMMIT_GATE_PERCENTILE,
    breaches,
    scenarioTimings,
  };
}

function renderUndoReport({ settings, scenarios, gate, fastSetEvaluation }) {
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
      `stroke seconds) to mirror real input volume. ${settings.fidelity} ` +
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
  out.push(
    '| Scenario | Strokes | Status / reason | Snapshots | Live rasters | Blob bytes | Pending commands |'
  );
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(`| ${s.label} | ${s.strokes} | Skipped: ${s.error} | n/a | n/a | n/a | n/a |`);
      continue;
    }
    const blobKB = s.debug ? Math.round((s.debug.blobBytes ?? 0) / 1024) : 'n/a';
    out.push(
      `| ${s.label} | ${s.strokes} | Completed | ${s.debug?.snapshots ?? 'n/a'} | ` +
        `${s.debug?.liveRasters ?? 'n/a'} | ${blobKB} KB | ${s.debug?.pendingCommands ?? 'n/a'} |`
    );
  }
  out.push('\n## Drawing cost (engine.draw + the stroke-end pipeline)\n');
  out.push(
    'engine.commit wraps the whole stroke-end pipeline. **Gate P95** is the shared-runner ' +
      'verdict, while raw commit P95, commit max, and every JSON sample remain available for ' +
      'diagnosis. ' +
      'The three stage columns are measured in the same window and ' +
      'decompose it: engine.snapshot (the pre-stroke patch copy), engine.fold (rendering the ' +
      'committed ops), and engine.encode (demoting cold patches to blobs).\n'
  );
  if (gate.scenarioTimings.some((timing) => timing.normalized)) {
    out.push(
      'For the fast pull-request tier, crayon-scribbles divides raw commit P95 by the same-run ' +
        'crayon draw slowdown. This preserves the 25 ms work-shape contract when a shared host ' +
        'slows the renderer globally; a new commit-only regression still crosses the unchanged ' +
        'gate. Release and on-demand full runs use raw timing.\n'
    );
  }
  out.push(
    '**encode in commit** should be 0 — the cold encode is scheduled *off* the commit ' +
      '(scheduleIdle), so anything here landed back on the pointerup path, which is #635. ' +
      '**deferred encode** is that same pass measured where it does belong, over the wider ' +
      'draw+settle window; it is routinely far larger than the whole commit and that is ' +
      'healthy. The two are separate columns because they are separate windows — reading the ' +
      'deferred figure as part of the commit is how a fold regression gets blamed on the ' +
      'encode.\n'
  );
  out.push(
    '| Scenario | draw() calls | draw total | snapshot copy max | fold max | encode in commit max | commit p95 raw | **gate p95** | commit max | deferred encode max |'
  );
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(`| ${s.label} | n/a | n/a | n/a | n/a | n/a | n/a | **n/a** | n/a | n/a |`);
      continue;
    }
    const timing = gate.scenarioTimings.find((candidate) => candidate.key === s.key);
    const gateCell = timing.normalized
      ? `${f1(timing.gateP95Ms)} ms (${f1(timing.slowdownFactor)}× control)`
      : `${f1(timing.gateP95Ms)} ms`;
    out.push(
      `| ${s.label} | ${s.draw.ops} | ${f1(s.draw.totalMs)} ms | ` +
        `${f1(s.draw.snapshotMaxMs)} ms | ${f1(s.draw.foldMaxMs)} ms | ` +
        `${f1(s.draw.encodeInCommitMaxMs)} ms | ${f1(s.draw.commitP95Ms)} ms | ` +
        `**${gateCell}** | ` +
        `${f1(s.draw.commitMaxMs)} ms | ` +
        `${f1(s.draw.encodeMaxMs)} ms |`
    );
  }
  if (fastSetEvaluation) {
    out.push('\n## Fast-set drift\n');
    if (!fastSetEvaluation.evaluated) {
      out.push(`${fastSetEvaluation.reason}\n`);
    } else {
      out.push(
        `Committed: **${fastSetEvaluation.committed.join(', ')}** · ` +
          `ideal: **${fastSetEvaluation.ideal.join(', ')}** · ` +
          `mandatory sole exercisers: **${fastSetEvaluation.mandatory.join(', ')}** · ` +
          `history window: **${fastSetEvaluation.historyWindowRuns} full run(s)**.\n`
      );
      out.push(
        `Latest fast-set miss: **${fastSetEvaluation.latestMiss ? 'yes' : 'no'}** · ` +
          `consecutive misses: **${fastSetEvaluation.consecutiveMisses}**. ` +
          `The rolling record is in \`undo-fast-set-history.json\`.\n`
      );
    }
  }
  out.push('\n## Undo cost (engine.undo)\n');
  out.push('| Scenario | Undo steps | Total | Avg / step | Max step |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(`| ${s.label} | n/a | n/a | n/a | n/a |`);
      continue;
    }
    out.push(
      `| ${s.label} | ${s.undo.steps} | ${f1(s.undo.totalMs)} ms | ` +
        `${f1(s.undo.avgMs)} ms | ${f1(s.undo.maxMs)} ms |`
    );
  }
  out.push('\n## Frame health per scenario\n');
  out.push(
    'The rAF sampler is re-injected after each reload and drained before the next one, so these ' +
      'are the per-scenario windows that report.md sums into its session figures. They span the ' +
      "whole scenario, so the synchronous draw phase's harness artifact (see the note above) " +
      'dominates the long-frame count.\n'
  );
  out.push('| Scenario | Frames | Avg FPS | Long frames | Long tasks |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (!s.observers) {
      out.push(`| ${s.label} | n/a | n/a | n/a | n/a |`);
      continue;
    }
    out.push(
      `| ${s.label} | ${s.observers.frames.count} | ${f1(s.observers.frames.fps)} | ` +
        `${s.observers.frames.longFrames} | ${s.observers.longTasks.length} |`
    );
  }
  const r = settings.raster;
  out.push('\n## History raster memory (the real undo cost — off the JS heap)\n');
  out.push(
    `Each square raster is ${r?.side}×${r?.side} → **${f1(r?.mbPerRaster)} MiB**. ` +
      `Canvas backing stores are **not** counted by performance.memory, so the JS-heap ` +
      `table below stays flat regardless of history — the raster figure is the one that ` +
      `matters. Resident rasters = live snapshots + the paper, plus the encoded blob bytes.\n`
  );
  out.push('| Scenario | Rasters resident | Blob bytes | History memory |');
  out.push('| --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(`| ${s.label} | n/a | n/a | n/a |`);
      continue;
    }
    const rasters = s.debug == null ? 'n/a' : `${s.debug.liveRasters} + 1`;
    const blobKB = s.debug ? Math.round((s.debug.blobBytes ?? 0) / 1024) : 'n/a';
    out.push(`| ${s.label} | ${rasters} | ${blobKB} KB | ${f1(s.historyRasterMB)} MiB |`);
  }
  out.push('\n## JS heap (performance.memory — excludes canvas pixels; coarse, GC-dependent)\n');
  out.push('| Scenario | After draw (history resident) | After undo-to-empty |');
  out.push('| --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(`| ${s.label} | n/a | n/a |`);
      continue;
    }
    out.push(`| ${s.label} | ${f1(s.heap.afterDrawMB)} MiB | ${f1(s.heap.afterUndoMB)} MiB |`);
  }
  out.push('\n---\nSee the `profiling` skill and ADR-0066 for how to read these.\n');
  return out.join('\n');
}

if (isMain(import.meta.url)) runMain(runUndoScenarios);
