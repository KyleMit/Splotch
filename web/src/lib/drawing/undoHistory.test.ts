import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StrokeGroupCommand, PathOp } from './strokeOps';

const magicSheet = vi.hoisted(() => ({ ready: true }));

// The real isMagicSheetUnready is `!sheetReady`, the exact condition under which
// sheetPatternFor returns null — so here both derive from the same `ready` flag.
// That equivalence is what magicBrush.test.ts verifies against the real module;
// these tests only assert that undoHistory defers folding while the gate is closed.
vi.mock('./magicBrush', () => ({
  isMagicSheetUnready: () => !magicSheet.ready,
  sheetPatternFor: () => (magicSheet.ready ? '#magic' : null),
}));

// happy-dom's <canvas> has no 2D context, so install a recording stub: each
// canvas's "content" is the ordered list of stroke colors painted onto it,
// drawImage copies a source canvas's content, and clearRect empties it. Giving
// every command a unique color makes a canvas's content the drawing's
// ground-truth in draw order — enough to assert the snapshot stack restores
// exact pre-stroke states and the paper accumulates every fold.
let origGetContext: typeof HTMLCanvasElement.prototype.getContext;
let origToBlob: typeof HTMLCanvasElement.prototype.toBlob;

// Every stub drawImage bumps this, so a test can assert a code path copied
// pixels (patch capture) or didn't (the clear's swap capture).
let drawImageCalls = 0;

beforeEach(() => {
  magicSheet.ready = true;
  drawImageCalls = 0;
  origGetContext = HTMLCanvasElement.prototype.getContext;
  origToBlob = HTMLCanvasElement.prototype.toBlob;
  // The blob tier is exercised end-to-end by the engine E2E specs; here every
  // encode "fails" so snapshots keep their rasters and stay synchronous.
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(null);
  };
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    kind: string
  ) {
    if (kind !== '2d') return null;
    const canvas = this as HTMLCanvasElement & { _content?: string[]; _ctx?: unknown };
    canvas._content ??= [];
    if (canvas._ctx) return canvas._ctx;
    const ctx = {
      canvas,
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      globalCompositeOperation: '',
      save() {},
      restore() {},
      setTransform() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      bezierCurveTo() {},
      quadraticCurveTo() {},
      arc() {},
      createPattern() {
        return {};
      },
      clearRect() {
        canvas._content!.length = 0;
      },
      stroke() {
        canvas._content!.push(String(ctx.strokeStyle));
      },
      fill() {
        canvas._content!.push(String(ctx.fillStyle));
      },
      drawImage(src: { _content?: string[] }) {
        drawImageCalls++;
        if (src?._content) canvas._content!.push(...src._content);
      },
    };
    canvas._ctx = ctx;
    return ctx;
  };
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = origGetContext;
  HTMLCanvasElement.prototype.toBlob = origToBlob;
  vi.resetModules();
});

// A single-stroke command in a unique color.
function cmd(color: string, magic = false, wasEmpty = false): StrokeGroupCommand {
  const op: PathOp = {
    kind: 'path',
    pid: 1,
    startX: 0,
    startY: 0,
    segs: [{ cx: 0, cy: 0, x: 1, y: 1 }],
    color,
    lineWidth: 8,
    erase: false,
    magic,
  };
  return { ops: [op], wasEmpty };
}

async function freshHistory() {
  vi.resetModules();
  const m = await import('./undoHistory');
  m.ensurePaperCovers(64);
  return m;
}

// The color sequence a fresh repaint paints — the visible drawing, ground-truth.
function repaintedContent(m: Awaited<ReturnType<typeof freshHistory>>): string[] {
  const target = document.createElement('canvas');
  target.width = 64;
  target.height = 64;
  const ctx = target.getContext('2d')!;
  m.repaintAll(ctx);
  return [...(target as unknown as { _content: string[] })._content];
}

describe('snapshot stack depth', () => {
  it('caps retained snapshots at MAX_UNDO_STACK_SIZE while the paper keeps every stroke', async () => {
    const m = await freshHistory();
    const colors = Array.from({ length: m.MAX_UNDO_STACK_SIZE + 3 }, (_, i) => `#s${i}`);
    for (const c of colors) m.pushCommand(cmd(c));
    expect(m.snapshotCount()).toBe(m.MAX_UNDO_STACK_SIZE);
    // Dropping old snapshots loses undo depth, never pixels: the paper holds
    // the full drawing in order.
    expect(repaintedContent(m)).toEqual(colors);
  });

  it('undoing past the cap stops at the overflow content, not a blank canvas', async () => {
    const m = await freshHistory();
    const colors = Array.from({ length: m.MAX_UNDO_STACK_SIZE + 2 }, (_, i) => `#s${i}`);
    for (const c of colors) m.pushCommand(cmd(c));
    let undos = 0;
    while (m.popSnapshot()) undos++;
    expect(undos).toBe(m.MAX_UNDO_STACK_SIZE);
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
    const copiesBefore = drawImageCalls;
    m.pushCommand(clearCmd());
    // The old paper is adopted as the snapshot raster and a fresh blank paper
    // takes its place — no pixel copy anywhere on the commit path.
    expect(drawImageCalls).toBe(copiesBefore);
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
    expect(repaintedContent(m)).toEqual([]);

    magicSheet.ready = true;
    m.pushCommand(cmd('#after'));
    // The backlog folds through: magic ink, wiped by the clear, then #after.
    expect(m.getHistoryDebug().pendingCommands).toBe(0);
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
  // live raster. Everything else keeps the raster so undo stays byte-exact.
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

describe('dirty-rect patch snapshots', () => {
  // A snapshot captures only the paper under the regions its fold mutates
  // (foldRegionsForCommands), so per-entry memory scales with the stroke, not
  // the canvas.

  it('bounds a path by its points padded with half the line width plus AA bleed', async () => {
    const m = await freshHistory();
    const op: PathOp = {
      kind: 'path',
      pid: 1,
      startX: 20,
      startY: 30,
      segs: [{ cx: 24, cy: 34, x: 28, y: 38 }],
      color: '#a',
      lineWidth: 8,
      erase: false,
    };
    // pad = 8/2 + 2 = 6: x spans 20−6..28+6, y spans 30−6..38+6.
    expect(m.foldRegionsForCommands([{ ops: [op], wasEmpty: false }], 64, 64)).toEqual([
      { x: 14, y: 24, w: 20, h: 20 },
    ]);
  });

  it('bounds a dot by its radius plus AA bleed and clamps to the paper', async () => {
    const m = await freshHistory();
    const dot = { kind: 'dot' as const, x: 2, y: 62, radius: 5, color: '#a', erase: false };
    // pad = 5 + 2 = 7: clamped at the left and bottom paper edges.
    expect(m.foldRegionsForCommands([{ ops: [dot], wasEmpty: false }], 64, 64)).toEqual([
      { x: 0, y: 55, w: 9, h: 9 },
    ]);
  });

  it('a clear claims the whole paper; wholly off-paper ink claims nothing', async () => {
    const m = await freshHistory();
    expect(
      m.foldRegionsForCommands([{ ops: [{ kind: 'clear' }], wasEmpty: false }], 64, 64)
    ).toEqual([{ x: 0, y: 0, w: 64, h: 64 }]);
    // Margin ink beyond the paper square is clipped at fold (ADR-0050), so the
    // fold never touches the paper and no patch is owed.
    const off = { kind: 'dot' as const, x: -40, y: 10, radius: 5, color: '#a', erase: false };
    expect(m.foldRegionsForCommands([{ ops: [off], wasEmpty: false }], 64, 64)).toEqual([]);
    expect(m.foldRegionsForCommands([], 64, 64)).toEqual([]);
  });

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

  it('bounds a crayon pass raster by its rect plus AA bleed', async () => {
    const m = await freshHistory();
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 12;
    const raster = { kind: 'crayonPassRaster', canvas, x: 20, y: 30, mix: 0.55 } as const;
    // The stamp blits exactly the raster's rect; pad 2 covers any AA bleed.
    expect(m.foldRegionsForCommands([{ ops: [raster], wasEmpty: false }], 64, 64)).toEqual([
      { x: 18, y: 28, w: 14, h: 16 },
    ]);
  });

  it('widens a crayon ink op pad by the widest dev-harness pass', async () => {
    // setCrayonParams accepts arbitrary passes; a widthScale > 1 experiment
    // strokes wider than the op's line width, so the rect must scale with it
    // or undo would leave the widened fringe behind.
    const m = await freshHistory();
    const { setCrayonOptions } = await import('./crayonBrush');
    setCrayonOptions({ passes: [{ widthScale: 2, coverage: 1 }] });
    const op = cmd('#wax').ops[0] as PathOp;
    op.crayon = true;
    // pad = (8/2)×2 + 2 = 10 (vs 6 at base width): span 0..1 grows to 0..11.
    expect(m.foldRegionsForCommands([{ ops: [op], wasEmpty: false }], 64, 64)).toEqual([
      { x: 0, y: 0, w: 11, h: 11 },
    ]);
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
    expect(liveRasters).toBe(2);
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
