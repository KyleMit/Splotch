import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./crayonBrush', () => ({
  crayonPassCount: () => 1,
  crayonPassWidthScale: () => 1,
  crayonPatternFor: () => ({}) as CanvasPattern,
  getCrayonMix: () => 0.55,
  getPerOpGlazeReturn: () => 0.1,
}));

import { configureCrayonDeposition } from './crayonPassBuffer';
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
      // (composite, alpha) for every paint the op issued, in order.
      paints: [] as [string, number][],
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
        this.paints.push([this.globalCompositeOperation, this.globalAlpha]);
      },
      stroke() {
        this.paints.push([this.globalCompositeOperation, this.globalAlpha]);
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

const paintsOf = (c: CanvasRenderingContext2D) =>
  (c as unknown as { paints: [string, number][] }).paints;
const blitsOf = (c: CanvasRenderingContext2D) =>
  (c as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;

describe('the glaze applied per op, directly on the tile', () => {
  it('issues the shipped glaze arithmetic — darken, then the crayon colour at 1-mix', () => {
    configureCrayonDeposition('glaze-direct');
    const target = context2d();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));

    // Same two steps as the two-blit stamp. The second step's alpha is the
    // PER-OP return, not the pass-cadence `1 - mix`: reusing that here compounds
    // across a stroke's overlapping ops and was measured on the device as a
    // crossing that kept its green only at the single-op fringe.
    expect(paintsOf(target)).toEqual([
      ['darken', 1],
      ['source-over', 0.1],
    ]);
  });

  it('never blits, so nothing touches the composited tile but the paint', () => {
    configureCrayonDeposition('glaze-direct');
    const target = context2d();

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    renderOp(target, crayonDot({ x: 20, y: 20, radius: 5 }));
    renderOp(target, { kind: 'crayonFlush' });

    expect(blitsOf(target)).toHaveLength(0);
  });
});

// The property that killed the m=1 candidate on 2026-08-27. Drawing blue over
// yellow must eventually reach blue if a child keeps drawing; min() is a fixed
// point and never does, which reads as the crayon refusing to work. Stated as
// arithmetic because it is a requirement on the GLAZE, not on any one pipeline.
//
// The blue channel of blue #62A2E9 over yellow #F9D24F is where the mixing
// happens: the crayon is LIGHTER than the ink there, so min() has something to
// hold the pixel down at. The other two channels are already at the crayon's
// value and mix trivially.
describe('repeated passes must converge on the new crayon colour', () => {
  const S = 0xe9; // blue channel of the crayon
  const D = 0x4f; // blue channel of the ink underneath
  const glaze = (mix: number, under: number) => (1 - mix) * S + mix * Math.min(S, under);

  it('the shipped mix walks the channel to the crayon colour', () => {
    const seen: number[] = [];
    let value = D;
    for (let pass = 0; pass < 20; pass++) {
      value = glaze(0.55, value);
      seen.push(value);
    }
    // Monotone toward S, and it actually arrives rather than stalling short.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen[0]).toBeGreaterThan(D);
    expect(Math.round(seen.at(-1)!)).toBe(S);
  });

  it('a fully subtractive mix sticks on the first pass and never moves again', () => {
    const first = glaze(1, D);
    // min(S, min(S,D)) === min(S,D), so redrawing cannot make progress.
    expect(glaze(1, first)).toBe(first);
    expect(first).toBe(D);
    expect(first).not.toBe(S);
  });
});
