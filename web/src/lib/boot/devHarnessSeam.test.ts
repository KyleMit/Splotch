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
const captureReports = vi.hoisted(() => new Map<string, string>());

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

vi.mock('$lib/storage', () => ({
  writeDurableCaptureReport: async (nonce: string, value: string) => {
    captureReports.set(nonce, value);
    return true;
  },
  removeDurableCaptureReport: async (nonce: string) => {
    captureReports.delete(nonce);
    return true;
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
  delete window.__bundledCaptureReport;
  delete window.__probe;
  captureReports.clear();
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

it('persists a complete nonce-bound probe report through the bundled channel', async () => {
  const nonce = '7f16d248-63df-4ba2-81d4-fb27ef0a40e2';
  const frames = [{ at: 1 }, { at: 2 }];
  const events = [{ type: 'pointerdown' }];
  const measures = [{ name: 'engine.draw' }];
  window.__probe = {
    finish: () => ({ meta: { counts: { frames: 2, events: 1, measures: 1 } } }),
    frames: () => frames,
    events: () => events,
    measures: () => measures,
  };
  installDevHarnessSeam();

  await expect(window.__bundledCaptureReport?.arm(nonce)).resolves.toEqual({ nonce });
  const collected = await window.__bundledCaptureReport?.collect(nonce);
  const serialized = captureReports.get(nonce);
  expect(serialized).toBeDefined();
  expect(collected).toEqual({
    nonce,
    bytes: new TextEncoder().encode(serialized).byteLength,
    counts: { frames: 2, events: 1, measures: 1 },
  });
  expect(JSON.parse(serialized ?? '')).toMatchObject({
    schema: 1,
    nonce,
    pageUrl: location.href,
    userAgent: navigator.userAgent,
    report: { frames, events, measures },
  });
});

it('rejects a collector that does not carry the armed session nonce', async () => {
  installDevHarnessSeam();
  const armed = '7f16d248-63df-4ba2-81d4-fb27ef0a40e2';
  const stale = '6098e84f-a8e0-4ed2-a5a4-9e8319c9e8f2';
  await window.__bundledCaptureReport?.arm(armed);

  await expect(window.__bundledCaptureReport?.collect(stale)).rejects.toThrow(
    'session is not armed'
  );
});

it('installs nothing when the gate is closed, so the deploy has no seam', () => {
  ctrl.harnessEnabled = false;
  installDevHarnessSeam();
  expect(window.__committedBrushMode).toBeUndefined();
  expect(window.__drawingDebug).toBeUndefined();
  expect(window.__aiGenerate).toBeUndefined();
  expect(window.__replayStroke).toBeUndefined();
  expect(window.__bundledCaptureReport).toBeUndefined();
});

it('publishes the read-only profiling seams in an instrumented physical build', () => {
  ctrl.harnessEnabled = false;
  ctrl.perfMarks = true;
  installDevHarnessSeam();
  expect(window.__committedBrushMode?.()).toBe('pen');
  expect(window.__drawingDebug?.getUndoDebug()).toEqual({ snapshots: 3 });
  expect(window.__aiGenerate).toBe(generateAiImage);
  expect(window.__replayStroke).toBeUndefined();
  expect(window.__bundledCaptureReport).toBeUndefined();
});

it('removes every seam on teardown', () => {
  installDevHarnessSeam()();
  expect(window.__committedBrushMode).toBeUndefined();
  expect(window.__drawingDebug).toBeUndefined();
  expect(window.__aiGenerate).toBeUndefined();
  expect(window.__replayStroke).toBeUndefined();
  expect(window.__bundledCaptureReport).toBeUndefined();
});
