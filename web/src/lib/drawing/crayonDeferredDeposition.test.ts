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
  flushCrayonBuffer,
  noteCrayonTargetBlank,
  resetCrayonStateForClear,
  setCrayonUnderProvider,
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
      save() {},
      restore() {},
      setTransform() {},
      getTransform: () => new DOMMatrix(),
      clearRect() {},
      getImageData: () => ({}),
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
});

function context2d(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  return canvas.getContext('2d')! as unknown as CanvasRenderingContext2D;
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

describe('deferred deposition (the WKWebView pipeline, ADR-0147)', () => {
  it('paints the target directly per op and stamps nothing while the pass is open', () => {
    configureCrayonDeposition('deferred');
    const target = context2d();
    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));

    // Direct pattern strokes only — zero blits, the WKWebView's expensive
    // primitive (its ablation put per-op blits at 1.76-2.12% lost against
    // 0.02% for direct paint).
    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
    expect(calls).toHaveLength(0);
  });

  it('stashes the glaze at close and stamps it two frames after the lift', () => {
    configureCrayonDeposition('deferred');
    // Present as a live tile: the under comes from the undo system's patch
    // snapshot, and a final close stashes for the post-lift frames.
    const patch = document.createElement('canvas');
    patch.width = 300;
    patch.height = 300;
    setCrayonUnderProvider(() => ({ kind: 'patch', canvas: patch }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const target = context2d();
    const matrix = new DOMMatrix([1, 1, 1, -1, 100, 100]);
    (target as unknown as { getTransform: () => DOMMatrix }).getTransform = () => matrix;

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;

    // A mid-stroke checkpoint/split is a seed boundary: no stamp, pass open.
    renderOp(target, { kind: 'crayonFlush', final: false });
    expect(calls).toHaveLength(0);
    expect(crayonBufferIsDirty(target)).toBe(true);

    // The FINAL flush stashes: nothing lands on the composited target inside
    // the contact window — the stamp waits for the post-lift frames.
    renderOp(target, { kind: 'crayonFlush', final: true });
    expect(calls).toHaveLength(0);
    while (frames.length) frames.shift()!(0);

    // The settle: the under restore plus the two glaze blits, every one
    // covering the pass's transformed corner union.
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      const [source, sx, sy, sw, sh, dx, dy, dw, dh] = call;
      expect(source).toBeInstanceOf(HTMLCanvasElement);
      expect([sx, sy, sw, sh, dx, dy, dw, dh]).toEqual([106, 86, 28, 28, 106, 86, 28, 28]);
    }
    vi.unstubAllGlobals();
  });

  it('a virgin pass closes without any stamp — the direct wax already is the glaze', () => {
    configureCrayonDeposition('deferred');
    const target = context2d();
    noteCrayonTargetBlank(target);

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    flushCrayonBuffer(target);

    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
    expect(calls).toHaveLength(0);
    expect(crayonBufferIsDirty(target)).toBe(false);
  });

  it('a reset cancels a stamp still pending, so undone pixels cannot reappear', () => {
    configureCrayonDeposition('deferred');
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const patch = document.createElement('canvas');
    patch.width = 300;
    patch.height = 300;
    setCrayonUnderProvider(() => ({ kind: 'patch', canvas: patch }));

    const target = context2d();
    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: true });

    // Undo/clear/repaint all replace the tile's pixels through this reset. The
    // pass is already closed (not dirty), so cancellation cannot depend on the
    // dirty flag.
    resetCrayonStateForClear(target);
    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
    while (frames.length) frames.shift()!(0);
    expect(calls).toHaveLength(0);
  });

  it('a cancelled pass leaves no wax behind for the next pass to stamp', () => {
    configureCrayonDeposition('deferred');
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const patch = document.createElement('canvas');
    patch.width = 300;
    patch.height = 300;
    setCrayonUnderProvider(() => ({ kind: 'patch', canvas: patch }));

    const target = context2d();
    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: true });
    resetCrayonStateForClear(target);
    while (frames.length) frames.shift()!(0);

    // The cancelled pass's wax must be gone from the buffer, not merely
    // unscheduled: the next pass stamps its own bounds out of that buffer.
    renderOp(target, crayonDot({ x: 200, y: 200, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush', final: true });
    while (frames.length) frames.shift()!(0);

    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
    // Only the second pass's own rect is restored+stamped (3 blits), all of
    // them over its own bounds — never the cancelled pass's rect.
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      const [, sx, sy] = call as [unknown, number, number];
      expect(sx).toBeGreaterThan(100);
      expect(sy).toBeGreaterThan(100);
    }
  });

  it('a direct flush closes synchronously for export and foreign-op ordering', () => {
    configureCrayonDeposition('deferred');
    const target = context2d();
    const matrix = new DOMMatrix([1, 1, 1, -1, 100, 100]);
    (target as unknown as { getTransform: () => DOMMatrix }).getTransform = () => matrix;

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    flushCrayonBuffer(target);

    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
    expect(calls).toHaveLength(3);
    expect(crayonBufferIsDirty(target)).toBe(false);
  });
});
