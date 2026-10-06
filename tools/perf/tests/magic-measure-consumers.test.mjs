// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { analyze } from '../lib/chrome-trace-analysis.mjs';
import { reduceCommitSession } from '../lib/commit-contract.mjs';
import { scoreDrawingRun } from '../lib/drawing-gates.mjs';
import { summarizeRun } from '../lib/real-screen-stats.mjs';
import { undoActionPromiseSource } from '../lib/undo-driver.mjs';

const SCREEN_PROBE = readFileSync(join(ROOT, 'tools/perf/probes/real-screen-probe.js'), 'utf8');
const INPUT_RECORDER = readFileSync(join(ROOT, 'tools/perf/probes/input-recorder.js'), 'utf8');
const ENGINE_ENTRIES = [
  { name: 'engine.draw', startTime: 1004, duration: 0.4 },
  { name: 'engine.commit', startTime: 1230.2, duration: 1 },
];
const MAGIC_ENTRIES = [
  { name: 'magicWitness.ensure', startTime: 1630, duration: 40 },
  { name: 'magicWitness.recode', startTime: 1631, duration: 20 },
  { name: 'magicWitness.unexpected', startTime: 1660, duration: 100 },
];

afterEach(() => {
  window.__probe?.stop();
  window.__rec?.stop();
  for (const key of [
    '__probe',
    '__probeReport',
    '__probeProgress',
    '__probePhases',
    '__probeHud',
    '__rec',
  ])
    delete window[key];
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function collectScreen(entries) {
  let observeMeasures;
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      constructor(callback) {
        observeMeasures = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  document.body.innerHTML = '<div class="paper-view"><canvas id="drawingCanvas"></canvas></div>';
  window.__probePhases = 'blank';
  window.__probeHud = false;
  Function(SCREEN_PROBE)();
  observeMeasures({ getEntries: () => entries });
  const meta = window.__probe.report().meta;
  const measures = window.__probe.measures(0, entries.length);
  window.__probe.stop();
  delete window.__probe;
  return { meta, measures };
}

function drawingCapture(collected) {
  let at = 1000;
  const frames = Array.from({ length: 120 }, (_, index) => {
    const duration = index === 40 ? 60 : 16.7;
    at += duration;
    return [at, duration, 1, at, duration];
  });
  return {
    ...collected,
    phases: [{ key: 'page', suppress: [], startedAt: 1000, endedAt: at, contactMs: at - 1000 }],
    frames,
    events: [
      [1000, 1000, 0, 1, 1, 0, 1, 0, 1, 0.5, 10, 10],
      ...Array.from({ length: 60 }, (_, index) => [
        1010 + index * 20,
        1010 + index * 20,
        1,
        1,
        1,
        0,
        1,
        0,
        1,
        0.5,
        10,
        10,
      ]),
      [at, at, 2, 1, 0, 0, 1, 0, 1, 0, 10, 10],
    ],
  };
}

it('keeps actual screen collection, engine sums, worst frames, starvation and drawing gates invariant', () => {
  const baseline = summarizeRun(drawingCapture(collectScreen(ENGINE_ENTRIES)));
  const withWitness = summarizeRun(
    drawingCapture(collectScreen([...ENGINE_ENTRIES, ...MAGIC_ENTRIES]))
  );
  expect(withWitness).toEqual(baseline);
  expect(scoreDrawingRun(withWitness.phases)).toEqual(scoreDrawingRun(baseline.phases));
  const misnamed = MAGIC_ENTRIES.map((entry) => ({
    ...entry,
    name: entry.name.replace('magicWitness.', 'engine.'),
  }));
  const control = summarizeRun(drawingCapture(collectScreen([...ENGINE_ENTRIES, ...misnamed])));
  expect(control.phases[0].engine.msPerFrame).toBeGreaterThan(baseline.phases[0].engine.msPerFrame);
  expect(control.phases[0].engine.byName).not.toEqual(baseline.phases[0].engine.byName);
});

it('keeps Chrome engine hot paths invariant with nested witness user timings in the raw trace', () => {
  const traceEntries = (entries) =>
    entries.map((entry) => ({
      name: entry.name,
      cat: 'blink.user_timing',
      ph: 'X',
      ts: entry.startTime * 1000,
      dur: entry.duration * 1000,
    }));
  const baseline = traceEntries(ENGINE_ENTRIES);
  const rawTrace = [...baseline, ...traceEntries(MAGIC_ENTRIES)];
  expect(rawTrace.filter((entry) => entry.name.startsWith('magicWitness.'))).toHaveLength(3);
  expect(analyze(rawTrace).engineHotPaths).toEqual(analyze(baseline).engineHotPaths);
  const control = rawTrace.map((entry) => ({
    ...entry,
    name: entry.name.replace('magicWitness.', 'engine.'),
  }));
  expect(analyze(control).engineHotPaths).toHaveLength(5);
});

it('keeps the actual input recorder engine marks free of witness spans', () => {
  let observeMeasures;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      constructor(callback) {
        observeMeasures = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  document.body.innerHTML = '<canvas id="drawingCanvas"></canvas>';
  Function(INPUT_RECORDER)();
  observeMeasures({ getEntries: () => [...ENGINE_ENTRIES, ...MAGIC_ENTRIES] });
  expect(
    window.__rec.events.filter((entry) => entry.kind === 'mark').map((entry) => entry.name)
  ).toEqual(['engine.commit']);
  observeMeasures({ getEntries: () => [{ ...MAGIC_ENTRIES[0], name: 'engine.magicEnsure' }] });
  expect(window.__rec.events.filter((entry) => entry.kind === 'mark')).toHaveLength(2);
});

it('pairs actual undo and ink-motion reads by exact engine names despite witness measures', async () => {
  const entries = [...MAGIC_ENTRIES];
  const reads = [];
  let now = 100;
  const perf = {
    now: () => now,
    getEntriesByName(name) {
      reads.push(name);
      return entries.filter((entry) => entry.name === name);
    },
  };
  const button = {
    disabled: false,
    dispatchEvent() {
      entries.push(
        { name: 'engine.undo', duration: 5 },
        { name: 'engine.undoInkMotion', duration: 1 },
        ...MAGIC_ENTRIES
      );
    },
  };
  const evaluate = new Function(
    'document',
    'performance',
    'requestAnimationFrame',
    'MouseEvent',
    `return ${undoActionPromiseSource(0)};`
  );
  const action = await evaluate(
    { querySelector: () => button },
    perf,
    (callback) => {
      now = 116.7;
      callback(now);
    },
    MouseEvent
  );
  expect(new Set(reads)).toEqual(new Set(['engine.undo', 'engine.undoInkMotion']));
  expect(action.nextFrameMs).toBeCloseTo(16.7, 6);
  expect(action).toMatchObject({
    beforeCount: 0,
    afterCount: 1,
    engineMs: 5,
    inkMotionMeasures: 1,
    inkMotionMs: 1,
  });
});

it('keeps exact commit-contract samples invariant with large witness spans', () => {
  const baseline = {
    measures: Array.from({ length: 30 }, (_, index) => ['engine.commit', 100 + index, 2]),
  };
  const withWitness = {
    measures: [
      ...baseline.measures,
      ...MAGIC_ENTRIES.map(({ name, startTime, duration }) => [name, startTime, duration]),
    ],
  };
  expect(reduceCommitSession('restamp', withWitness)).toEqual(
    reduceCommitSession('restamp', baseline)
  );
  const control = { measures: [...baseline.measures, ['engine.commit', 500, 200]] };
  expect(reduceCommitSession('restamp', control).commitMaxMs).toBe(200);
});
