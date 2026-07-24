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
  renderOp,
  closeLiveCrayonPass,
  hasOpenLiveCrayonPass,
  type StrokeOp,
} from './strokeOps';

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
      save() {},
      restore() {},
      setTransform() {},
      clearRect() {},
      drawImage() {},
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

function crayonDot(): StrokeOp {
  return { kind: 'dot', x: 100, y: 100, radius: 8, color: '#ff0000', erase: false, crayon: true };
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
});
