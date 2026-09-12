import { describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import { MAX_UNDO_DEPTH } from './undoHistory';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  clearTiledRenderer,
  commitTiledCommand,
  recordTiledOp,
  renderTiledOp,
  resizeTiledRenderer,
  tiledHistoryDebug,
  undoTiledCommand,
} from './tiledRenderer';
import { installTiledRendererTestHarness, rendererElements } from './tiledRendererTestHarness';

vi.mock('./crayonBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crayonBrush')>()),
  crayonPatternFor: () => ({}) as CanvasPattern,
}));

installTiledRendererTestHarness();

// The renderer's history is module state that detachTiledRenderer does not
// unwind, so this case lives in its own file — the same reason
// tiledRendererBlankUndo and tiledRendererBounds are split out. Being the only
// test in it is what makes the undo depth it drives to zero genuinely zero.
const TEST_PAPER_PX = 400;
const TILE_PATCH_BYTES = 32_000;

describe('undo patch budget with an empty undo window', () => {
  it('drops clear patches captured after the undo window reaches zero', () => {
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: TEST_PAPER_PX, height: TEST_PAPER_PX }),
      hasActivePointers: () => true,
    });
    resizeTiledRenderer(TEST_PAPER_PX, TEST_PAPER_PX, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);

    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    // Drains a snapshot of the queue: a callback these schedule belongs to the
    // next frame, and progressive clear capture queues them one at a time.
    const flushFrame = (time: number) => {
      for (const callback of frames.splice(0)) callback(time);
    };

    const topLeft: StrokeOp = {
      kind: 'dot',
      x: 20,
      y: 20,
      radius: 5,
      color: '#123456',
      erase: false,
    };
    const bottomRight: StrokeOp = { ...topLeft, x: TEST_PAPER_PX - 20, y: TEST_PAPER_PX - 20 };
    const commitDot = (op: StrokeOp, wasEmpty: boolean) => {
      beginTiledCommand(wasEmpty);
      renderTiledOp(op);
      recordTiledOp(op);
      commitTiledCommand();
    };

    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    for (const tile of tiles.slice(0, 4)) tile.hidden = false;

    commitDot(topLeft, false);
    const patchBytesBeforeClear = tiledHistoryDebug().patchBytes;
    clearTiledRenderer(false);

    // Capture tile 0 now, leaving tiles 1-3 queued behind it.
    flushFrame(0);
    expect(tiledHistoryDebug().patchBytes - patchBytesBeforeClear).toBe(TILE_PATCH_BYTES);

    // These mutate a far corner, so captureBeforeMutation never reaches the
    // pending clear indices. Past MAX_UNDO_DEPTH the clear ages out of the
    // window, because the count clamps while history keeps growing.
    for (let index = 0; index < MAX_UNDO_DEPTH + 2; index++) {
      commitDot(bottomRight, index === 0);
    }

    // Pops only the newest strokes. The clear is never popped, so
    // takePendingIndices never consumes its pending captures either.
    for (let index = 0; index < MAX_UNDO_DEPTH; index++) undoTiledCommand(1);

    expect(tiledHistoryDebug()).toMatchObject({
      historyLength: 4,
      snapshots: 0,
      patchBytes: 0,
    });

    // The remaining three tiles are captured only now, onto a command that is
    // already outside the undo window.
    flushFrame(16);
    expect(tiledHistoryDebug().patchBytes).toBe(TILE_PATCH_BYTES);
    flushFrame(32);
    expect(tiledHistoryDebug().patchBytes).toBe(TILE_PATCH_BYTES * 2);
    flushFrame(48);

    // Nothing outside the undo window may keep a patch. The negative-offset
    // form left all three here, because slice(0, -0) is the empty array.
    expect(tiledHistoryDebug().patchBytes).toBe(0);
  });
});
