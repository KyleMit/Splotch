import { beforeEach, expect, it, vi } from 'vitest';

import { installDevHarnessSeam } from './devHarnessSeam';

const ctrl = vi.hoisted(() => ({
  harnessEnabled: true,
  perfMarks: false,
  mode: 'pen',
  snapshots: 3,
  rasterizedOps: 5,
}));
const generateAiImage = vi.hoisted(() => vi.fn());
const replayHarnessStroke = vi.hoisted(() => vi.fn());

vi.mock('$app/environment', () => ({
  get dev() {
    return ctrl.harnessEnabled;
  },
}));

vi.mock('$lib/drawing/engine', () => ({
  committedBrushMode: () => ctrl.mode,
  getDrawingWorkDebug: () => ({ lastCommand: { rasterizedOps: ctrl.rasterizedOps } }),
  getUndoDebug: () => ({ snapshots: ctrl.snapshots }),
  getLiveSurfaceTopology: () => [{ width: 683, height: 458 }],
  replayHarnessStroke,
}));

vi.mock('$lib/drawing/aiImage', () => ({ generateAiImage }));

vi.mock('$lib/drawing/perf', () => ({
  get PERF_MARKS() {
    return ctrl.perfMarks;
  },
}));

beforeEach(() => {
  ctrl.harnessEnabled = true;
  ctrl.perfMarks = false;
  ctrl.mode = 'pen';
  ctrl.snapshots = 3;
  ctrl.rasterizedOps = 5;
  delete window.__committedBrushMode;
  delete window.__drawingDebug;
  delete window.__aiGenerate;
  delete window.__replayStroke;
});

it('publishes the engine mode while the dev-harness gate is open', () => {
  installDevHarnessSeam();
  expect(window.__committedBrushMode?.()).toBe('pen');

  // Read through, not snapshotted: the E2E harness polls this while the engine
  // is still adopting the mode.
  ctrl.mode = 'magic';
  expect(window.__committedBrushMode?.()).toBe('magic');
});

// The on-device profiler (`perf:ios:webkit:frames`) correlates stall onset against how
// the undo history is stored, which nothing in the DOM exposes.
it('publishes the undo-history debug reader while the gate is open', () => {
  installDevHarnessSeam();
  expect(window.__drawingDebug?.getUndoDebug()).toEqual({ snapshots: 3 });
  expect(window.__drawingDebug?.getDrawingWorkDebug()).toEqual({
    lastCommand: { rasterizedOps: 5 },
  });
  expect(window.__drawingDebug?.getLiveSurfaceTopology()).toEqual([{ width: 683, height: 458 }]);

  ctrl.snapshots = 7;
  ctrl.rasterizedOps = 9;
  expect(window.__drawingDebug?.getUndoDebug()).toEqual({ snapshots: 7 });
  expect(window.__drawingDebug?.getDrawingWorkDebug()).toEqual({
    lastCommand: { rasterizedOps: 9 },
  });
});

it('publishes the production AI generation function while the gate is open', () => {
  installDevHarnessSeam();
  expect(window.__aiGenerate).toBe(generateAiImage);
});

it('publishes the store drawing replay while the dev-harness gate is open', () => {
  installDevHarnessSeam();
  window.__replayStroke?.({
    color: { kind: 'palette', label: 'Green' },
    points: [{ x: 1, y: 2 }],
    size: 3,
  });
  expect(replayHarnessStroke).toHaveBeenCalledWith({
    color: '#8CC864',
    points: [{ x: 1, y: 2 }],
    size: 3,
  });
});

it('installs nothing when the gate is closed, so the deploy has no seam', () => {
  ctrl.harnessEnabled = false;
  installDevHarnessSeam();
  expect(window.__committedBrushMode).toBeUndefined();
  expect(window.__drawingDebug).toBeUndefined();
  expect(window.__aiGenerate).toBeUndefined();
  expect(window.__replayStroke).toBeUndefined();
});

it('publishes the read-only profiling seams in an instrumented physical build', () => {
  ctrl.harnessEnabled = false;
  ctrl.perfMarks = true;
  installDevHarnessSeam();
  expect(window.__committedBrushMode?.()).toBe('pen');
  expect(window.__drawingDebug?.getUndoDebug()).toEqual({ snapshots: 3 });
  expect(window.__aiGenerate).toBe(generateAiImage);
  expect(window.__replayStroke).toBeUndefined();
});

it('removes every seam on teardown', () => {
  installDevHarnessSeam()();
  expect(window.__committedBrushMode).toBeUndefined();
  expect(window.__drawingDebug).toBeUndefined();
  expect(window.__aiGenerate).toBeUndefined();
  expect(window.__replayStroke).toBeUndefined();
});
