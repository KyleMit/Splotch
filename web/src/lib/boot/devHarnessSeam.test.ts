import { beforeEach, expect, it, vi } from 'vitest';

import { installDevHarnessSeam } from './devHarnessSeam';

const ctrl = vi.hoisted(() => ({
  harnessEnabled: true,
  perfMarks: false,
  mode: 'pen',
  snapshots: 3,
}));

vi.mock('$app/environment', () => ({
  get dev() {
    return ctrl.harnessEnabled;
  },
}));

vi.mock('$lib/drawing/engine', () => ({
  committedBrushMode: () => ctrl.mode,
  getUndoDebug: () => ({ snapshots: ctrl.snapshots }),
  getLiveSurfaceTopology: () => [{ width: 683, height: 458 }],
}));

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
  delete window.__committedBrushMode;
  delete window.__drawingDebug;
});

it('publishes the engine mode while the dev-harness gate is open', () => {
  installDevHarnessSeam();
  expect(window.__committedBrushMode?.()).toBe('pen');

  // Read through, not snapshotted: the E2E harness polls this while the engine
  // is still adopting the mode.
  ctrl.mode = 'magic';
  expect(window.__committedBrushMode?.()).toBe('magic');
});

// The on-device profiler (`perf:ipad:frames`) correlates stall onset against how
// the undo history is stored, which nothing in the DOM exposes.
it('publishes the undo-history debug reader while the gate is open', () => {
  installDevHarnessSeam();
  expect(window.__drawingDebug?.getUndoDebug()).toEqual({ snapshots: 3 });
  expect(window.__drawingDebug?.getLiveSurfaceTopology()).toEqual([{ width: 683, height: 458 }]);

  ctrl.snapshots = 7;
  expect(window.__drawingDebug?.getUndoDebug()).toEqual({ snapshots: 7 });
});

it('installs nothing when the gate is closed, so the deploy has no seam', () => {
  ctrl.harnessEnabled = false;
  installDevHarnessSeam();
  expect(window.__committedBrushMode).toBeUndefined();
  expect(window.__drawingDebug).toBeUndefined();
});

it('publishes the read-only profiling seams in an instrumented physical build', () => {
  ctrl.harnessEnabled = false;
  ctrl.perfMarks = true;
  installDevHarnessSeam();
  expect(window.__committedBrushMode?.()).toBe('pen');
  expect(window.__drawingDebug?.getUndoDebug()).toEqual({ snapshots: 3 });
});

it('removes every seam on teardown', () => {
  installDevHarnessSeam()();
  expect(window.__committedBrushMode).toBeUndefined();
  expect(window.__drawingDebug).toBeUndefined();
});
