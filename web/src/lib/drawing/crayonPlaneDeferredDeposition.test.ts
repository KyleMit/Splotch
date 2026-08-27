import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./crayonBrush', () => ({
  crayonPassCount: () => 1,
  crayonPassWidthScale: () => 1,
  crayonPatternFor: () => null,
  getCrayonMix: () => 0.5,
}));

import {
  configureCrayonDeposition,
  crayonBufferIsDirty,
  resetCrayonStateForClear,
  setCrayonBufferForTarget,
} from './crayonPassBuffer';
import { renderOp, type StrokeOp } from './strokeOps';

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    kind: string
  ) {
    if (kind !== '2d') return null;
    const canvas = this as HTMLCanvasElement & { _ctx?: unknown };
    if (canvas._ctx) return canvas._ctx;
    const context = {
      canvas,
      lineCap: '',
      lineJoin: '',
      globalCompositeOperation: '',
      globalAlpha: 1,
      drawImageCalls: [] as unknown[][],
      readCalls: [] as unknown[][],
      save() {},
      restore() {},
      setTransform() {},
      getTransform: () => new DOMMatrix(),
      clearRect() {},
      getImageData(...args: unknown[]) {
        this.readCalls.push(args);
        return {};
      },
      drawImage(...args: unknown[]) {
        this.drawImageCalls.push(args);
      },
    };
    canvas._ctx = context;
    return context;
  };
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.unstubAllGlobals();
});

function context2d(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  return canvas.getContext('2d')! as unknown as CanvasRenderingContext2D;
}

// A live tile as the renderer presents one: a normal ink context plus the
// paired preview planes registered as the pass buffer and its mirror.
function planeTile() {
  const target = context2d();
  const buffer = context2d();
  const mirror = context2d();
  setCrayonBufferForTarget(target, buffer, mirror);
  return { target, buffer, mirror };
}

function blits(context: CanvasRenderingContext2D) {
  return (context as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
}

function reads(context: CanvasRenderingContext2D) {
  return (context as unknown as { readCalls: unknown[][] }).readCalls;
}

function crayonDot(overrides: Partial<Extract<StrokeOp, { kind: 'dot' }>> = {}): StrokeOp {
  return {
    kind: 'dot',
    x: 100,
    y: 100,
    radius: 8,
    color: '#ff0000',
    erase: false,
    crayon: true,
    ...overrides,
  };
}

function captureFrames() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  return {
    runAll() {
      while (frames.length) frames.shift()!(0);
    },
    get pending() {
      return frames.length;
    },
  };
}

describe('plane deposition with the bake deferred', () => {
  it('bakes nothing into the tile at a mid-stroke seed boundary', () => {
    configureCrayonDeposition('planes-deferred');
    const { target, buffer } = planeTile();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: false });

    // The whole cost this pipeline exists to remove: a checkpoint must not
    // touch the composited tile. The pass stays open on the planes instead,
    // which is what keeps the live preview exact.
    expect(blits(target)).toHaveLength(0);
    expect(crayonBufferIsDirty(target)).toBe(true);
    expect(buffer.canvas.hidden).toBe(false);
  });

  it('keeps the planes showing the pass until the post-lift bake lands', () => {
    configureCrayonDeposition('planes-deferred');
    const frames = captureFrames();
    const { target, buffer, mirror } = planeTile();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: true });

    // Nothing has moved yet: the tile is untouched and BOTH planes are still
    // composited, so the frames between the lift and the settle show exactly
    // what the frames before the lift showed.
    expect(blits(target)).toHaveLength(0);
    expect(buffer.canvas.hidden).toBe(false);
    expect(mirror.canvas.hidden).toBe(false);

    frames.runAll();

    // The swap: the tile gains the glaze as the planes retire, in one turn.
    expect(blits(target)).toHaveLength(2);
    expect(buffer.canvas.hidden).toBe(true);
    expect(mirror.canvas.hidden).toBe(true);
  });

  it('forces a readback after the deferred bake, between strokes', () => {
    configureCrayonDeposition('planes-deferred');
    const frames = captureFrames();
    const { target } = planeTile();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: true });
    expect(reads(target)).toHaveLength(0);

    frames.runAll();

    // T8 measured that deferring the bake WITHOUT this merely relocates its
    // cost onto the next stroke's undo capture, in contact (3.5% against
    // 0.37% once a read forces the flush here, between strokes).
    expect(reads(target)).toHaveLength(1);
    expect(reads(target)[0].slice(2)).toEqual([1, 1]);
  });

  it('lands a pending bake before a new pass opens on the same planes', () => {
    configureCrayonDeposition('planes-deferred');
    captureFrames();
    const { target } = planeTile();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: true });
    expect(blits(target)).toHaveLength(0);

    // A second stroke arriving before the settle shares one plane pair, so the
    // earlier pass has to bake first — otherwise the new wax would join it on
    // the buffer and the two would be glazed as a single pass.
    renderOp(target, crayonDot({ x: 40, y: 40, radius: 5 }));

    expect(blits(target)).toHaveLength(2);
  });
});

describe('a deferred bake disarmed by an undo or a clear', () => {
  it('retires BOTH preview planes, not just the buffer', () => {
    configureCrayonDeposition('planes-deferred');
    captureFrames();
    const { target, buffer, mirror } = planeTile();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: true });

    // Undo replaces the tile's pixels while the bake is still pending, so the
    // pending wax is discarded. Both planes are composited over that tile —
    // leaving either one up shows a ghost of the undone stroke.
    resetCrayonStateForClear(target);

    expect(buffer.canvas.hidden).toBe(true);
    expect(mirror.canvas.hidden).toBe(true);
    expect(blits(target)).toHaveLength(0);
  });
});
