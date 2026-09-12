import { describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import { MAX_UNDO_DEPTH } from './undoHistory';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  commitTiledCommand,
  recordTiledOp,
  renderTiledOp,
  repaintTiledRenderer,
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
// tiledRendererBlankUndo and tiledRendererBounds are split out — and is the
// only test in it, so the undo depth it drives to zero is genuinely zero.
const TEST_PAPER_PX = 400;
function dot(x: number): StrokeOp {
  return { kind: 'dot', x, y: 50, radius: 5, color: '#123456', erase: false };
}

describe('undo patch budget with an empty undo window', () => {
  it('drops every retained patch once the undo depth reaches zero', () => {
    const { canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: TEST_PAPER_PX, height: TEST_PAPER_PX }),
      hasActivePointers: () => true,
    });
    resizeTiledRenderer(TEST_PAPER_PX, TEST_PAPER_PX, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);

    // More commands than the undo depth, so undoing the whole window empties
    // undoableCommands while history still holds the older commands. That is
    // the only way the two diverge: undoTiledCommand pops history and
    // decrements the count together, but the count is clamped to
    // MAX_UNDO_DEPTH while history keeps growing.
    const strokes = MAX_UNDO_DEPTH + 3;
    for (let i = 0; i < strokes; i++) {
      beginTiledCommand(i === 0);
      renderTiledOp(dot(20 + i * 30));
      recordTiledOp(dot(20 + i * 30));
      commitTiledCommand();
    }
    // Patches are cropped to the dirty region, so assert only that retention
    // happened — the exact byte count is not what this test is about.
    expect(tiledHistoryDebug().patchBytes).toBeGreaterThan(0);

    for (let i = 0; i < MAX_UNDO_DEPTH; i++) undoTiledCommand(1);
    expect(tiledHistoryDebug().historyLength).toBeGreaterThan(0);
    expect(tiledHistoryDebug().snapshots).toBe(0);

    // A finger still down is what carries a repaint into the budget pass with
    // an empty window: repaintTiledRenderer rebuilds when undoableCommands > 0
    // *or* a command is active, and only the second holds here.
    beginTiledCommand(false);
    renderTiledOp(dot(200));
    recordTiledOp(dot(200));
    repaintTiledRenderer();

    // The invariant that makes the zero-window case safe: nothing outside the
    // undo window is still holding a patch by the time the window empties. This
    // does not distinguish the index arithmetic from the negative offsets it
    // replaced — it pins the precondition that makes them equivalent, so if
    // out-of-window retention ever starts happening, the difference stops
    // being academic and this fails first.
    expect(tiledHistoryDebug().patchBytes).toBe(0);
  });
});
