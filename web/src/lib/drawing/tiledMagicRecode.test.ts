import { describe, expect, it, vi } from 'vitest';

import { LIVE_TILE_COUNT } from './liveTiles';
import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  beginTiledMagicRecode,
  commitTiledCommand,
  hasRetainedTiledMagicOps,
  recordTiledOp,
  recodeTiledMagicOps,
  renderTiledOp,
  resizeTiledRenderer,
  tiledHistoryDebug,
  undoTiledCommand,
} from './tiledRenderer';
import { installTiledRendererTestHarness, rendererElements } from './tiledRendererTestHarness';

installTiledRendererTestHarness();

function sheet(sourceUrl: string) {
  return { canvas: document.createElement('canvas'), originX: 0, originY: 0, sourceUrl };
}

function adoptRenderer() {
  const { canvas } = rendererElements();
  adoptTiledRenderer(canvas, {
    paperSize: () => ({ width: 400, height: 400 }),
    hasActivePointers: () => false,
  });
  resizeTiledRenderer(400, 400, 1);
  applyTiledView(IDENTITY_PAPER_VIEW);
}

function magicDot(
  magicSheet = sheet('/coloring/farm/cat-wide.light.webp')
): Extract<StrokeOp, { kind: 'dot' }> & { magic: true } {
  return {
    kind: 'dot',
    x: 50,
    y: 50,
    radius: 5,
    color: '#ff0000',
    erase: false,
    magic: true,
    magicSheet,
  };
}

describe('tiled magic recoding', () => {
  it('restores the previous sheet with the page undo', () => {
    adoptRenderer();
    const firstSheet = sheet('/coloring/farm/cat-wide.light.webp');
    const secondSheet = sheet('/coloring/farm/cow-wide.light.webp');
    const magic = magicDot(firstSheet);
    beginTiledCommand(true);
    renderTiledOp(magic);
    recordTiledOp(magic);
    commitTiledCommand();

    const restoreAppearance = vi.fn();
    expect(hasRetainedTiledMagicOps()).toBe(true);
    expect(beginTiledMagicRecode('/coloring/farm/cow-wide', restoreAppearance)).toBe(true);
    expect(recodeTiledMagicOps(secondSheet, '/coloring/farm/cow-wide')).toBe(true);
    expect(magic.magicSheet).toBe(secondSheet);

    const state = undoTiledCommand(1);
    state.restoreAppearance?.();
    expect(magic.magicSheet).toBe(firstSheet);
    expect(restoreAppearance).toHaveBeenCalledOnce();
    undoTiledCommand(1);
  });

  it('uses a themed sheet without adding an undo command', () => {
    adoptRenderer();
    const magic = magicDot();
    const nightSheet = sheet('/coloring/farm/cat-wide.night.webp');
    beginTiledCommand(true);
    renderTiledOp(magic);
    recordTiledOp(magic);
    commitTiledCommand();
    const undoDepth = tiledHistoryDebug().snapshots;

    expect(recodeTiledMagicOps(nightSheet, '/coloring/farm/cat-wide')).toBe(true);
    expect(magic.magicSheet).toBe(nightSheet);
    expect(tiledHistoryDebug().snapshots).toBe(undoDepth);
    undoTiledCommand(1);
  });

  it('retains a replay tail when magic ink folds into the raster base', () => {
    vi.useFakeTimers();
    adoptRenderer();
    const magic = magicDot();
    const secondSheet = sheet('/coloring/farm/cow-wide.light.webp');
    beginTiledCommand(false);
    renderTiledOp(magic);
    recordTiledOp(magic);
    commitTiledCommand();
    const normal: StrokeOp = {
      kind: 'dot',
      x: magic.x,
      y: magic.y,
      radius: magic.radius,
      color: magic.color,
      erase: false,
    };
    for (let index = 0; index < 20; index++) {
      beginTiledCommand(false);
      recordTiledOp(normal);
      commitTiledCommand();
    }
    vi.runAllTimers();

    expect(recodeTiledMagicOps(secondSheet, '/coloring/farm/cow-wide')).toBe(true);
    expect(magic.magicSheet).toBe(secondSheet);
    expect(tiledHistoryDebug().baseRasters).toBe(LIVE_TILE_COUNT * 2);
  });
});
