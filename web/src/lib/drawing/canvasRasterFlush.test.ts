import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCanvasRasterFlush } from './canvasRasterFlush';

const platform = vi.hoisted(() => ({ android: true, native: false }));
vi.mock('$lib/platform', () => ({
  isAndroidBrowser: () => platform.android,
  isNative: () => platform.native,
}));

function fakeWebGl(events: string[], lost = false) {
  return {
    COLOR_BUFFER_BIT: 0x4000,
    isContextLost: () => lost,
    clear: () => events.push('clear'),
    flush: () => events.push('flush'),
  } as unknown as WebGLRenderingContext;
}

describe('createCanvasRasterFlush', () => {
  let events: string[];
  let getContext: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    platform.android = true;
    platform.native = false;
    events = [];
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((kind: string) => {
        events.push(`create:${kind}`);
        return fakeWebGl(events) as unknown as RenderingContext;
      });
  });

  afterEach(() => getContext.mockRestore());

  it('creates the flush context before the work and flushes after it', () => {
    const withCanvasRasterFlush = createCanvasRasterFlush();

    withCanvasRasterFlush(() => events.push('work'));

    expect(events).toEqual(['create:webgl', 'work', 'clear', 'flush']);
  });

  it('reuses one context across folds', () => {
    const withCanvasRasterFlush = createCanvasRasterFlush();

    withCanvasRasterFlush(() => events.push('work'));
    withCanvasRasterFlush(() => events.push('work'));

    expect(events.filter((event) => event.startsWith('create'))).toHaveLength(1);
    expect(events.filter((event) => event === 'flush')).toHaveLength(2);
  });

  it('only runs the work outside Android Chrome', () => {
    platform.android = false;
    createCanvasRasterFlush()(() => events.push('work'));

    platform.android = true;
    platform.native = true;
    createCanvasRasterFlush()(() => events.push('work'));

    expect(events).toEqual(['work', 'work']);
  });

  it('still runs the work when WebGL is unavailable or lost', () => {
    getContext.mockImplementation(() => null);
    createCanvasRasterFlush()(() => events.push('work'));

    getContext.mockImplementation(() => fakeWebGl(events, true) as unknown as RenderingContext);
    createCanvasRasterFlush()(() => events.push('work'));

    expect(events).toEqual(['work', 'work']);
  });
});
