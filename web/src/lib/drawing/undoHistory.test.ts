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
// ground-truth in draw order — enough to assert both the keyframe-memory bound
// and that undo/rebuild reproduce the exact pixels.
let origGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  magicSheet.ready = true;
  origGetContext = HTMLCanvasElement.prototype.getContext;
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
        if (src?._content) canvas._content!.push(...src._content);
      },
    };
    canvas._ctx = ctx;
    return ctx;
  };
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = origGetContext;
  vi.resetModules();
});

// A single-stroke command in a unique color. `segs` controls its replay cost so
// the caller can push it over the keyframe threshold on demand.
function cmd(color: string, segs: number, magic = false): StrokeGroupCommand {
  const s = Array.from({ length: segs }, (_, i) => ({ cx: i, cy: i, x: i + 1, y: i + 1 }));
  const op: PathOp = {
    kind: 'path',
    pid: 1,
    startX: 0,
    startY: 0,
    segs: s,
    color,
    lineWidth: 8,
    erase: false,
    brush: magic ? 'magic' : 'pen',
  };
  return { ops: [op], wasEmpty: false };
}

async function freshHistory() {
  vi.resetModules();
  const m = await import('./undoHistory');
  const cs = await import('./commandSimplify');
  // Keep ops verbatim (no segment reduction) so segment counts and colors stay
  // exactly what the test sets.
  cs.setSimplifyOptions({ enabled: false });
  m.ensureBaselineCovers(64);
  return m;
}

// The color sequence a fresh rebuild paints — the visible drawing, ground-truth.
function rebuiltContent(m: Awaited<ReturnType<typeof freshHistory>>): string[] {
  const target = document.createElement('canvas');
  target.width = 64;
  target.height = 64;
  const ctx = target.getContext('2d')!;
  m.replayAll(ctx);
  return [...(target as unknown as { _content: string[] })._content];
}

const PATHOLOGICAL = 5;
const CHEAP = 1;

describe('keyframe memory bound', () => {
  it('retains at most one keyframe raster no matter how many outlier commands commit', async () => {
    const m = await freshHistory();
    m.setKeyframeSegmentThreshold(2);
    const colors = Array.from({ length: 30 }, (_, i) => `#kf${i}`);
    for (const c of colors) m.pushCommand(cmd(c, PATHOLOGICAL));
    // Without the cap every retained command (up to MAX_UNDO_STACK_SIZE) would
    // hold a baseline-sized keyframe (~600 MB worst case); the cap keeps it at
    // one.
    expect(m.getHistoryDebug().keyframes).toBeLessThanOrEqual(1);
    // Bounding memory must not lose pixels: the surviving keyframe accumulates
    // the whole drawing, so a rebuild still shows every command in order.
    expect(rebuiltContent(m)).toEqual(colors);
  });

  it('does not fold when commands stay under the keyframe threshold', async () => {
    const m = await freshHistory();
    m.setKeyframeSegmentThreshold(100);
    for (let i = 0; i < 5; i++) m.pushCommand(cmd(`#c${i}`, CHEAP));
    expect(m.getHistoryDebug().keyframes).toBe(0);
    expect(m.getHistoryDebug().commands).toBe(5);
  });
});

describe('fold boundary at the undo cap', () => {
  it('retains exactly MAX_UNDO_STACK_SIZE commands and folds the overflow into the baseline', async () => {
    const m = await freshHistory();
    const colors = Array.from({ length: m.MAX_UNDO_STACK_SIZE + 3 }, (_, i) => `#s${i}`);
    for (const c of colors) m.pushCommand(cmd(c, CHEAP));
    expect(m.getHistoryDebug().commands).toBe(m.MAX_UNDO_STACK_SIZE);
    // Folding is invisible: the rebuild still shows every command in order.
    expect(rebuiltContent(m)).toEqual(colors);
  });

  it('a log exactly at the cap folds nothing — undoing everything reaches blank', async () => {
    const m = await freshHistory();
    const colors = Array.from({ length: m.MAX_UNDO_STACK_SIZE }, (_, i) => `#s${i}`);
    for (const c of colors) m.pushCommand(cmd(c, CHEAP));
    expect(m.getHistoryDebug().commands).toBe(m.MAX_UNDO_STACK_SIZE);
    while (m.popCommand());
    expect(rebuiltContent(m)).toEqual([]);
  });

  it('undoing past the cap stops at the folded baseline, not a blank canvas', async () => {
    const m = await freshHistory();
    const colors = Array.from({ length: m.MAX_UNDO_STACK_SIZE + 2 }, (_, i) => `#s${i}`);
    for (const c of colors) m.pushCommand(cmd(c, CHEAP));
    let undos = 0;
    while (m.popCommand()) undos++;
    expect(undos).toBe(m.MAX_UNDO_STACK_SIZE);
    // The two overflow commands survive in the baseline — that's the wall the
    // undo button hits.
    expect(rebuiltContent(m)).toEqual(colors.slice(0, 2));
  });
});

describe('undo correctness after folding through a keyframe', () => {
  it('rebuild reproduces the full drawing across multiple keyframes', async () => {
    const m = await freshHistory();
    m.setKeyframeSegmentThreshold(2);
    // Two outlier commands with a cheap one between them — the second outlier's
    // keyframe folds the first through the baseline.
    m.pushCommand(cmd('#a', PATHOLOGICAL));
    m.pushCommand(cmd('#b', CHEAP));
    m.pushCommand(cmd('#c', PATHOLOGICAL));
    expect(m.getHistoryDebug().keyframes).toBeLessThanOrEqual(1);
    // Every color still shows, in order: folding preserved the first keyframe's
    // pixels in the baseline rather than dropping them.
    expect(rebuiltContent(m)).toEqual(['#a', '#b', '#c']);
  });

  it('popping the newest keyframe repaints the prior state from the baseline', async () => {
    const m = await freshHistory();
    m.setKeyframeSegmentThreshold(2);
    m.pushCommand(cmd('#a', PATHOLOGICAL));
    m.pushCommand(cmd('#b', CHEAP));
    m.pushCommand(cmd('#c', PATHOLOGICAL));
    // Undo the newest keyframed command; the older keyframe was folded into the
    // baseline, so the rebuild must still show it plus the surviving middle op.
    const popped = m.popCommand();
    expect(popped?.keyframe).toBeTruthy();
    expect(rebuiltContent(m)).toEqual(['#a', '#b']);
  });

  it('interleaved cheap and outlier commands rebuild identically to a no-keyframe replay', async () => {
    // Reference: same command stream with keyframes disabled (pure op replay).
    const ref = await freshHistory();
    ref.setKeyframeSegmentThreshold(Infinity);
    const colors = ['#1', '#2', '#3', '#4', '#5', '#6'];
    for (const c of colors) ref.pushCommand(cmd(c, PATHOLOGICAL));
    const expected = rebuiltContent(ref);

    const m = await freshHistory();
    m.setKeyframeSegmentThreshold(2);
    for (const c of colors) m.pushCommand(cmd(c, PATHOLOGICAL));
    expect(m.getHistoryDebug().keyframes).toBeLessThanOrEqual(1);
    expect(rebuiltContent(m)).toEqual(expected);
  });
});

describe('folding while the magic sheet decodes', () => {
  it('retains an oldest magic command until its paint can be replayed', async () => {
    const m = await freshHistory();
    m.setKeyframeSegmentThreshold(Infinity);
    magicSheet.ready = false;
    m.pushCommand(cmd('#ignored', CHEAP, true));
    // Enough solid commands to push the magic one past the cap, so a fold is
    // attempted (and must be deferred) while the sheet is still decoding.
    const solidColors = Array.from({ length: m.MAX_UNDO_STACK_SIZE }, (_, i) => `#solid${i}`);
    for (const color of solidColors) m.pushCommand(cmd(color, CHEAP));

    magicSheet.ready = true;

    expect(rebuiltContent(m)).toEqual(['#magic', ...solidColors]);
  });

  it('does not build a cumulative keyframe that omits pending magic ink', async () => {
    const m = await freshHistory();
    m.setKeyframeSegmentThreshold(2);
    magicSheet.ready = false;
    m.pushCommand(cmd('#ignored', CHEAP, true));
    m.pushCommand(cmd('#solid', PATHOLOGICAL));

    magicSheet.ready = true;

    expect(m.getHistoryDebug().keyframes).toBe(0);
    expect(rebuiltContent(m)).toEqual(['#magic', '#solid']);
  });
});
