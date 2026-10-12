import { describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  commitTiledCommand,
  recordTiledOp,
  renderTiledOp,
  resizeTiledRenderer,
  tiledHistoryDebug,
  tiledWorkDebug,
  undoTiledCommand,
} from './tiledRenderer';
import { installTiledRendererTestHarness, rendererElements } from './tiledRendererTestHarness';

const opGeometrySpies = vi.hoisted(() => ({ paddedUserBounds: vi.fn() }));

vi.mock('./opGeometry', async (importOriginal) => {
  const original = await importOriginal<typeof import('./opGeometry')>();
  return {
    ...original,
    opPaddedUserBounds(...args: Parameters<typeof original.opPaddedUserBounds>) {
      opGeometrySpies.paddedUserBounds();
      return original.opPaddedUserBounds(...args);
    },
  };
});

vi.mock('./crayonBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crayonBrush')>()),
  crayonPatternFor: () => ({}) as CanvasPattern,
}));

installTiledRendererTestHarness();

describe('tiled renderer bounds', () => {
  it('computes bounds once while preserving seam pixels and undo crops', () => {
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const dot: StrokeOp = {
      kind: 'dot',
      x: 100,
      y: 80,
      radius: 5,
      color: '#ff0000',
      erase: false,
    };
    opGeometrySpies.paddedUserBounds.mockClear();

    beginTiledCommand(false);
    renderTiledOp(dot);
    recordTiledOp(dot);
    commitTiledCommand();

    expect(opGeometrySpies.paddedUserBounds).toHaveBeenCalledOnce();
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      4
    );
    expect(tiledWorkDebug()).toMatchObject({
      lastCommand: { inputOps: 1, rasterizedOps: 4, maxSurfaceVisitsPerOp: 4 },
    });
    expect(tiledHistoryDebug().patchBytes).toBe(4 * 7 * 7 * 4);
    undoTiledCommand(1);
  });
});
