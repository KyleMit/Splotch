import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StrokeGroupCommand, PathOp } from './strokeOps';

// happy-dom's <canvas> has no 2D context, so install a recording stub: each
// canvas's "content" is the ordered list of stroke colors painted onto it,
// drawImage copies a source canvas's content, and clearRect empties it. Giving
// every command a unique color makes a canvas's content the drawing's
// ground-truth in draw order — enough to assert both the keyframe-memory bound
// and that undo/rebuild reproduce the exact pixels.
let origGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
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
function cmd(color: string, segs: number): StrokeGroupCommand {
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
    // Without the cap all ten retained commands would hold a baseline-sized
    // keyframe (~300 MB worst case); the cap keeps it at one.
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
