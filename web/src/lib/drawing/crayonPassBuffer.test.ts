import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// paintCrayon builds a wax pattern from an offscreen tile canvas — machinery
// this seam test doesn't care about. Stub crayonPatternFor to null so paintCrayon
// no-ops (no tile canvas / getImageData), while keeping a nonzero mix so
// renderCrayonOp takes the buffered-pass path (not the mix-0 direct paint).
vi.mock('./crayonBrush', () => ({
  crayonPassCount: () => 1,
  crayonPassWidthScale: () => 1,
  crayonPatternFor: () => null,
  getCrayonMix: () => 0.5,
}));

import {
  setLiveCrayonBuffer,
  setCrayonPaperSpace,
  closeLiveCrayonPass,
  hasOpenLiveCrayonPass,
  flushCrayonBuffer,
} from './crayonPassBuffer';
import { AA_PAD } from './opGeometry';
import { renderOp, type StrokeOp } from './strokeOps';

// happy-dom's <canvas> has no 2D context; install a no-op recording stub so the
// buffer/paper canvases the render path allocates behave like real contexts for
// the bookkeeping we assert on (dirty flags + bounds). Same approach as
// undoHistory.test.ts.
let origGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  origGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    kind: string
  ) {
    if (kind !== '2d') return null;
    const canvas = this as HTMLCanvasElement & { _ctx?: unknown };
    if (canvas._ctx) return canvas._ctx;
    const ctx = {
      canvas,
      lineCap: '',
      lineJoin: '',
      globalCompositeOperation: '',
      globalAlpha: 1,
      // Recorded so tests can assert the exact source/dest rect a caller
      // passed drawImage — the crop/blit math itself, not just its bookkeeping.
      drawImageCalls: [] as unknown[][],
      save() {},
      restore() {},
      setTransform() {},
      getTransform: () => new DOMMatrix(),
      clearRect() {},
      drawImage(...args: unknown[]) {
        this.drawImageCalls.push(args);
      },
    };
    canvas._ctx = ctx;
    return ctx;
  };
  // Clean module-singleton state before each case.
  setLiveCrayonBuffer(null, null);
  setCrayonPaperSpace(0);
});

afterEach(() => {
  setLiveCrayonBuffer(null, null);
  setCrayonPaperSpace(0);
  HTMLCanvasElement.prototype.getContext = origGetContext;
});

function ctx2d(): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 300;
  return c.getContext('2d')! as unknown as CanvasRenderingContext2D;
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

describe('live crayon paper-space seam', () => {
  it('accumulates a live crayon op into paper space while a paper size is registered', () => {
    const target = ctx2d();
    const buffer = ctx2d();
    setLiveCrayonBuffer(target, buffer);
    setCrayonPaperSpace(256);

    renderOp(target, crayonDot());

    expect(hasOpenLiveCrayonPass()).toBe(true);
    // A registered paper size means the pass accumulated a closable raster.
    expect(closeLiveCrayonPass()).not.toBeNull();
  });

  it('setLiveCrayonBuffer(null, null) resets the paper size, so a re-mounted engine has no paper-space accumulation until it re-declares one', () => {
    const target = ctx2d();
    const buffer = ctx2d();
    setLiveCrayonBuffer(target, buffer);
    setCrayonPaperSpace(256);

    // Teardown, exactly as teardownEngine does: this must also clear the stale
    // paper size, not just the buffers.
    setLiveCrayonBuffer(null, null);

    // A fresh mount re-registers the overlay buffers but has NOT yet called
    // setCrayonPaperSpace (resizeCanvas does that on the real mount path).
    setLiveCrayonBuffer(target, buffer);
    renderOp(target, crayonDot());

    // The overlay pass is open (the op painted the live buffer)...
    expect(hasOpenLiveCrayonPass()).toBe(true);
    // ...but livePaperSide is back to 0, so nothing landed in paper space and
    // there is no raster to close. Before the reset seam this returned a raster.
    expect(closeLiveCrayonPass()).toBeNull();
  });

  it("clamps the closed raster to the registered paper square, not the op's unclamped extent", () => {
    const target = ctx2d();
    const buffer = ctx2d();
    setLiveCrayonBuffer(target, buffer);
    setCrayonPaperSpace(64);

    // radius 5 + AA_PAD pads the bbox to [-pad, pad] around x=0, so the left
    // edge runs off the paper square and must be clamped to 0.
    const pad = 5 + AA_PAD;
    renderOp(target, crayonDot({ x: 0, y: 32, radius: 5 }));

    const raster = closeLiveCrayonPass();

    expect(raster).not.toBeNull();
    expect(raster!.x).toBe(0);
    expect(raster!.y).toBe(32 - pad);
    expect(raster!.canvas.width).toBe(pad);
    expect(raster!.canvas.height).toBe(2 * pad);

    // The crop itself: the 9-arg drawImage that fills the returned canvas must
    // read the clamped rect from the paper buffer and write it at the
    // destination's origin — not some swapped or unclamped rect.
    const recorded = (raster!.canvas.getContext('2d') as unknown as { drawImageCalls: unknown[][] })
      .drawImageCalls;
    expect(recorded).toHaveLength(1);
    const [source, sx, sy, sw, sh, dx, dy, dw, dh] = recorded[0];
    expect(source).toBeInstanceOf(HTMLCanvasElement);
    expect([sx, sy, sw, sh, dx, dy, dw, dh]).toEqual([
      0,
      32 - pad,
      pad,
      2 * pad,
      0,
      0,
      pad,
      2 * pad,
    ]);
  });

  it('drops an op painted entirely off the registered paper square, leaving no raster to close', () => {
    const target = ctx2d();
    const buffer = ctx2d();
    setLiveCrayonBuffer(target, buffer);
    setCrayonPaperSpace(64);

    // radius 5 + AA_PAD pads the bbox to [-107, -93] on x — entirely left of
    // the paper square, so unionCrayonBounds' empty-rect guard must drop it
    // rather than growing bounds to a zero/negative-width rect.
    renderOp(target, crayonDot({ x: -100, y: 32, radius: 5 }));

    expect(closeLiveCrayonPass()).toBeNull();
  });

  it('grows the closed raster to cover the union of two non-overlapping crayon ops', () => {
    const target = ctx2d();
    const buffer = ctx2d();
    setLiveCrayonBuffer(target, buffer);
    setCrayonPaperSpace(256);

    const pad = 5 + AA_PAD;
    renderOp(target, crayonDot({ x: 20, y: 20, radius: 5 }));
    renderOp(target, crayonDot({ x: 200, y: 200, radius: 5 }));

    const raster = closeLiveCrayonPass();

    expect(raster).not.toBeNull();
    expect(raster!.x).toBe(20 - pad);
    expect(raster!.y).toBe(20 - pad);
    expect(raster!.canvas.width).toBe(200 + pad - (20 - pad));
    expect(raster!.canvas.height).toBe(200 + pad - (20 - pad));
  });

  it('unions transformed corners, not the untransformed bbox, under a non-identity target transform', () => {
    // Not registered as the live buffer: this exercises the general
    // crayonBufferFor(target) path, where the transform unioned is whatever
    // the target ctx reports — unlike the live paper-space buffer, which is
    // always painted through an identity transform.
    const target = ctx2d();
    const matrix = new DOMMatrix([2, 0, 0, 2, 10, 20]);
    (target as unknown as { getTransform: () => DOMMatrix }).getTransform = () => matrix;

    // Dot at (10, 10), radius 5 -> padded user-space bbox [3, 3]..[17, 17].
    // Transformed corners (x' = 2x + 10, y' = 2y + 20) union to [16, 26]..[44, 54].
    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    flushCrayonBuffer(target);

    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
    // stampSubtractiveGlaze blits the same rect twice (darken pass, then the
    // 1-mix source-over pass).
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const [source, sx, sy, sw, sh, dx, dy, dw, dh] = call;
      expect(source).toBeInstanceOf(HTMLCanvasElement);
      expect([sx, sy, sw, sh, dx, dy, dw, dh]).toEqual([16, 26, 28, 28, 16, 26, 28, 28]);
    }
  });
});
