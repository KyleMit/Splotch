import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StrokeGroupCommand, PathOp } from './strokeOps';
import { cmd, createCanvasStub, freshHistory, repaintedContent } from './undoHistoryHarness';

const magicSheet = vi.hoisted(() => ({ ready: true }));

// The real isMagicSheetUnready is `!sheetReady`, the exact condition under which
// sheetPatternFor returns null — so here both derive from the same `ready` flag.
// That equivalence is what magicBrush.test.ts verifies against the real module;
// these tests only assert that undoHistory defers folding while the gate is closed.
vi.mock('./magicBrush', () => ({
  isMagicSheetUnready: () => !magicSheet.ready,
  sheetPatternFor: () => (magicSheet.ready ? '#magic' : null),
}));

const canvasStub = createCanvasStub();

beforeEach(() => {
  magicSheet.ready = true;
  canvasStub.install();
});

afterEach(() => {
  canvasStub.restore();
  vi.resetModules();
});

describe('snapshot stack depth', () => {
  it('caps retained snapshots at MAX_UNDO_DEPTH while the paper keeps every stroke', async () => {
    const m = await freshHistory();
    const colors = Array.from({ length: m.MAX_UNDO_DEPTH + 3 }, (_, i) => `#s${i}`);
    for (const c of colors) m.pushCommand(cmd(c));
    expect(m.snapshotCount()).toBe(m.MAX_UNDO_DEPTH);
    // Dropping old snapshots loses undo depth, never pixels: the paper holds
    // the full drawing in order.
    expect(repaintedContent(m)).toEqual(colors);
  });

  it('undoing past the cap stops at the overflow content, not a blank canvas', async () => {
    const m = await freshHistory();
    const colors = Array.from({ length: m.MAX_UNDO_DEPTH + 2 }, (_, i) => `#s${i}`);
    for (const c of colors) m.pushCommand(cmd(c));
    let undos = 0;
    while (m.popSnapshot()) undos++;
    expect(undos).toBe(m.MAX_UNDO_DEPTH);
    // The two overflow commands survive on the paper — that's the wall the
    // undo button hits.
    expect(repaintedContent(m)).toEqual(colors.slice(0, 2));
  });
});

describe('snapshot restore', () => {
  it('each pop restores the exact pre-stroke paper state, down to blank', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    m.pushCommand(cmd('#b'));
    m.pushCommand(cmd('#c'));
    expect(repaintedContent(m)).toEqual(['#a', '#b', '#c']);

    await m.popSnapshot();
    expect(repaintedContent(m)).toEqual(['#a', '#b']);
    await m.popSnapshot();
    expect(repaintedContent(m)).toEqual(['#a']);
    const last = await m.popSnapshot();
    expect(repaintedContent(m)).toEqual([]);
    expect(last?.wasEmpty).toBe(true);
    expect(m.popSnapshot()).toBeNull();
  });

  it('undoing a clear restores the pre-clear drawing in one pop', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    m.pushCommand({ ops: [{ kind: 'clear' }], wasEmpty: false });
    expect(repaintedContent(m)).toEqual([]);
    await m.popSnapshot();
    expect(repaintedContent(m)).toEqual(['#a']);
  });
});

describe("clear snapshot swap (swap-don't-copy)", () => {
  const clearCmd = (): StrokeGroupCommand => ({ ops: [{ kind: 'clear' }], wasEmpty: false });

  it('captures a clear with zero drawImage copies', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    const copiesBefore = canvasStub.drawImageCalls;
    m.pushCommand(clearCmd());
    // The old paper is adopted as the snapshot raster and a fresh blank paper
    // takes its place — no pixel copy anywhere on the commit path.
    expect(canvasStub.drawImageCalls).toBe(copiesBefore);
    expect(m.getHistoryDebug().rasterBytes).toBe(7 * 7 * 4 + 64 * 64 * 4);
    expect(repaintedContent(m)).toEqual([]);
  });

  it('draw → clear → draw round-trips through both papers', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    m.pushCommand(clearCmd());
    m.pushCommand(cmd('#b', false, true));
    expect(repaintedContent(m)).toEqual(['#b']);
    await m.popSnapshot();
    expect(repaintedContent(m)).toEqual([]);
    await m.popSnapshot();
    expect(repaintedContent(m)).toEqual(['#a']);
    await m.popSnapshot();
    expect(repaintedContent(m)).toEqual([]);
    expect(m.popSnapshot()).toBeNull();
  });

  it('ink drawn after an undone clear folds onto the restored paper', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    m.pushCommand(clearCmd());
    await m.popSnapshot();
    m.pushCommand(cmd('#b'));
    expect(repaintedContent(m)).toEqual(['#a', '#b']);
  });

  it('a clear blocked behind an unready magic sheet folds later, swap intact', async () => {
    const m = await freshHistory();
    magicSheet.ready = false;
    m.pushCommand(cmd('#magic-ink', true, true));
    m.pushCommand(clearCmd());
    // Neither folded: the clear queues behind the blocked magic command.
    expect(m.getHistoryDebug().pendingCommands).toBe(2);
    expect(m.pendingCommandCount()).toBe(2);
    expect(repaintedContent(m)).toEqual([]);

    magicSheet.ready = true;
    m.pushCommand(cmd('#after'));
    // The backlog folds through: magic ink, wiped by the clear, then #after.
    expect(m.getHistoryDebug().pendingCommands).toBe(0);
    expect(m.pendingCommandCount()).toBe(0);
    expect(repaintedContent(m)).toEqual(['#after']);
  });
});

describe('folding while the magic sheet decodes', () => {
  it('holds a magic command (and everything after it) out of the paper until the sheet is ready', async () => {
    const m = await freshHistory();
    magicSheet.ready = false;
    m.pushCommand(cmd('#ignored', true));
    m.pushCommand(cmd('#solid'));
    // Nothing folded: the paper would bake the magic op's blank pixels.
    expect(m.getHistoryDebug().pendingCommands).toBe(2);
    // The repaint replays the pending ops instead, so once the sheet is ready
    // the drawing shows in order without any fold having happened.
    magicSheet.ready = true;
    expect(repaintedContent(m)).toEqual(['#magic', '#solid']);

    // The next commit folds the whole backlog through the now-ready sheet.
    m.pushCommand(cmd('#after'));
    expect(m.getHistoryDebug().pendingCommands).toBe(0);
    expect(repaintedContent(m)).toEqual(['#magic', '#solid', '#after']);
  });

  it('undo restores the pending set captured with the snapshot', async () => {
    const m = await freshHistory();
    magicSheet.ready = false;
    m.pushCommand(cmd('#magic-ink', true, true));
    m.pushCommand(cmd('#solid'));
    magicSheet.ready = true;

    // Undo the solid stroke: the snapshot carried the still-pending magic
    // command, so the repaint reproduces exactly the magic-only state.
    await m.popSnapshot();
    expect(m.getHistoryDebug().pendingCommands).toBe(1);
    expect(repaintedContent(m)).toEqual(['#magic']);
  });
});

describe('cold-snapshot blob validation', () => {
  // Guards the demotion path: only a blob that is plausibly a lossless
  // encoding (WebP at quality 1, or the spec's PNG fallback) may replace a
  // hot raster. Everything else keeps the raster so undo stays byte-exact.
  it('accepts only a non-empty webp or png blob', async () => {
    const m = await freshHistory();
    expect(m.isValidColdSnapshotBlob(new Blob(['x'], { type: 'image/webp' }))).toBe(true);
    expect(m.isValidColdSnapshotBlob(new Blob(['x'], { type: 'image/png' }))).toBe(true);
    expect(m.isValidColdSnapshotBlob(null)).toBe(false);
    expect(m.isValidColdSnapshotBlob(new Blob([], { type: 'image/webp' }))).toBe(false);
    expect(m.isValidColdSnapshotBlob(new Blob(['x'], { type: 'image/jpeg' }))).toBe(false);
    expect(m.isValidColdSnapshotBlob(new Blob(['x'], { type: '' }))).toBe(false);
  });
});

describe('memory tier transitions', () => {
  // A patch holds its pixels as a hot raster or a cold blob, never both and
  // never neither. These tests drive both transitions and the deep-undo
  // restore that decodes a cold patch, with a stub codec: the encoder hands
  // back a real PNG blob (the fallback Safari always takes) and remembers the
  // canvas content behind it, so a decode reproduces that content exactly and
  // a restore through the cold tier is still assertable against ground truth.
  // Decodes resolve only when the test flushes them, which is what keeps a
  // patch cold long enough for popSnapshot to have to decode it.
  const encodedCanvases = new Map<Blob, { content: string[]; width: number; height: number }>();
  let pendingDecodes: (() => void)[] = [];

  // The number of most recent snapshots that stay hot rasters — MAX_HOT_RASTERS
  // in undoHistory, a white-box invariant of the tier design (ADR-0066) shared
  // with tests/engine-snapshot-tier.spec.ts.
  const HOT_WINDOW = 2;

  beforeEach(() => {
    encodedCanvases.clear();
    pendingDecodes = [];
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback) {
      const content = [...((this as HTMLCanvasElement & { _content?: string[] })._content ?? [])];
      const blob = new Blob([JSON.stringify(content)], { type: 'image/png' });
      encodedCanvases.set(blob, { content, width: this.width, height: this.height });
      cb(blob);
    };
    vi.stubGlobal(
      'createImageBitmap',
      (blob: Blob) =>
        new Promise((resolve) => {
          const encoded = encodedCanvases.get(blob);
          pendingDecodes.push(() =>
            resolve({ ...encoded, _content: encoded?.content ?? [], close() {} })
          );
        })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function flushDecodes() {
    for (const resolve of pendingDecodes.splice(0)) resolve();
    await new Promise((r) => setTimeout(r, 0));
  }

  // Four commits: the two oldest snapshots fall out of the hot window and
  // demote on the commit that pushed them below it.
  async function stackPastTheHotWindow() {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    m.pushCommand(cmd('#b'));
    m.pushCommand(cmd('#c'));
    m.pushCommand(cmd('#d'));
    return m;
  }

  it('demotes snapshots below the hot window to encoded blobs', async () => {
    const m = await stackPastTheHotWindow();
    const { snapshots, liveRasters, rasterBytes, blobBytes } = m.getHistoryDebug();
    expect(snapshots).toBe(4);
    expect(liveRasters).toBe(HOT_WINDOW);
    expect(rasterBytes).toBeGreaterThan(0);
    expect(blobBytes).toBeGreaterThan(0);
  });

  it('restores a demoted snapshot through its blob decode', async () => {
    const m = await stackPastTheHotWindow();
    expect(repaintedContent(m)).toEqual(['#a', '#b', '#c', '#d']);
    // The two hot entries pop synchronously; leaving their decodes unflushed
    // keeps the entry beneath them cold, so its pop must decode to restore.
    await m.popSnapshot();
    await m.popSnapshot();
    expect(m.getHistoryDebug().liveRasters).toBe(0);

    const restored = m.popSnapshot();
    await flushDecodes();
    expect((await restored)?.wasEmpty).toBe(false);
    expect(repaintedContent(m)).toEqual(['#a']);
  });

  it('re-inflates an encoded snapshot that rises into the hot window', async () => {
    const m = await stackPastTheHotWindow();
    expect(m.getHistoryDebug().blobBytes).toBeGreaterThan(0); // the survivors start cold
    await m.popSnapshot();
    await flushDecodes();
    await m.popSnapshot();
    await flushDecodes();

    // Both survivors were blobs; rising into the window turned them back into
    // hot rasters, and the drawing they restore is unchanged by the round trip.
    const { snapshots, liveRasters, blobBytes } = m.getHistoryDebug();
    expect(snapshots).toBe(HOT_WINDOW);
    expect(liveRasters).toBe(HOT_WINDOW);
    expect(blobBytes).toBe(0);
    expect(repaintedContent(m)).toEqual(['#a', '#b']);

    await m.popSnapshot();
    expect(repaintedContent(m)).toEqual(['#a']);
  });
});

describe('dirty-rect patch snapshots', () => {
  // A snapshot captures only the paper under the regions its fold mutates
  // (foldRegionsForCommands), so per-entry memory scales with the stroke, not
  // the canvas.

  it('a magic-blocked commit captures no pixels, and its undo still restores the pending set', async () => {
    const m = await freshHistory();
    magicSheet.ready = false;
    m.pushCommand(cmd('#magic-ink', true, true));
    // Nothing folded, so the snapshot holds no raster at all — zero bytes.
    expect(m.snapshotCount()).toBe(1);
    expect(m.getHistoryDebug().liveRasters).toBe(0);
    expect(m.getHistoryDebug().rasterBytes).toBe(0);

    magicSheet.ready = true;
    const restored = await m.popSnapshot();
    expect(restored?.wasEmpty).toBe(true);
    expect(m.getHistoryDebug().pendingCommands).toBe(0);
    expect(repaintedContent(m)).toEqual([]);
  });

  it('sizes the captured patch to the fold region, not the paper', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    const { liveRasters, rasterBytes } = m.getHistoryDebug();
    expect(liveRasters).toBe(1);
    // cmd()'s ops span 0..1 with lineWidth 8 → pad 6 → clamped rect 0..7 both
    // axes: 7×7 px, nowhere near the 64×64 paper.
    expect(rasterBytes).toBe(7 * 7 * 4);
  });

  it('covers every command folding under one commit, then unwinds the round trip', async () => {
    const m = await freshHistory();
    const at = (color: string, x: number, magic = false): StrokeGroupCommand => {
      const op = cmd(color, magic).ops[0] as PathOp;
      op.startX = x;
      op.startY = x;
      op.segs = [{ cx: x, cy: x, x: x + 2, y: x + 2 }];
      return { ops: [op], wasEmpty: false };
    };
    magicSheet.ready = false;
    m.pushCommand({ ...at('#magic-ink', 10, true), wasEmpty: true });
    m.pushCommand(at('#solid', 30));
    // Both blocked behind the unready sheet: two zero-pixel entries.
    expect(m.getHistoryDebug().rasterBytes).toBe(0);
    expect(m.getHistoryDebug().pendingCommands).toBe(2);

    magicSheet.ready = true;
    m.pushCommand(at('#after', 50));
    // The third commit folds the whole backlog. The three strokes sit apart
    // (each spans x−6..x+8, a 14×14 box), so the capture takes three disjoint
    // patches instead of one 54×54 union.
    expect(m.getHistoryDebug().pendingCommands).toBe(0);
    expect(m.getHistoryDebug().rasterBytes).toBe(3 * 14 * 14 * 4);
    expect(repaintedContent(m)).toEqual(['#magic', '#solid', '#after']);

    // Unwind: the patch entry reverts the whole fold and reinstates the
    // captured pending pair; the two blocked entries then just peel it.
    await m.popSnapshot();
    expect(m.getHistoryDebug().rasterBytes).toBe(0);
    expect(m.getHistoryDebug().pendingCommands).toBe(2);
    expect(repaintedContent(m)).toEqual(['#magic', '#solid']);
    await m.popSnapshot();
    expect(m.getHistoryDebug().pendingCommands).toBe(1);
    expect(repaintedContent(m)).toEqual(['#magic']);
    const last = await m.popSnapshot();
    expect(last?.wasEmpty).toBe(true);
    expect(m.getHistoryDebug().pendingCommands).toBe(0);
    expect(repaintedContent(m)).toEqual([]);
  });
});

describe('popSnapshot reports the restored rects', () => {
  // engine.undo uses the resolved rects for its rect-limited repaint: blit
  // just the restored patches instead of rebuilding the whole canvas.
  it('resolves the patch rects for a folded commit and none for a blocked one', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    // cmd()'s ops span 0..1 with lineWidth 8 → pad 6 → clamped rect 0..7.
    const restored = await m.popSnapshot();
    expect(restored?.rects).toEqual([{ x: 0, y: 0, w: 7, h: 7 }]);

    magicSheet.ready = false;
    m.pushCommand(cmd('#magic-ink', true, true));
    const blocked = await m.popSnapshot();
    expect(blocked?.rects).toEqual([]);
  });
});

describe('disjoint multi-finger patches', () => {
  // A spread multi-touch gesture clusters per finger (path pid), so the
  // capture cost scales with the fingers' band areas, not their union bbox —
  // the five-finger 1068 ms patch copy in the 2026-07-22 profile.
  const strokeAt = (x: number, pid: number): PathOp => {
    const op = cmd('#multi').ops[0] as PathOp;
    op.pid = pid;
    op.startX = x;
    op.startY = x;
    op.segs = [{ cx: x, cy: x, x: x + 2, y: x + 2 }];
    return op;
  };

  it('captures one patch per spread finger instead of the union bbox', async () => {
    const m = await freshHistory();
    m.pushCommand({ ops: [strokeAt(5, 1), strokeAt(45, 2)], wasEmpty: true });
    const { liveRasters, rasterBytes } = m.getHistoryDebug();
    // liveRasters counts entries, not patches — the settle gates compare it
    // against MAX_HOT_RASTERS.
    expect(liveRasters).toBe(1);
    // Two 14×14 bands (x−6..x+8, clamped: 0..13 and 39..53), not the 54-wide
    // union.
    expect(rasterBytes).toBe((13 * 13 + 14 * 14) * 4);
    const restored = await m.popSnapshot();
    expect(restored?.rects).toEqual([
      { x: 0, y: 0, w: 13, h: 13 },
      { x: 39, y: 39, w: 14, h: 14 },
    ]);
    expect(repaintedContent(m)).toEqual([]);
  });

  it('merges overlapping fingers into one patch', async () => {
    const m = await freshHistory();
    m.pushCommand({ ops: [strokeAt(20, 1), strokeAt(24, 2)], wasEmpty: true });
    // Boxes 14..28 and 18..32 intersect → one merged 14..32 patch.
    expect(m.getHistoryDebug().liveRasters).toBe(1);
    expect(m.getHistoryDebug().rasterBytes).toBe(18 * 18 * 4);
  });

  it('falls back to one union patch past the cluster cap', async () => {
    const m = await freshHistory();
    // Nine spread dots (each its own cluster) exceed PATCH_CLUSTER_CAP = 8.
    const dots = Array.from({ length: 9 }, (_, i) => ({
      kind: 'dot' as const,
      x: 3 + i * 7,
      y: 3,
      radius: 1,
      color: '#dots',
      erase: false,
    }));
    m.pushCommand({ ops: dots, wasEmpty: true });
    expect(m.getHistoryDebug().liveRasters).toBe(1);
    // Union spans x 0..62, y 0..6 (pad 3, clamped at the left edge).
    expect(m.getHistoryDebug().rasterBytes).toBe(62 * 6 * 4);
  });
});

describe('hasUnfoldedCommands', () => {
  // The engine's rect-limited undo repaint is only sound while every command
  // is folded into the paper; any pending/deferred/active command forces the
  // full repaint.
  it('tracks the open stroke and magic-blocked pending commands', async () => {
    const m = await freshHistory();
    expect(m.hasUnfoldedCommands()).toBe(false);
    m.beginCommand(true);
    expect(m.hasUnfoldedCommands()).toBe(true);
    m.recordOp(cmd('#live').ops[0]);
    m.commitActiveCommand();
    expect(m.hasUnfoldedCommands()).toBe(false);
    magicSheet.ready = false;
    m.pushCommand(cmd('#magic-ink', true));
    expect(m.hasUnfoldedCommands()).toBe(true);
  });

  it('counts a deferred commit until it finalizes', async () => {
    const m = await freshHistory();
    m.beginCommand(true);
    m.recordOp(cmd('#live').ops[0]);
    m.commitActiveCommand(true);
    expect(m.hasUnfoldedCommands()).toBe(true);
    m.finalizeDeferredCommand();
    expect(m.hasUnfoldedCommands()).toBe(false);
  });
});

describe('closed crayon passes travel as rasters', () => {
  function crayonOp(seed: number): PathOp {
    const op = cmd('#wax').ops[0] as PathOp;
    op.crayon = true;
    op.seed = seed;
    return op;
  }

  function rasterOp(x: number, y: number, w: number, h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return { kind: 'crayonPassRaster', canvas, x, y, mix: 0.55 } as const;
  }

  it('replaces exactly the trailing run of crayon ops with the raster', async () => {
    const m = await freshHistory();
    m.beginCommand(true);
    m.recordOp(crayonOp(1));
    m.recordOp(crayonOp(1));
    m.recordOp(crayonOp(1));
    const r1 = rasterOp(4, 6, 10, 12);
    m.replaceOpenCrayonPassOps(r1);
    // Second pass after a mid-stroke split: the first raster stops the scan.
    m.recordOp(crayonOp(2));
    m.recordOp(crayonOp(2));
    const r2 = rasterOp(8, 9, 5, 5);
    m.replaceOpenCrayonPassOps(r2);
    expect(m.activeCrayonRasterRects()).toEqual([
      { x: 4, y: 6, w: 10, h: 12 },
      { x: 8, y: 9, w: 5, h: 5 },
    ]);
    m.commitActiveCommand();
    expect(m.activeCrayonRasterRects()).toEqual([]);
  });

  it('no-ops between groups, like recordOp', async () => {
    const m = await freshHistory();
    expect(() => m.replaceOpenCrayonPassOps(rasterOp(0, 0, 1, 1))).not.toThrow();
    expect(m.activeCrayonRasterRects()).toEqual([]);
  });

  it('falls back to a plain flush when a foreign op sits inside the pass run', async () => {
    // The engine closes an open pass before any non-crayon ink op records
    // (closeCrayonPassBeforeForeignOp), so the trailing crayon run should
    // always end at a pass boundary. If it ever doesn't — an eraser op
    // interleaved inside the run — the raster can't be attributed (it was
    // cropped from the paper-space accumulation, which never saw the erase),
    // so the swap must keep the raw ops and record a flush: the re-render
    // fold replays the interleave in op order and stays correct.
    const m = await freshHistory();
    m.beginCommand(true);
    m.recordOp(crayonOp(1));
    const erase = cmd('#000').ops[0] as PathOp;
    erase.erase = true;
    m.recordOp(erase);
    m.recordOp(crayonOp(1));
    m.replaceOpenCrayonPassOps(rasterOp(0, 0, 4, 4));
    expect(m.activeCrayonRasterRects()).toEqual([]);
  });
});

describe('in-flight strokes', () => {
  it('repaints an uncommitted active command on top of the paper', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    m.beginCommand(false);
    const op = cmd('#live').ops[0];
    m.recordOp(op);
    expect(repaintedContent(m)).toEqual(['#a', '#live']);
    m.commitActiveCommand();
    expect(repaintedContent(m)).toEqual(['#a', '#live']);
    expect(m.snapshotCount()).toBe(2);
  });

  it('resetActiveCommandForClear drops the straddling stroke ops', async () => {
    const m = await freshHistory();
    m.beginCommand(true);
    m.recordOp(cmd('#live').ops[0]);
    expect(m.resetActiveCommandForClear()).toBe(true);
    expect(repaintedContent(m)).toEqual([]);
  });
});

describe('paper grow', () => {
  it('copies the existing pixels onto the bigger paper', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    const copiesBefore = canvasStub.drawImageCalls;
    m.ensurePaperCovers(128);
    expect(canvasStub.drawImageCalls).toBe(copiesBefore + 1);
    expect(repaintedContent(m)).toEqual(['#a']);
    m.pushCommand(cmd('#b'));
    expect(repaintedContent(m)).toEqual(['#a', '#b']);
  });

  it('keeps the old paper when the grown canvas has no context', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    canvasStub.failNextGetContext();
    m.ensurePaperCovers(128);
    // Swapping in the blank, context-less canvas would lose '#a' outright and
    // make every later push a silent no-op.
    expect(repaintedContent(m)).toEqual(['#a']);
    m.pushCommand(cmd('#b'));
    expect(repaintedContent(m)).toEqual(['#a', '#b']);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
