import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./crayonBrush', () => ({
  crayonPassCount: () => 1,
  crayonPassWidthScale: () => 1,
  crayonPatternFor: () => null,
  getCrayonMix: () => 0.5,
}));

import {
  crayonBufferIsDirty,
  flushCrayonBuffer,
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
      save() {},
      restore() {},
      setTransform() {},
      getTransform: () => new DOMMatrix(),
      clearRect() {},
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

describe('tiled crayon pass buffers', () => {
  it('shows preview canvases only while their pass is dirty', () => {
    const target = context2d();
    const buffer = context2d();
    const mirror = context2d();
    setCrayonBufferForTarget(target, buffer, mirror);

    expect(buffer.canvas.hidden).toBe(true);
    expect(mirror.canvas.hidden).toBe(true);

    renderOp(target, crayonDot());

    expect(crayonBufferIsDirty(target)).toBe(true);
    expect(buffer.canvas.hidden).toBe(false);
    expect(mirror.canvas.hidden).toBe(false);

    renderOp(target, { kind: 'crayonFlush' });

    expect(crayonBufferIsDirty(target)).toBe(false);
    expect(buffer.canvas.hidden).toBe(true);
    expect(mirror.canvas.hidden).toBe(true);
  });

  it('unions all transformed corners when flushing a pass', () => {
    const target = context2d();
    const matrix = new DOMMatrix([1, 1, 1, -1, 100, 100]);
    (target as unknown as { getTransform: () => DOMMatrix }).getTransform = () => matrix;

    renderOp(target, crayonDot({ x: 10, y: 10, radius: 5 }));
    flushCrayonBuffer(target);

    const calls = (target as unknown as { drawImageCalls: unknown[][] }).drawImageCalls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const [source, sx, sy, sw, sh, dx, dy, dw, dh] = call;
      expect(source).toBeInstanceOf(HTMLCanvasElement);
      expect([sx, sy, sw, sh, dx, dy, dw, dh]).toEqual([106, 86, 28, 28, 106, 86, 28, 28]);
    }
  });
});
