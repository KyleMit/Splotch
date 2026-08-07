import { beforeEach, describe, expect, it } from 'vitest';

import { createCanvasMeasure, rectIsMeasured } from './canvasMeasure';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height }) as DOMRect;

function harness(viewport = { width: 600, height: 400 }) {
  const canvas = document.createElement('canvas');
  return {
    canvas,
    measure: createCanvasMeasure({ canvas: () => canvas, viewport: () => viewport }),
  };
}

describe('rectIsMeasured', () => {
  it('accepts a rect with area', () => {
    expect(rectIsMeasured(rect(0, 0, 300, 200))).toBe(true);
  });

  it.each([
    ['no width', rect(0, 0, 0, 200)],
    ['no height', rect(0, 0, 300, 0)],
    ['neither', rect(0, 0, 0, 0)],
  ])('refuses a rect with %s', (_label, unmeasured) => {
    expect(rectIsMeasured(unmeasured)).toBe(false);
  });
});

describe('createCanvasMeasure', () => {
  let measure: ReturnType<typeof harness>['measure'];

  beforeEach(() => {
    measure = harness().measure;
    measure.refresh(rect(20, 10, 300, 200));
  });

  it('maps a pointer through the cached rect and the viewport scale', () => {
    // viewport 600×400 over a 300×200 box: two backing pixels per CSS pixel.
    expect(measure.toScreen({ clientX: 20, clientY: 10 } as PointerEvent)).toEqual({ x: 0, y: 0 });
    expect(measure.toScreen({ clientX: 170, clientY: 110 } as PointerEvent)).toEqual({
      x: 300,
      y: 200,
    });
  });

  it('keeps the last real rect when handed one with no area', () => {
    // The origin is the part that would silently break: a zero rect has none,
    // so caching it would shift every later pointer by the canvas position.
    measure.refresh(rect(0, 0, 0, 0));

    expect(measure.rect).toEqual({ left: 20, top: 10, width: 300, height: 200 });
    expect(measure.toScreen({ clientX: 20, clientY: 10 } as PointerEvent)).toEqual({ x: 0, y: 0 });
  });

  it('refuses to build from a rect with no area, and accepts one with area', () => {
    expect(measure.accept(rect(0, 0, 0, 0), () => {})).toBe(false);
    expect(measure.accept(rect(0, 0, 300, 200), () => {})).toBe(true);
  });

  it('arms the deferred re-measure only once while it stays unmeasured', () => {
    const { canvas, measure: fresh } = harness();
    let observed = 0;
    canvas.getBoundingClientRect = () => rect(0, 0, 0, 0);
    const RealResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(_callback: ResizeObserverCallback) {}
      observe() {
        observed++;
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;

    try {
      fresh.accept(rect(0, 0, 0, 0), () => {});
      fresh.accept(rect(0, 0, 0, 0), () => {});
      expect(observed).toBe(1);
    } finally {
      globalThis.ResizeObserver = RealResizeObserver;
    }
  });
});
