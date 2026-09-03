// Focused undo profile: drives the imperative engine through deliberately-
// shaped sessions and records, per scenario, how tiled history behaves
// (undo depth, patch rasters, retained commands, and folded base tiles), the
// cost of drawing vs. committing vs. undoing, and the raster memory footprint
// while history is resident. Built to watch the ADR-0085/0086 contracts.
//
//   npm run perf:web:undo                       (tablet viewport, 4× CPU throttle)
//   node tools/perf/web/run-undo-scenarios.mjs --no-throttle --no-build
//
// Unlike perf:web (which drives the real #drawingCanvas toddler session), this
// drives /dev/engine so it can read getUndoDebug() — the tiled-history
// internals — and place strokes with exact op counts. Synthetic PointerEvents
// don't coalesce, so one dispatched pointermove == one engine draw() == one
// recorded op — real 120 Hz input volume, deterministically.

import { chromium, webkit } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutablePath } from '../../lib/playwright.mjs';
import { fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { parsePerfArgs, requireNumberFlag } from '../lib/cli-args.mjs';
import { buildAndPreview } from '../lib/profile-preview.mjs';
import {
  startTrace,
  stopTrace,
  collectMeasures,
  createMeasureTimeline,
  injectObservers,
  readObservers,
  heapBytes,
  markPhase,
} from '../lib/chrome-trace-capture.mjs';
import { IPAD_PRO } from '../lib/profile-devices.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { buildMetrics, writeProfileArtifacts } from '../lib/profile-artifacts.mjs';
import { percentile } from '../lib/real-screen-stats.mjs';
import {
  ALL_UNDO_SCENARIO_KEYS,
  FAST_UNDO_SCENARIO_KEYS,
  UNDO_SCENARIO_KEYS,
  UNDO_SCENARIO_PATHS,
} from '../lib/undo-scenario-keys.mjs';
import { appendFullRun, evaluateFastSet, readFastSetHistory } from '../lib/undo-fast-set.mjs';
import { toMiB } from '../lib/performance-units.mjs';
import {
  COMMIT_GATE_MS,
  COMMIT_GATE_PERCENTILE,
  confirmedBreach,
  evaluateCommitTiming,
} from '../lib/undo-commit-gate.mjs';
import { warnIfNoPerfMarks } from '../lib/profile-warnings.mjs';

const entry = isMain(import.meta.url);

// The deployment target we actually worry about: a 12.9" iPad Pro in portrait —
// 1024×1366 CSS pt. iPads report devicePixelRatio 2 and the engine caps
// renderScale at min(dpr, 2) = 2, so the backing store is 2048×2732 and the
// patch and base-raster bytes come directly from getUndoDebug(), because tiled
// history does not retain one full-paper square per undo entry.
const { flag, throttle, port, build } = parsePerfArgs({
  throttleDefault: 4,
  extra: [
    'history-settle-timeout-ms',
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
  entry,
});
const HISTORY_SETTLE_TIMEOUT_MS = requireNumberFlag(
  'history-settle-timeout-ms',
  flag('history-settle-timeout-ms', '10000'),
  entry
);
const FAST_SET_HISTORY_SEED_PATH = fileURLToPath(
  new URL('../fixtures/undo-fast-set-history.seed.json', import.meta.url)
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
    script: 'npm run perf:web:undo',
    label: 'headless Chromium (Blink/V8) — not WebKit/JavaScriptCore or the iPad GPU',
    fidelity: ({ frameBudgetMs }) =>
      `Headless Chromium (Blink/V8) is **not** WebKit/JavaScriptCore or the iPad GPU — ` +
      `SwiftShader software rendering exaggerates canvas copies and restores. ` +
      `CPU throttle models a slow CPU, not the tighter ${f1(frameBudgetMs)} ms ProMotion frame.`,
  },
  webkit: {
    launcher: webkit,
    launchOptions: () => ({ headless: true }),
    hasCdp: false,
    gated: true,
    script: 'npm run perf:web:undo:webkit',
    label: "Playwright WebKit (WebKit/JavaScriptCore) — the iOS app's engine family, desktop build",
    fidelity: () =>
      `Playwright's WebKit is the engine family the iOS app ships (WebKit/JavaScriptCore), ` +
      `so its tiled-canvas behavior is a closer signal than Chromium. It is still a desktop ` +
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
const HZ = requireNumberFlag('hz', flag('hz', '120'), entry);
// One frame at the target refresh — 8.3 ms on a 120 Hz ProMotion iPad. ADR-0066
// states the commit gate in these terms ("commit max ≈ one 120 Hz frame").
const FRAME_BUDGET_MS = 1000 / HZ;
const LONG_SECONDS = requireNumberFlag('long-seconds', flag('long-seconds', '10'), entry);
const LONG_OPS = requireNumberFlag(
  'long-ops',
  flag('long-ops', String(Math.round(HZ * LONG_SECONDS))),
  entry
); // ≈1200
// A multi-finger gesture is a SINGLE undo unit accumulating every finger's ops.
// 5 fingers × a ~4 s drag at 120 Hz ≈ this many ops in one command — the
// heaviest single commit fold.
const MULTI_FINGERS = 5;
const MULTI_SECONDS = requireNumberFlag('multi-seconds', flag('multi-seconds', '4'), entry);
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
const STROKES = requireNumberFlag('strokes', flag('strokes', String(MAX_UNDO_DEPTH + 2)), entry);

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
  await page.waitForSelector('#drawingCanvas');
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
// size), counting the steps actually performed. Restores settle asynchronously,
// so each step waits for its engine.undo measure to land before firing the next.
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

// Tiled history may finish progressive patch capture or fold old commands into
// base tiles after the batched draw phase returns. The harness needs a quiescent
// reading, not a policy-specific shape, so it polls the complete debug contract
// until consecutive samples agree.
const SETTLE_POLL_MS = 100;
const SETTLE_STABLE_SAMPLES = 4;
async function settleHistory(page, timeoutMs = 10_000) {
  const t0 = Date.now();
  const sameHistory = (a, b) =>
    a != null &&
    a.snapshots === b.snapshots &&
    a.liveRasters === b.liveRasters &&
    a.rasterBytes === b.rasterBytes &&
    a.baseRasters === b.baseRasters &&
    a.baseRasterBytes === b.baseRasterBytes &&
    a.historyLength === b.historyLength &&
    a.pendingCommands === b.pendingCommands;
  let prev = null;
  let stable = 0;
  let samples = 0;
  for (;;) {
    const d = await undoDebug(page);
    if (d == null) return null;
    samples++;
    stable = sameHistory(prev, d) ? stable + 1 : 0;
    if (stable >= SETTLE_STABLE_SAMPLES - 1) return d;
    // The wall clock alone cannot expire this wait, because on a saturated main
    // thread the polls themselves are what spend it: each getUndoDebug() round
    // trip queues behind the work being waited on, so a slow host can burn the
    // whole budget on two or three reads and time out on a history nothing was
    // still changing. Observed on the 2026-09-02 main gate, where every counter
    // the timeout text reported matched the settled reading a second runner
    // took for the same commit — consistent with undersampling, though the text
    // omitted pendingCommands and kept no earlier sample, which is why this
    // message now reports both. Quiescence is only visible
    // once SETTLE_STABLE_SAMPLES readings exist, so until that many have been
    // taken there is nothing for a timeout to have been long enough for.
    if (samples >= SETTLE_STABLE_SAMPLES && Date.now() - t0 > timeoutMs) {
      throw new Error(
        `history never settled within ${timeoutMs} ms: undoEntries=${d.snapshots} ` +
          `livePatchEntries=${d.liveRasters} patchBytes=${d.rasterBytes} ` +
          `baseTiles=${d.baseRasters} baseRasterBytes=${d.baseRasterBytes} ` +
          `historyCommands=${d.historyLength} pendingCommands=${d.pendingCommands} ` +
          `(want ${SETTLE_STABLE_SAMPLES} consecutive identical samples; ` +
          `took ${samples} in ${Date.now() - t0} ms)`
      );
    }
    prev = d;
    await sleep(SETTLE_POLL_MS);
  }
}

export async function runUndoScenario(
  page,
  base,
  sc,
  historySettleTimeoutMs = HISTORY_SETTLE_TIMEOUT_MS
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

  const debug = await settleHistory(page, historySettleTimeoutMs);
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
  const undoMarks = await engineMeasuresIn(page, undoStart, undoEnd);

  const draw = drawMarks['engine.draw'] || { count: 0, total: 0, max: 0 };
  const commit = drawMarks['engine.commit'] || { count: 0, total: 0, max: 0, durationsMs: [] };
  const undoM = undoMarks['engine.undo'] || { count: 0, total: 0, max: 0 };
  const commitP95Ms = percentile(commit.durationsMs, COMMIT_GATE_PERCENTILE) ?? 0;

  const historyRasterMB =
    debug == null ? null : toMiB((debug.rasterBytes ?? 0) + (debug.baseRasterBytes ?? 0));

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
    `  undoEntries=${debug?.snapshots ?? 'n/a'} ` +
      `livePatchEntries=${debug?.liveRasters ?? 'n/a'} ` +
      `historyCommands=${debug?.historyLength ?? 'n/a'} ` +
      `baseTiles=${debug?.baseRasters ?? 'n/a'} ` +
      `patchMB=${debug ? f1(toMiB(debug.rasterBytes ?? 0)) : 'n/a'} ` +
      `baseMB=${debug ? f1(toMiB(debug.baseRasterBytes ?? 0)) : 'n/a'} | ` +
      `commit p95 ${commitP95Ms.toFixed(1)}ms max ${commit.max.toFixed(1)}ms | ` +
      `undo ${undoM.count} steps ` +
      `avg ${(undoM.count ? undoM.total / undoM.count : 0).toFixed(1)}ms max ${undoM.max.toFixed(1)}ms`
  );
  return result;
}

function buildUndoSettings({ throttle, build, t0 }) {
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
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
  };
}

// The scenario sets a run can ask for by name. `full` is deliberately absent:
// it is the default, and the only suite a diagnostic --scenarios subset may
// stand in for.
const NAMED_SUITE_KEYS = {
  fast: FAST_UNDO_SCENARIO_KEYS,
};

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
  // Each scenario reloads, so its frame samples are an independent rAF window
  // contributing count - 1 intervals. Summing the counts and subtracting one
  // would price the gaps between windows as frames and inflate the fps.
  let intervals = 0;
  for (const result of results) {
    if (!result.observers) continue;
    longTasks.push(...result.observers.longTasks);
    count += result.observers.frames.count;
    intervals += Math.max(result.observers.frames.count - 1, 0);
    durationMs += result.observers.frames.durationMs;
    longFrames += result.observers.frames.longFrames;
    if (result.observers.heapBytes != null) heapBytes = result.observers.heapBytes;
  }
  return {
    longTasks,
    frames: {
      count,
      durationMs,
      fps: durationMs > 0 ? (intervals / durationMs) * 1000 : null,
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
  const suiteKeys = NAMED_SUITE_KEYS[suite];
  if (suite !== 'full' && !suiteKeys) {
    throw new Error(
      `--suite=${suite} is not known — expected full, ${Object.keys(NAMED_SUITE_KEYS).join(', or ')}`
    );
  }
  const only = flag('scenarios', '');
  if (suiteKeys && only) {
    throw new Error(`--suite=${suite} cannot be combined with --scenarios`);
  }
  const requestedKeys = suiteKeys ?? (only ? only.split(',') : ALL_UNDO_SCENARIO_KEYS);
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
        results.push(await runUndoScenario(page, base, sc));
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
    const settings = buildUndoSettings({ throttle, build, t0 });
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

    // A first-pass breach is re-measured before it is believed. The gate's
    // percentile over ~21 commit samples resolves to the second-highest sample, so
    // two adjacent slow commits set it — which is what a scheduling stall on a
    // shared runner produces, and it does not reproduce. Re-running costs one
    // scenario and only happens on the path that would otherwise turn main red.
    const confirmations = await confirmBreaches({
      page,
      base,
      results,
      scenarios,
      timeline,
      normalizeSharedRunnerCrayon: suite === 'fast',
      enforcesCoverage: engine.gated,
    });
    const gate = reportCommitGate(results, {
      normalizeSharedRunnerCrayon: suite === 'fast',
      enforcesCoverage: engine.gated,
      confirmations,
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
    // The confirmation passes are recorded whole, not just as the timings the gate
    // scored. A confirmed breach is the claim that expensive stroke-end work
    // reproduced, and the evidence for or against it is the sample distribution —
    // two isolated spikes in an otherwise 0 ms run read very differently from a
    // distribution that shifted. `confirmationTimings` carries the verdict; this
    // carries what the verdict was reached from.
    const undoSummary = {
      settings,
      scenarios: results,
      confirmations: [...confirmations.values()],
      gate: gateSummary,
      fastSetEvaluation,
    };
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

// The desktop WebKit gate uses a deliberately blunt P95 threshold to detect
// recurring catastrophic stroke-end work. It is not a physical-iPad frame gate;
// the device-calibrated verdict remains in ADR-0090. Chromium stays advisory
// because its software canvas path cannot supply comparable absolute timings.
function formatCommitBreach(scenario, timing) {
  const host =
    timing.hostSlowdown === null ? '' : ` · host ${f1(timing.hostSlowdown)}× the reference run`;
  const gateTiming = `commit p95 ${f1(timing.rawP95Ms)} ms${host}, `;
  return `  ${scenario.key}: ${gateTiming}max ${f1(scenario.draw.commitMaxMs)} ms`;
}

function formatCompletedBreaches(breaches, timings) {
  return breaches.length > 0
    ? `\n  Completed scenario breaches:\n${breaches
        .map((scenario) => formatCommitBreach(scenario, timings.get(scenario.key)))
        .join('\n')}\n`
    : '\n';
}

// Every absent measure reads like a very fast commit. This can happen when
// --no-build reuses a bundle built without PERF_MARKS, so sample count is a
// coverage assertion rather than a timing value.
function reportMissingCommitSamples(measured) {
  if (measured.length > 0 && measured.some((scenario) => scenario.draw.commitCount > 0))
    return null;
  process.exitCode = 1;
  console.error(
    `\n✗ Commit gate NOT EVALUATED on ${engineName}: no engine.commit samples in any of ` +
      `${measured.length} scenario(s).\n` +
      `  The served bundle carries no engine.* marks, so every duration reads 0 ms and a\n` +
      `  pass would mean nothing. Rebuild with marks — \`${engine.script}\` without\n` +
      `  --no-build — and re-run.\n`
  );
  return { breaches: [], evaluated: false };
}

// Re-measures every scenario whose first pass breached, and returns the second
// timing per key. Only the breaching scenarios are re-run: a green suite costs
// nothing, and a red one costs one extra scenario per breach.
//
// The re-run goes through the same `runUndoScenario` the first pass used, on the
// same page and the same build, so the two measurements differ in nothing except
// when they were taken — which is the whole question being asked.
async function confirmBreaches({
  page,
  base,
  results,
  scenarios,
  timeline,
  normalizeSharedRunnerCrayon,
  enforcesCoverage,
}) {
  if (!enforcesCoverage) return new Map();
  const suspects = results.filter(
    (result) =>
      !result.skipped && evaluateCommitTiming(result, { normalizeSharedRunnerCrayon }).breached
  );
  const confirmations = new Map();
  for (const suspect of suspects) {
    const scenario = scenarios.find((candidate) => candidate.key === suspect.key);
    if (!scenario) continue;
    console.log(`Re-measuring ${suspect.key}: its first pass breached, confirming before failing.`);
    try {
      const second = await runUndoScenario(page, base, scenario);
      confirmations.set(suspect.key, second);
    } catch (error) {
      // A re-run that could not complete is not a confirmation and not an
      // acquittal. Left absent, so the gate reports the scenario unconfirmed
      // rather than quietly passing it.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not re-measure ${suspect.key}: ${message}`);
    }
    if (timeline) {
      try {
        timeline.append(await collectMeasures(page));
      } catch (error) {
        // The stitched timeline is diagnostic; a failed drain must not sink the
        // run — but a silent one reads as a timeline with no re-measure data
        // (issue 1296), so it says what it dropped like its sibling above.
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Could not collect re-measure timeline for ${suspect.key}: ${message}`);
      }
    }
  }
  return confirmations;
}

function reportCommitGate(
  results,
  {
    normalizeSharedRunnerCrayon = false,
    enforcesCoverage = engine.gated,
    confirmations = new Map(),
  } = {}
) {
  const budgetMs = COMMIT_GATE_MS;
  const { gated } = engine;
  const measured = results.filter((s) => !s.skipped);
  const skipped = results.filter((s) => s.skipped);
  const scenarioTimings = measured.map((scenario) =>
    evaluateCommitTiming(scenario, { normalizeSharedRunnerCrayon })
  );
  const timings = new Map(scenarioTimings.map((timing) => [timing.key, timing]));
  // A scenario fails only when every measurement of it breached. One breach out of
  // two is the shared runner; two out of two is the work.
  const confirmedTimings = new Map(
    [...confirmations].map(([key, second]) => [
      key,
      evaluateCommitTiming(second, { normalizeSharedRunnerCrayon }),
    ])
  );
  // A first-pass breach fails the job unless a SECOND measurement was taken and came
  // back clean. A confirmation that could not be scored acquits nothing.
  const dispositions = new Map(
    measured
      .filter((scenario) => timings.get(scenario.key).breached)
      .map((scenario) => {
        const first = timings.get(scenario.key);
        const second = confirmedTimings.get(scenario.key);
        return [scenario.key, second ? confirmedBreach([first, second]) : 'unconfirmed'];
      })
  );
  const breaches = gated
    ? measured.filter(
        (scenario) =>
          dispositions.get(scenario.key) !== 'acquitted' && dispositions.has(scenario.key)
      )
    : [];
  const acquitted = gated
    ? measured.filter((scenario) => dispositions.get(scenario.key) === 'acquitted')
    : [];
  // EVERY return spreads this rather than rebuilding it. Two paths used to
  // hand-assemble a smaller object — the unevaluable one and the final red-breach
  // one — which are exactly the paths where the disposition is worth reading: a run
  // exited red while `undo-scenarios.json` could not say whether the confirmation
  // breached or could not be scored.
  const base = {
    engine: engineName,
    gated,
    budgetMs,
    percentile: COMMIT_GATE_PERCENTILE,
    breaches,
    scenarioTimings,
    confirmationTimings: [...confirmedTimings.values()],
    breachDispositions: Object.fromEntries(dispositions),
  };
  for (const scenario of acquitted) {
    const first = timings.get(scenario.key);
    const second = confirmedTimings.get(scenario.key);
    console.log(
      `Commit gate: ${scenario.key} breached once and not again — ` +
        `${first.gateP95Ms.toFixed(1)} ms then ${second.gateP95Ms.toFixed(1)} ms against ` +
        `${budgetMs} ms. Reported, not failed.`
    );
  }
  for (const scenario of breaches) {
    if (dispositions.get(scenario.key) !== 'unconfirmed') continue;
    console.error(
      `Commit gate: ${scenario.key} breached and its confirmation could not be scored. ` +
        'Kept as a breach — an unscoreable second measurement acquits nothing.'
    );
  }

  // Ordered most-specific-cause-first, so a run that never completed a scenario
  // is not reported as a marks-less bundle.
  if (enforcesCoverage && skipped.length > 0) {
    process.exitCode = 1;
    console.error(
      `\n✗ Commit gate NOT EVALUATED on ${engineName}: ${skipped.length} requested ` +
        `scenario(s) did not complete.\n` +
        `  A gated run must measure every requested scenario; skipped coverage cannot pass.\n` +
        skipped.map((s) => `  ${s.key}: ${s.error}`).join('\n') +
        formatCompletedBreaches(breaches, timings)
    );
    return { ...base, evaluated: false, skipped: skipped.length };
  }

  const vacuous = reportMissingCommitSamples(measured);
  if (vacuous) return { ...base, ...vacuous };

  if (!enforcesCoverage) {
    console.log(
      `Commit gate: timing not evaluated on ${engineName} — its absolute ms are advisory ` +
        `(see COMMIT_GATE_MS). Run \`${ENGINES.webkit.script}\` for the gated engine.`
    );
    return base;
  }

  // Unreachable while normalization is off: `commitP95Ms` falls back to 0 rather
  // than to undefined, so `evaluable` is currently always true and a run with no
  // samples is caught by `reportMissingCommitSamples` above instead. The branch is
  // kept because `NORMALIZATION_ENABLED` makes a timing unevaluable again the moment
  // the divisor returns (ADR-0140) — so it is a guard for a switch, not a path any
  // test drives today.
  const unevaluable = scenarioTimings.filter((timing) => !timing.evaluable);
  if (unevaluable.length > 0) {
    process.exitCode = 1;
    console.error(
      `\n✗ Commit gate NOT EVALUATED on ${engineName}: no commit p95 for ` +
        `${unevaluable.map((timing) => timing.key).join(', ')}.\n`
    );
    return { ...base, evaluated: false };
  }

  if (breaches.length === 0) {
    console.log(
      `✓ Commit gate: every scenario's gate p95 is within ${budgetMs} ms on ${engineName} ` +
        `(${measured.length} measured).`
    );
    return base;
  }

  process.exitCode = 1;
  console.error(
    `\n✗ Commit gate FAILED on ${engineName}: ${breaches.length} scenario(s) had commit p95 ` +
      `above ${budgetMs} ms of synchronous stroke-end work.\n` +
      `  Repeated commits this hot suggest unbounded or full-surface stroke-end work. ` +
      `Inspect the engine.commit trace and tiled patch work.\n`
  );
  for (const scenario of breaches) {
    console.error(formatCommitBreach(scenario, timings.get(scenario.key)));
  }
  return base;
}

function renderUndoReport({ settings, scenarios, gate, fastSetEvaluation }) {
  const out = [];
  out.push('# Undo scenario profile (tiled history, ADR-0085/ADR-0086)\n');
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
      `Absolute ms want the on-device run (\`tools/perf/probes/engine-gates.js\` / the ` +
      `\`profiling\` skill); this run is for stack behavior, op-volume scaling, and relative cost.\n`
  );
  out.push(
    `> Note: strokes are dispatched synchronously (to land exact op counts), so the ` +
      `draw phase is one big task — its FPS/long-task numbers in report.md are a harness ` +
      `artifact. The clean live-draw signal is **engine.draw avg** (per pointermove); the ` +
      `commit and undo costs below don't depend on pacing.\n`
  );
  out.push('## Tiled history after drawing (getUndoDebug)\n');
  out.push(
    '| Scenario | Strokes | Status / reason | Undo entries | Live patch entries | Retained commands | Base tiles | Patch MiB | Base MiB | Pending commands |'
  );
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(
        `| ${s.label} | ${s.strokes} | Skipped: ${s.error} | n/a | n/a | n/a | n/a | n/a | n/a | n/a |`
      );
      continue;
    }
    out.push(
      `| ${s.label} | ${s.strokes} | Completed | ${s.debug?.snapshots ?? 'n/a'} | ` +
        `${s.debug?.liveRasters ?? 'n/a'} | ${s.debug?.historyLength ?? 'n/a'} | ` +
        `${s.debug?.baseRasters ?? 'n/a'} | ${f1(toMiB(s.debug?.rasterBytes ?? 0))} | ` +
        `${f1(toMiB(s.debug?.baseRasterBytes ?? 0))} | ${s.debug?.pendingCommands ?? 'n/a'} |`
    );
  }
  out.push('\n## Drawing cost (engine.draw + engine.commit)\n');
  out.push(
    '**Gate P95** is the shared-runner verdict. Raw commit P95, commit max, and every JSON ' +
      'sample remain available for diagnosis.\n'
  );
  if (gate.scenarioTimings.some((timing) => timing.normalized)) {
    out.push(
      'For the post-merge fast tier, crayon-scribbles divides raw commit P95 by the same-run ' +
        'crayon draw slowdown. This preserves the 25 ms work-shape contract when a shared host ' +
        'slows the renderer globally; a new commit-only regression still crosses the unchanged ' +
        'gate. Release and on-demand full runs use raw timing.\n'
    );
  }
  out.push('| Scenario | draw() calls | draw total | commit p95 raw | **gate p95** | commit max |');
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(`| ${s.label} | n/a | n/a | n/a | **n/a** | n/a |`);
      continue;
    }
    const timing = gate.scenarioTimings.find((candidate) => candidate.key === s.key);
    const gateCell = timing.normalized
      ? `${f1(timing.gateP95Ms)} ms (${f1(timing.slowdownFactor)}× control)`
      : `${f1(timing.gateP95Ms)} ms`;
    out.push(
      `| ${s.label} | ${s.draw.ops} | ${f1(s.draw.totalMs)} ms | ` +
        `${f1(s.draw.commitP95Ms)} ms | **${gateCell}** | ${f1(s.draw.commitMaxMs)} ms |`
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
  out.push('\n## History raster memory (the real undo cost — off the JS heap)\n');
  out.push(
    'Canvas backing stores are **not** counted by performance.memory. Tiled history reports ' +
      'its live patch and folded-base bytes directly, so their sum is the resident history cost.\n'
  );
  out.push('| Scenario | Patch MiB | Base MiB | History memory |');
  out.push('| --- | --- | --- | --- |');
  for (const s of scenarios) {
    if (s.skipped) {
      out.push(`| ${s.label} | n/a | n/a | n/a |`);
      continue;
    }
    out.push(
      `| ${s.label} | ${f1(toMiB(s.debug?.rasterBytes ?? 0))} | ` +
        `${f1(toMiB(s.debug?.baseRasterBytes ?? 0))} | ${f1(s.historyRasterMB)} MiB |`
    );
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
  out.push('\n---\nSee the `profiling` skill and ADR-0085/ADR-0086 for how to read these.\n');
  return out.join('\n');
}

if (isMain(import.meta.url)) runMain(runUndoScenarios);
