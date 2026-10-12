import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCanvasRasterFlush } from './canvasRasterFlush';

const platform = vi.hoisted(() => ({ android: true, native: false }));
vi.mock('$lib/platform', () => ({
  isAndroidChromium: () => platform.android,
  isNative: () => platform.native,
}));

function fakeWebGl(events: string[], lost = false) {
  const state = { lost };
  return {
    COLOR_BUFFER_BIT: 0x4000,
    loseContext: () => (state.lost = true),
    isContextLost: () => state.lost,
    clear: () => events.push('clear'),
    flush: () => events.push('flush'),
  } as unknown as WebGLRenderingContext & { loseContext: () => void };
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

  it('only runs the work outside Android Chromium', () => {
    platform.android = false;
    createCanvasRasterFlush()(() => events.push('work'));

    platform.android = true;
    platform.native = true;
    createCanvasRasterFlush()(() => events.push('work'));

    expect(events).toEqual(['work', 'work']);
  });

  it('replaces a context lost after an earlier fold', () => {
    const contexts: ReturnType<typeof fakeWebGl>[] = [];
    getContext.mockImplementation((kind: string) => {
      events.push(`create:${kind}`);
      const context = fakeWebGl(events);
      contexts.push(context);
      return context as unknown as RenderingContext;
    });
    const withCanvasRasterFlush = createCanvasRasterFlush();

    withCanvasRasterFlush(() => events.push('work'));
    contexts[0].loseContext();
    withCanvasRasterFlush(() => events.push('work'));

    expect(events).toEqual([
      'create:webgl',
      'work',
      'clear',
      'flush',
      'create:webgl',
      'work',
      'clear',
      'flush',
    ]);
  });

  it('keeps retrying when a replacement after a loss is refused', () => {
    const contexts: ReturnType<typeof fakeWebGl>[] = [];
    let available = true;
    getContext.mockImplementation((kind: string) => {
      events.push(`create:${kind}`);
      if (!available) return null;
      const context = fakeWebGl(events);
      contexts.push(context);
      return context as unknown as RenderingContext;
    });
    const withCanvasRasterFlush = createCanvasRasterFlush();

    withCanvasRasterFlush(() => events.push('work'));
    contexts[0].loseContext();
    available = false;
    withCanvasRasterFlush(() => events.push('work'));
    available = true;
    withCanvasRasterFlush(() => events.push('work'));

    expect(events).toEqual([
      'create:webgl',
      'work',
      'clear',
      'flush',
      'create:webgl',
      'work',
      'create:webgl',
      'work',
      'clear',
      'flush',
    ]);
  });

  it('does not ask again after WebGL is refused', () => {
    getContext.mockImplementation(() => null);
    const withCanvasRasterFlush = createCanvasRasterFlush();

    withCanvasRasterFlush(() => events.push('work'));
    withCanvasRasterFlush(() => events.push('work'));

    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it('still runs the work when WebGL is unavailable or lost', () => {
    getContext.mockImplementation(() => null);
    createCanvasRasterFlush()(() => events.push('work'));

    getContext.mockImplementation(() => fakeWebGl(events, true) as unknown as RenderingContext);
    createCanvasRasterFlush()(() => events.push('work'));

    expect(events).toEqual(['work', 'work']);
  });
});
