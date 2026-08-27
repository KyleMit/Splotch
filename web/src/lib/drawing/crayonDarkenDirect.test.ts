import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./crayonBrush', () => ({
  crayonPassCount: () => 2,
  crayonPassWidthScale: () => 1,
  crayonPatternFor: () => ({}) as CanvasPattern,
  getCrayonMix: () => 0.55,
}));

import { configureCrayonDeposition, crayonDepositsOnTiles } from './crayonPassBuffer';
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
      lineWidth: 1,
      strokeStyle: '' as unknown,
      fillStyle: '' as unknown,
      drawImageCalls: [] as unknown[][],
      // Every composite mode the op was painted under, in order.
      paintComposites: [] as string[],
      save() {},
      restore() {},
      setTransform() {},
      getTransform: () => new DOMMatrix(),
      clearRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      bezierCurveTo() {},
      arc() {},
      closePath() {},
      getImageData: () => ({}),
      fill() {
        this.paintComposites.push(this.globalCompositeOperation);
      },
      stroke() {
        this.paintComposites.push(this.globalCompositeOperation);
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

function composites(context: CanvasRenderingContext2D) {
  return (context as unknown as { paintComposites: string[] }).paintComposites;
}

function blits(context: CanvasRenderingContext2D) {
  return (context as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
}

describe('the idempotent glaze (darken painted straight onto the tile)', () => {
  it('paints every density pass with darken, so overdraw is a fixed point', () => {
    configureCrayonDeposition('darken-direct');
    const target = context2d();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));

    // min(S, min(S,D)) = min(S,D). Painting with anything else — the shipped
    // source-over wax, or a partial-alpha lerp — compounds across the
    // overlapping per-frame ops of one pass, which is the whole reason the
    // other pipelines need a buffer to accumulate on.
    expect(composites(target)).toHaveLength(2);
    expect(new Set(composites(target))).toEqual(new Set(['darken']));
  });

  it('never blits, so nothing touches the composited tile but the paint itself', () => {
    configureCrayonDeposition('darken-direct');
    const target = context2d();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, crayonDot({ x: 20, y: 20, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush' });

    // The measured poison on the WKWebView: a blit involving the composited
    // tile, priced per bake-EVENT regardless of blend mode, blit count,
    // direction or area. This pipeline issues none at all.
    expect(blits(target)).toHaveLength(0);
  });

  it('deposits on tiles, so the renderer shows them like any ink op', () => {
    configureCrayonDeposition('darken-direct');
    // With no accumulation surface there is nothing to preview from; the tile
    // must be visible for the op or the wax is painted into a hidden canvas.
    expect(crayonDepositsOnTiles()).toBe(true);
  });
});
