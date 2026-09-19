import { describe, expect, it, vi } from 'vitest';

import { withCanvasRasterFlush } from './canvasRasterFlush';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  beginTiledCommand,
  commitTiledCommand,
  recordTiledOp,
  renderTiledOp,
  resizeTiledRenderer,
  TILE_HISTORY_FOLD_IDLE_MS,
  tiledHistoryDebug,
} from './tiledRenderer';
import { installTiledRendererTestHarness, rendererElements } from './tiledRendererTestHarness';
import { MAX_UNDO_DEPTH } from './undoHistory';

vi.mock('./canvasRasterFlush', () => ({
  withCanvasRasterFlush: vi.fn((work: () => void) => work()),
}));

installTiledRendererTestHarness();

// The renderer's history is module state that detachTiledRenderer does not
// unwind, so this case lives in its own file, like tiledRendererUndoBudget.
describe('history fold', () => {
  it('rasterizes each folded command inside the canvas raster flush', () => {
    vi.useFakeTimers();
    const { canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    const dot: StrokeOp = { kind: 'dot', x: 50, y: 50, radius: 5, color: '#ff0000', erase: false };
    for (let index = 0; index < MAX_UNDO_DEPTH + 2; index++) {
      beginTiledCommand(index === 0);
      renderTiledOp(dot);
      recordTiledOp(dot);
      commitTiledCommand();
    }
    const historyAroundWork: Array<[number | undefined, number | undefined]> = [];
    vi.mocked(withCanvasRasterFlush).mockImplementation((work) => {
      const before = tiledHistoryDebug().historyLength;
      work();
      historyAroundWork.push([before, tiledHistoryDebug().historyLength]);
    });

    vi.advanceTimersByTime(TILE_HISTORY_FOLD_IDLE_MS * 2);

    expect(historyAroundWork).toEqual([
      [MAX_UNDO_DEPTH + 2, MAX_UNDO_DEPTH + 1],
      [MAX_UNDO_DEPTH + 1, MAX_UNDO_DEPTH],
    ]);
  });
});
