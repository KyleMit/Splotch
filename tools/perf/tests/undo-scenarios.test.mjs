import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  browser: null,
  outDir: '',
  stop: null,
  launched: [],
  collectMeasures: () => [],
  readObservers: () => ({
    longTasks: [],
    frames: { count: 0, durationMs: 0, fps: null, longFrames: 0 },
    heapBytes: 0,
  }),
}));

// Both engines resolve to the same fake browser; `launched` records which
// launcher the run reached for, since that is the seam --engine selects.
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: (...args) => {
      state.launched.push('chromium');
      return state.browser.launch(...args);
    },
  },
  webkit: {
    launch: (...args) => {
      state.launched.push('webkit');
      return state.browser.launch(...args);
    },
  },
}));

vi.mock('../lib/profile-preview.mjs', () => ({
  buildAndPreview: async () => ({ base: 'http://profile.test/', stop: state.stop }),
}));

// createMeasureTimeline stays real — it is the thing under test for the
// multi-scenario WebKit trace, and stubbing it would test the stub.
vi.mock('../lib/chrome-trace-capture.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    startTrace: async () => [],
    stopTrace: async () => {},
    collectMeasures: async () => state.collectMeasures(),
    createMeasureTimeline: actual.createMeasureTimeline,
    injectObservers: async () => {},
    readObservers: async () => state.readObservers(),
    heapBytes: async () => 0,
    markPhase: async (_page, _label, work) => work(),
  };
});

vi.mock('../lib/profile-paths.mjs', () => ({ profilePath: () => state.outDir }));

vi.mock('../../lib/playwright.mjs', () => ({ chromiumExecutablePath: () => undefined }));

vi.mock('../../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sleep: async () => {} };
});

// Per-scenario observer readings scale with the scenario index, so a sum is
// distinguishable from any single scenario's figure.
const FRAMES_PER_SCENARIO = 10;
const FRAME_SPAN_MS_PER_SCENARIO = 100;
const HEAP_BYTES_PER_SCENARIO = 1000;

// A throwing page.evaluate cannot fail a test on its own: runUndoScenarios
// catches whatever a scenario throws and downgrades it to skipped + a warn, so
// a test asserting only on the scenarios it does care about stays green through
// the miss. Every unmatched source is recorded here and asserted after the test
// body, out of reach of the harness's catch.
const unmatchedEvaluateSources = [];

let fixtureDir;
let originalArgv;
let originalExitCode;

beforeEach(() => {
  unmatchedEvaluateSources.length = 0;
  fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-undo-scenarios-'));
  state.outDir = fixtureDir;
  state.stop = vi.fn();
  state.launched = [];
  // Each scenario's document reports its own timeline starting at 0 — which is
  // exactly why the harness has to offset them as it stitches.
  let collected = 0;
  state.collectMeasures = () => {
    collected++;
    return [
      { cat: 'blink.user_timing', name: `engine.scenario${collected}`, ph: 'X', ts: 0, dur: 1000 },
    ];
  };
  // The frame sampler is drained once per scenario, so every reading describes
  // a different window — the aggregation has nothing to prove otherwise.
  let observed = 0;
  state.readObservers = () => {
    observed++;
    return {
      longTasks: [{ start: 0, duration: 50 * observed }],
      frames: {
        count: FRAMES_PER_SCENARIO * observed,
        durationMs: FRAME_SPAN_MS_PER_SCENARIO * observed,
        fps: 60,
        longFrames: observed,
      },
      heapBytes: HEAP_BYTES_PER_SCENARIO * observed,
    };
  };
  originalArgv = process.argv;
  // The gate signals a breach through process.exitCode, which would otherwise
  // outlive the test and fail the whole vitest run.
  originalExitCode = process.exitCode;
  // Enough budget for quiescent history to produce its consecutive identical
  // samples (Date.now is mocked to tick once per call, sleep is a no-op), while
  // still expiring for the scenario whose history never stops changing.
  process.argv = [...process.argv, '--history-settle-timeout-ms=20'];
  // The entry module reads argv at module scope, so each test needs its own
  // evaluation rather than the first test's flags.
  vi.resetModules();
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  rmSync(fixtureDir, { recursive: true, force: true });
  expect(unmatchedEvaluateSources).toEqual([]);
});

// A clock that advances one tick per read, so the harness's phase boundaries
// are distinguishable and a measure query can be attributed to its window.
const mockTickingClock = () =>
  (
    (tick) => () =>
      tick++
  )(0);

const REALISTIC_COMMIT_SAMPLE_COUNT = 22;
const SETTLED_LIVE_RASTERS = 2;

// page.evaluate routed by a marker string in the evaluated function's source,
// first match wins. An unmatched call throws instead of resolving undefined,
// which the harness would otherwise read as a genuine empty reading — and is
// recorded for the afterEach assertion, which the throw cannot substitute for.
function stubPageEvaluate(routes) {
  return vi.fn(async (fn, ...args) => {
    const source = fn.toString();
    const route = routes.find(({ marker }) => source.includes(marker));
    if (!route) {
      unmatchedEvaluateSources.push(source);
      throw new Error(`Unmatched page.evaluate:\n${source}`);
    }
    return route.result(...args);
  });
}

// A page whose engine.* measures are dictated by the caller, so a test can put
// the run on either side of the commit gate without driving a real browser.
//
function fakePage({
  commitMaxMs = 1,
  commitCount = REALISTIC_COMMIT_SAMPLE_COUNT,
  commitDurationsMs = null,
  // Only the churning history's reading, so a skip message quoting it can have
  // come from no scenario but the one that timed out.
  churningRasterBytes = 4096,
  historyNeverSettles = false,
  historyNeverSettlesOnNavigation = null,
} = {}) {
  const commitSamples = commitDurationsMs ?? Array.from({ length: commitCount }, () => commitMaxMs);
  const now = mockTickingClock();
  let historyRead = 0;
  let navigations = 0;
  const historyIsChurning = () =>
    historyNeverSettles || navigations === historyNeverSettlesOnNavigation;
  return {
    goto: vi.fn(async () => {
      navigations++;
    }),
    waitForSelector: vi.fn(async () => {}),
    waitForFunction: vi.fn(async () => {}),
    evaluate: stubPageEvaluate([
      {
        marker: 'getUndoDebug',
        result: () => {
          const churning = historyIsChurning();
          return {
            snapshots: 22,
            liveRasters: SETTLED_LIVE_RASTERS,
            rasterBytes: churning ? churningRasterBytes + historyRead++ : 4096,
            blobBytes: 0,
            baseRasters: 4,
            baseRasterBytes: 8192,
            historyLength: 22,
            pendingCommands: 0,
          };
        },
      },
      {
        marker: "getEntriesByType('measure')",
        result: () => {
          return {
            'engine.draw': { count: 1, total: 1, max: 1 },
            'engine.commit': {
              count: commitSamples.length,
              total: commitSamples.reduce((total, duration) => total + duration, 0),
              max: Math.max(0, ...commitSamples),
              durationsMs: commitSamples,
            },
            'engine.undo': { count: 1, total: 1, max: 1 },
          };
        },
      },
      // undoAll()'s source carries both this marker and 'performance.now', so it
      // has to be matched here or it would be served the clock instead.
      { marker: 'async (maxUndoSteps)', result: () => 1 },
      {
        marker: 'performance.now',
        result: () => {
          return now();
        },
      },
      { marker: 'resizeTo', result: () => {} },
    ]),
    screenshot: vi.fn(async () => {}),
  };
}

function fakeBrowser(page, { withCdp = true } = {}) {
  const context = {
    newPage: vi.fn(async () => page),
    newCDPSession: withCdp ? vi.fn(async () => ({ send: vi.fn(async () => {}) })) : undefined,
  };
  const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => {}) };
  state.browser = { launch: vi.fn(async () => browser) };
  return { browser, context };
}

describe('undo scenario profiling', () => {
  it('writes artifacts and continues after a history-settle timeout', async () => {
    // One scenario's patch bytes keep moving, so the settle
    // poll never sees two identical samples and the scenario is skipped. The
    // rest report stable history and settle immediately.
    const page = fakePage({ churningRasterBytes: 4096, historyNeverSettlesOnNavigation: 3 });
    const { browser } = fakeBrowser(page);
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    await runUndoScenarios();

    const jsonPath = join(fixtureDir, 'undo-scenarios.json');
    const markdownPath = join(fixtureDir, 'undo-scenarios.md');
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);

    const summary = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(summary.scenarios).toHaveLength(7);
    expect(summary.scenarios).toContainEqual(
      expect.objectContaining({
        key: 'short-marks',
        skipped: true,
        error: expect.stringContaining(
          'history never settled within 20 ms: undoEntries=22 livePatchEntries=2'
        ),
      })
    );
    const laterScenario = summary.scenarios.find((scenario) => scenario.key === 'mixed');
    expect(laterScenario).toMatchObject({ draw: { ops: 1 } });
    expect(laterScenario).not.toHaveProperty('skipped');
    expect(readFileSync(markdownPath, 'utf8')).toContain(
      'Skipped: history never settled within 20 ms: undoEntries=22 livePatchEntries=2'
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping undo scenario short-marks: history never settled within 20 ms'
      )
    );
    expect(state.stop).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });
});

describe('engine selection', () => {
  it('drives WebKit without a CDP session and records that it was unthrottled', async () => {
    // The WebKit run's whole reason to exist is the engine, so the assertion is
    // that it reached the WebKit launcher — and that it never asked for a CDP
    // session, which would throw on a real WebKit context.
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage();
    const { context } = fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    await runUndoScenarios();

    expect(state.launched).toEqual(['webkit']);
    expect(context.newCDPSession).toBeUndefined();
    const summary = JSON.parse(readFileSync(join(fixtureDir, 'undo-scenarios.json'), 'utf8'));
    expect(summary.settings).toMatchObject({
      engine: 'webkit',
      throttle: 0,
      captureMode: 'user-timing (no CDP on WebKit)',
    });
  });

  it('stitches every scenario into the WebKit trace, not just the last one', async () => {
    // Each scenario reloads /dev/engine, and a navigation clears the Performance
    // API entries. Collecting once at the end would leave trace.json — and every
    // trace-derived section of report.md — describing the final scenario while
    // labelled as the whole run.
    process.argv = [
      ...process.argv,
      '--engine=webkit',
      '--scenarios=short-marks,mixed,multi-finger',
    ];
    fakeBrowser(fakePage(), { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    await runUndoScenarios();

    const { traceEvents } = JSON.parse(readFileSync(join(fixtureDir, 'trace.json'), 'utf8'));
    expect(traceEvents.map((e) => e.name)).toEqual([
      'engine.scenario1',
      'engine.scenario2',
      'engine.scenario3',
    ]);
    // And they must not all sit on top of each other at ts 0, or the analyzer
    // reads three scenarios as one overlapping instant.
    expect(traceEvents.map((e) => e.ts)).toEqual([0, 1000, 2000]);
  });

  it('sums every scenario into the frame metrics report.md calls the whole session', async () => {
    // Same hazard as the trace above: each reload wipes window.__perf, so a
    // single reading at the end would put one scenario's frame health under the
    // "Avg FPS (whole session)" heading.
    process.argv = [
      ...process.argv,
      '--engine=webkit',
      '--scenarios=short-marks,mixed,multi-finger',
    ];
    fakeBrowser(fakePage(), { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    await runUndoScenarios();

    const metrics = JSON.parse(readFileSync(join(fixtureDir, 'metrics.json'), 'utf8'));
    const frames = FRAMES_PER_SCENARIO * (1 + 2 + 3);
    const durationMs = FRAME_SPAN_MS_PER_SCENARIO * (1 + 2 + 3);
    // Each scenario is its own rAF window, so the combined figure covers
    // (count - 1) intervals per scenario — not (total count - 1), which would
    // count the gaps between windows as frames.
    const intervals = [1, 2, 3].reduce((sum, n) => sum + (FRAMES_PER_SCENARIO * n - 1), 0);
    expect(metrics.frames).toEqual({
      count: frames,
      durationMs,
      // Recomputed over the combined span, not carried over from a reading.
      fps: (intervals / durationMs) * 1000,
      longFrames: 1 + 2 + 3,
    });
    expect(metrics.longTasks.map((task) => task.duration)).toEqual([50, 100, 150]);
    expect(metrics.heap.beforeBytes).toBeNull();
    expect(metrics.heap.afterBytes).toBe(HEAP_BYTES_PER_SCENARIO * 3);

    const report = JSON.parse(readFileSync(join(fixtureDir, 'undo-scenarios.json'), 'utf8'));
    expect(report.scenarios.map((scenario) => scenario.observers.frames.count)).toEqual([
      FRAMES_PER_SCENARIO,
      FRAMES_PER_SCENARIO * 2,
      FRAMES_PER_SCENARIO * 3,
    ]);
  });

  it('derives and persists fast-set evidence after a complete WebKit run', async () => {
    process.argv = [...process.argv, '--engine=webkit'];
    fakeBrowser(fakePage(), { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate.fastSetEvaluation).toMatchObject({
      evaluated: true,
      committed: ['multi-finger', 'crayon-scribbles'],
      ideal: ['multi-finger', 'crayon-scribbles'],
      drifted: false,
      latestMiss: false,
      consecutiveMisses: 0,
    });
    const report = JSON.parse(readFileSync(join(fixtureDir, 'undo-scenarios.json'), 'utf8'));
    expect(report.scenarios.every((scenario) => scenario.paths.length > 0)).toBe(true);
    expect(report.scenarios.every((scenario) => scenario.draw.headroomRatio === 0.04)).toBe(true);
    const history = JSON.parse(
      readFileSync(join(fixtureDir, 'undo-fast-set-history.json'), 'utf8')
    );
    expect(history.runs).toHaveLength(2);
    expect(history.runs.at(-1)).toMatchObject({
      fastSetWouldCatch: null,
      fastSetMiss: false,
    });
  });

  it('falls back to the compatible seed when restored history is invalid', async () => {
    const historyPath = join(fixtureDir, 'restored-history.json');
    const invalidHistory = '{"schemaVersion":0,"runs":[]}';
    writeFileSync(historyPath, invalidHistory);
    process.argv = [...process.argv, '--engine=webkit', `--fast-set-history=${historyPath}`];
    fakeBrowser(fakePage(), { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate.fastSetEvaluation).toMatchObject({ evaluated: true, historyWindowRuns: 2 });
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Could not use restored fast-set history')
    );
    expect(readFileSync(historyPath, 'utf8')).toBe(invalidHistory);
    const diagnosticHistory = JSON.parse(
      readFileSync(join(fixtureDir, 'undo-fast-set-history.json'), 'utf8')
    );
    expect(diagnosticHistory.schemaVersion).toBe(1);
    expect(diagnosticHistory.runs).toHaveLength(2);
  });

  it('does not append a full run when a scenario has no commit samples', async () => {
    const historyPath = join(fixtureDir, 'zero-sample-history.json');
    process.argv = [...process.argv, '--engine=webkit', `--fast-set-history=${historyPath}`];
    fakeBrowser(fakePage({ commitCount: 0 }), { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({ evaluated: false });
    expect(gate.fastSetEvaluation).toMatchObject({
      evaluated: false,
      reason: expect.stringContaining('valid commit samples'),
    });
    const history = JSON.parse(readFileSync(historyPath, 'utf8'));
    expect(history.runs).toHaveLength(1);
  });

  it('resolves the fast suite through the exported membership constant', async () => {
    process.argv = [...process.argv, '--engine=webkit', '--suite=fast'];
    fakeBrowser(fakePage(), { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    await runUndoScenarios();

    const report = JSON.parse(readFileSync(join(fixtureDir, 'undo-scenarios.json'), 'utf8'));
    expect(report.scenarios.map((scenario) => scenario.key)).toEqual([
      'multi-finger',
      'crayon-scribbles',
    ]);
    // Neither scenario is normalized: the divisor is off until its reference and cap
    // are calibrated from a multi-run distribution (ADR-0140). The host control is
    // still measured on the scenario the reference describes.
    expect(report.gate.scenarioTimings).toEqual([
      expect.objectContaining({ key: 'multi-finger', normalized: false, hostSlowdown: null }),
      expect.objectContaining({ key: 'crayon-scribbles', normalized: false }),
    ]);
    expect(report.fastSetEvaluation).toBeNull();
  });

  it('rejects a named suite combined with an explicit scenario subset', async () => {
    process.argv = [...process.argv, '--suite=fast', '--scenarios=multi-finger'];

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');

    await expect(runUndoScenarios()).rejects.toThrow(
      '--suite=fast cannot be combined with --scenarios'
    );
  });

  it('rejects an unknown engine instead of silently falling back to Chromium', async () => {
    process.argv = [...process.argv, '--engine=firefox'];
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../web/run-undo-scenarios.mjs');

    expect(error).toHaveBeenCalledWith(expect.stringContaining('--engine=firefox is not a known'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('rejects every unknown requested scenario before launching a browser', async () => {
    process.argv = [
      ...process.argv,
      '--engine=webkit',
      '--scenarios=multi-finger,crayon-scribblesTYPO',
    ];

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');

    await expect(runUndoScenarios()).rejects.toThrow(
      '--scenarios contains unknown key(s): crayon-scribblesTYPO'
    );
    expect(state.launched).toEqual([]);
  });
});

describe('the commit gate', () => {
  it('fails the WebKit run when commit latency repeatedly exceeds the budget', async () => {
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=multi-finger'];
    const page = fakePage({
      commitDurationsMs: [...Array(REALISTIC_COMMIT_SAMPLE_COUNT - 2).fill(8), 55, 56],
    });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({
      engine: 'webkit',
      gated: true,
      budgetMs: 25,
      percentile: 0.95,
    });
    expect(gate.breaches.map((s) => s.key)).toEqual(['multi-finger']);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Commit gate FAILED on webkit'));
    const report = JSON.parse(readFileSync(join(fixtureDir, 'undo-scenarios.json'), 'utf8'));
    expect(report.gate.breaches).toEqual(['multi-finger']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('max 56.0 ms'));
  });

  it('retains but does not fail one isolated shared-runner outlier', async () => {
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=multi-finger'];
    const commitDurationsMs = [...Array(REALISTIC_COMMIT_SAMPLE_COUNT - 1).fill(8), 56];
    const page = fakePage({ commitDurationsMs });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate.breaches).toEqual([]);
    expect(gate).toMatchObject({ percentile: 0.95 });
    expect(process.exitCode).toBe(originalExitCode);

    const report = JSON.parse(readFileSync(join(fixtureDir, 'undo-scenarios.json'), 'utf8'));
    expect(report.scenarios[0].draw).toMatchObject({
      commitP95Ms: 8,
      commitMaxMs: 56,
      commitDurationsMs,
    });
  });

  it('passes the WebKit run when commits stay inside the budget', async () => {
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 8 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate.breaches).toEqual([]);
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('fails rather than certifies a run whose bundle carries no engine marks', async () => {
    // Every measure absent reads as 0 ms, which is indistinguishable from a very
    // fast commit, so sample count is the only reliable coverage signal.
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 0, commitCount: 0 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({ evaluated: false, breaches: [] });
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('NOT EVALUATED on webkit'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('npm run perf:web:undo:webkit'));
  });

  it('fails rather than certifies a WebKit run with skipped scenarios', async () => {
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=multi-finger'];
    const page = fakePage({ historyNeverSettles: true });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({ evaluated: false, skipped: 1, breaches: [] });
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('NOT EVALUATED on webkit'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('multi-finger'));
  });

  it('reports completed breaches alongside skipped scenarios', async () => {
    process.argv = [
      ...process.argv,
      '--engine=webkit',
      '--scenarios=multi-finger,crayon-scribbles',
    ];
    const page = fakePage({ commitMaxMs: 30, historyNeverSettlesOnNavigation: 3 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({ evaluated: false, skipped: 1 });
    expect(gate.breaches.map((scenario) => scenario.key)).toEqual(['multi-finger']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Completed scenario breaches'));
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('multi-finger: commit p95 30.0 ms, max 30.0 ms')
    );
  });

  it('reports the gate as not evaluated on Chromium', async () => {
    process.argv = [...process.argv, '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 999 });
    fakeBrowser(page);
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../web/run-undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    // Chromium cannot measure the cost this gate is about, so a hot commit here
    // must not fail the run — see COMMIT_GATE_MS.
    expect(gate).toMatchObject({ engine: 'chromium', gated: false, breaches: [] });
    expect(process.exitCode).toBe(originalExitCode);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not evaluated on chromium'));
  });
});
