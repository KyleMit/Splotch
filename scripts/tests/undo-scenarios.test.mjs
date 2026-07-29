import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  browser: null,
  outDir: '',
  stop: null,
  launched: [],
  collectMeasures: () => [],
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

vi.mock('../perf/preview.mjs', () => ({
  buildAndPreview: async () => ({ base: 'http://profile.test/', stop: state.stop }),
}));

// createMeasureTimeline stays real — it is the thing under test for the
// multi-scenario WebKit trace, and stubbing it would test the stub.
vi.mock('../perf/capture.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    startTrace: async () => [],
    stopTrace: async () => {},
    collectMeasures: async () => state.collectMeasures(),
    createMeasureTimeline: actual.createMeasureTimeline,
    injectObservers: async () => {},
    readObservers: async () => ({ longTasks: [], frames: [], heapBytes: 0 }),
    heapBytes: async () => 0,
    markPhase: async (_page, _label, work) => work(),
  };
});

vi.mock('../perf/paths.mjs', () => ({ profilePath: () => state.outDir }));

vi.mock('../lib/playwright.mjs', () => ({ chromiumExecutablePath: () => undefined }));

vi.mock('../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sleep: async () => {} };
});

let fixtureDir;
let originalArgv;
let originalExitCode;

beforeEach(() => {
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
  originalArgv = process.argv;
  // The gate signals a breach through process.exitCode, which would otherwise
  // outlive the test and fail the whole vitest run.
  originalExitCode = process.exitCode;
  // Enough budget for a quiesced tier to produce its consecutive identical
  // samples (Date.now is mocked to tick once per call, sleep is a no-op), while
  // still expiring for the scenario whose tier never stops changing.
  process.argv = [...process.argv, '--cold-tier-timeout-ms=20'];
  // The entry module reads argv at module scope, so each test needs its own
  // evaluation rather than the first test's flags.
  vi.resetModules();
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  rmSync(fixtureDir, { recursive: true, force: true });
});

// A clock that advances one tick per read, so the harness's phase boundaries
// (drawStart < drawEnd < settleEnd < undoStart < undoEnd) are distinguishable
// and a measure query can be attributed to the window that asked for it.
const mockTickingClock = () =>
  (
    (tick) => () =>
      tick++
  )(0);

// A page whose engine.* measures are dictated by the caller, so a test can put
// the run on either side of the commit gate without driving a real browser.
//
// `encodeInCommitMaxMs` and `deferredEncodeMaxMs` land in different windows on
// purpose: the harness reads the encode cost from two disjoint spans (draw, then
// drawEnd→settleEnd), and conflating them is exactly the misreport these tests
// exist to pin down.
function fakePage({
  commitMaxMs = 1,
  commitCount = 1,
  encodeInCommitMaxMs = 0,
  deferredEncodeMaxMs = 0,
  blobBytes = 1,
} = {}) {
  const now = mockTickingClock();
  let drawEnd = null;
  return {
    goto: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => {}),
    waitForFunction: vi.fn(async () => {}),
    evaluate: vi.fn(async (fn, arg) => {
      const source = fn.toString();
      if (source.includes('getUndoDebug')) {
        return { snapshots: 22, liveRasters: 2, blobBytes };
      }
      if (source.includes('document.querySelector')) {
        return { backingW: 20, backingH: 20, side: 20, bytesPerRaster: 1600 };
      }
      if (source.includes("getEntriesByType('measure')")) {
        // The draw window is the one starting at the phase's own start; the
        // deferred window is the one that opens where the draw window closed.
        const isPostDraw = drawEnd != null && arg?.from === drawEnd;
        const encodeMs = isPostDraw ? deferredEncodeMaxMs : encodeInCommitMaxMs;
        return {
          'engine.draw': { count: 1, total: 1, max: 1 },
          'engine.commit': { count: commitCount, total: commitMaxMs, max: commitMaxMs },
          'engine.snapshot': { count: 1, total: 1, max: 1 },
          'engine.fold': { count: 1, total: 1, max: 1 },
          'engine.encode': { count: 1, total: encodeMs, max: encodeMs },
          'engine.undo': { count: 1, total: 1, max: 1 },
        };
      }
      if (source.includes('async (maxUndoSteps)')) return 1;
      if (source.includes('performance.now')) {
        const t = now();
        // Second read per scenario is drawEnd (drawStart, drawEnd, settleEnd, …).
        if (t % 5 === 1) drawEnd = t;
        return t;
      }
      return undefined;
    }),
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
  it('writes artifacts and continues after a cold-tier timeout', async () => {
    let navigations = 0;
    let churn = 0;
    const page = {
      goto: vi.fn(async () => {
        navigations++;
      }),
      waitForSelector: vi.fn(async () => {}),
      waitForFunction: vi.fn(async () => {}),
      evaluate: vi.fn(async (fn) => {
        const source = fn.toString();
        if (source.includes('getUndoDebug')) {
          // One scenario's tier never quiesces — blobBytes keeps moving, so the
          // settle poll never sees two identical samples and the scenario is
          // skipped. The rest report a stable tier and settle immediately.
          return navigations === 3
            ? { snapshots: 22, liveRasters: 3, blobBytes: churn++ }
            : { snapshots: 22, liveRasters: 2, blobBytes: 1 };
        }
        if (source.includes('document.querySelector')) {
          return { backingW: 20, backingH: 20, side: 20, bytesPerRaster: 1600 };
        }
        if (source.includes("getEntriesByType('measure')")) {
          return {
            'engine.draw': { count: 1, total: 1, max: 1 },
            'engine.commit': { count: 1, total: 1, max: 1 },
            'engine.snapshot': { count: 1, total: 1, max: 1 },
            'engine.undo': { count: 1, total: 1, max: 1 },
          };
        }
        if (source.includes('async (maxUndoSteps)')) return 1;
        if (source.includes('performance.now')) return 0;
        return undefined;
      }),
      screenshot: vi.fn(async () => {}),
    };
    const cdp = { send: vi.fn(async () => {}) };
    const context = {
      newPage: vi.fn(async () => page),
      newCDPSession: vi.fn(async () => cdp),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
    };
    state.browser = { launch: vi.fn(async () => browser) };
    let clock = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock++);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
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
          'cold tier never settled within 20 ms: snapshots=22 liveRasters=3'
        ),
      })
    );
    const laterScenario = summary.scenarios.find((scenario) => scenario.key === 'mixed');
    expect(laterScenario).toMatchObject({ draw: { ops: 1 } });
    expect(laterScenario).not.toHaveProperty('skipped');
    expect(readFileSync(markdownPath, 'utf8')).toContain(
      'Skipped: cold tier never settled within 20 ms: snapshots=22 liveRasters=3'
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping undo scenario short-marks: cold tier never settled within 20 ms'
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

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
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

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
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

  it('rejects an unknown engine instead of silently falling back to Chromium', async () => {
    process.argv = [...process.argv, '--engine=firefox'];
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../perf/undo-scenarios.mjs');

    expect(error).toHaveBeenCalledWith(expect.stringContaining('--engine=firefox is not a known'));
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('the commit gate', () => {
  it('fails the WebKit run when a commit exceeds the budget', async () => {
    // #635's shape: an encode back on the commit path, so engine.commit carries
    // a full-raster encode instead of a rect-sized copy plus a fold.
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 56, encodeInCommitMaxMs: 55 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({ engine: 'webkit', gated: true, budgetMs: 25 });
    expect(gate.breaches.map((s) => s.key)).toEqual(['short-marks']);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Commit gate FAILED on webkit'));
    // The breach has to name its own cause, or the run says "too slow" and
    // leaves the reader where #444 was left — guessing at which stage.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('encode 55.0'));
  });

  it('blames the in-commit encode, never the healthy deferred one', async () => {
    // The two encode figures come from disjoint windows. A breach caused by the
    // fold must not print the (large, healthy) deferred encode as its cause —
    // the failure text points at engine.encode, so a mixed-window reading here
    // sends the reader after the one stage that is behaving.
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 30, encodeInCommitMaxMs: 0, deferredEncodeMaxMs: 193 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate.breaches).toHaveLength(1);
    expect(gate.breaches[0].draw).toMatchObject({
      encodeInCommitMaxMs: 0,
      encodeMaxMs: 193,
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('encode 0.0; deferred 193.0'));
  });

  it('passes the WebKit run when commits stay inside the budget', async () => {
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 8, deferredEncodeMaxMs: 208 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    // A large encode is not itself a breach: deferred off the commit is exactly
    // where ADR-0078 puts it, and only its landing *inside* a commit is #635.
    expect(gate.breaches).toEqual([]);
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('warns when no scenario exercised the encode path', async () => {
    // A passing gate over scenarios that never encode is a vacuous pass, so the
    // run has to say so rather than report a clean bill of health.
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage({ blobBytes: 0 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({ breaches: [], encoding: 0 });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('did not exercise the encode path at all')
    );
  });

  it('fails rather than certifies a run whose bundle carries no engine marks', async () => {
    // Every measure absent reads as 0 ms, which is indistinguishable from a very
    // fast commit — and neither warnIfNoPerfMarks (harness env, not the build)
    // nor the encode-path warning (getUndoDebug works without marks) catches it.
    process.argv = [...process.argv, '--engine=webkit', '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 0, commitCount: 0 });
    fakeBrowser(page, { withCdp: false });
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    expect(gate).toMatchObject({ evaluated: false, breaches: [] });
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('NOT EVALUATED on webkit'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('npm run perf:undo:webkit'));
  });

  it('reports the gate as not evaluated on Chromium', async () => {
    process.argv = [...process.argv, '--scenarios=short-marks'];
    const page = fakePage({ commitMaxMs: 999 });
    fakeBrowser(page);
    vi.spyOn(Date, 'now').mockImplementation(mockTickingClock());
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runUndoScenarios } = await import('../perf/undo-scenarios.mjs');
    const gate = await runUndoScenarios();

    // Chromium cannot measure the cost this gate is about, so a hot commit here
    // must not fail the run — see COMMIT_GATE_MS.
    expect(gate).toMatchObject({ engine: 'chromium', gated: false, breaches: [] });
    expect(process.exitCode).toBe(originalExitCode);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not evaluated on chromium'));
  });
});
