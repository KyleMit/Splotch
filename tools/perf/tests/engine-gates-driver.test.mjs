import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import { ALL_UNDO_SCENARIO_KEYS } from '../lib/undo-scenario-keys.mjs';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

// The console driver is a paste-into-Safari snippet, so it can't import the
// desktop harness's key manifest. A row found hot on the iPad must still name the
// `npm run perf:web:undo --scenarios=` run that reproduces it on the desktop.
const scenarioKeys = (source) => [...source.matchAll(/^\s*key: '([a-z-]+)',$/gm)].map((m) => m[1]);

// The driver's only interface is globals an operator types into the Safari
// console before pasting it, so one that isn't in the runbook is one nobody can
// find.
const perfGlobals = (source) =>
  [...new Set([...source.matchAll(/window\.(__perf[A-Za-z]+)/g)].map((m) => m[1]))].sort();

it('routes point arrays and multi-pointer arrays to their matching engine methods', async () => {
  let clock = 0;
  let depth = 0;
  let measures = [];
  const record = (name) => measures.push({ name, startTime: ++clock, duration: 1 });
  const commit = () => {
    depth++;
    record('engine.commit');
  };
  const strokeSync = vi.fn(commit);
  const multiStrokeSync = vi.fn(commit);
  const window = {
    innerWidth: 1024,
    innerHeight: 1366,
    devicePixelRatio: 2,
    __perfScenarios: 'long-squiggles,multi-finger',
    __perfStrokes: 2,
    __perfOps: 10,
    __engineState: {
      get canUndo() {
        return depth > 0;
      },
    },
    __engine: {
      resizeTo() {},
      isCanvasEmpty: () => true,
      strokeSync,
      multiStrokeSync,
      undo() {
        depth--;
        record('engine.undo');
      },
      getUndoDebug: () => ({ snapshots: depth, historyLength: depth }),
    },
  };
  await runInNewContext(read('tools/perf/probes/engine-gates.js'), {
    window,
    console: { log() {}, table() {}, warn() {}, error() {} },
    requestAnimationFrame: (callback) => callback(++clock),
    setTimeout: (callback) => callback(),
    performance: {
      now: () => ++clock,
      getEntriesByType: () => measures,
      getEntriesByName: (name) => measures.filter((measure) => measure.name === name),
      clearMeasures: () => {
        measures = [];
      },
      clearMarks() {},
    },
  });
  expect(strokeSync).toHaveBeenCalledTimes(3);
  expect(multiStrokeSync).toHaveBeenCalledTimes(2);
  expect(
    strokeSync.mock.calls.every(([points]) =>
      points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))
    )
  ).toBe(true);
  expect(
    multiStrokeSync.mock.calls.map(([pointers]) =>
      pointers.map(({ pointerId, points }) => ({ pointerId, points: points.length }))
    )
  ).toEqual([
    [1, 2, 3, 4, 5].map((pointerId) => ({ pointerId, points: 4 })),
    [1, 2, 3, 4, 5].map((pointerId) => ({ pointerId, points: 4 })),
  ]);
  expect(window.__perfRows.map(({ key }) => key)).toEqual(['long-squiggles', 'multi-finger']);
});

describe('iPad console driver operator globals', () => {
  const driver = read('tools/perf/probes/engine-gates.js');
  // __perfRows is an output the driver writes, not an input to document.
  const inputs = perfGlobals(driver).filter((g) => g !== '__perfRows');
  const runbook = read('docs/PROFILING-IPAD.md');

  // Guards the extraction itself: if the regex stops matching, `inputs` empties
  // and the per-global cases below silently vanish instead of failing.
  it('finds the known mode switches', () => {
    expect(inputs).toEqual(
      expect.arrayContaining(['__perfOps', '__perfScenarios', '__perfStrokes', '__perfTimeline'])
    );
  });

  it.each(inputs)('documents window.%s in the runbook', (name) => {
    expect(runbook).toContain(name);
  });
});

describe('iPad console driver scenario keys', () => {
  const driverKeys = scenarioKeys(read('tools/perf/probes/engine-gates.js'));

  it('extracts keys from the standalone driver', () => {
    expect(driverKeys.length).toBeGreaterThan(0);
  });

  it('is a subset of the perf:web:undo scenario keys', () => {
    expect(ALL_UNDO_SCENARIO_KEYS).toEqual(expect.arrayContaining(driverKeys));
  });

  it('declares no duplicate keys', () => {
    expect(new Set(driverKeys).size).toBe(driverKeys.length);
  });
});
