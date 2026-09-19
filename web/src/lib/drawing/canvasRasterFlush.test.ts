import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ android: true }));
vi.mock('$lib/platform', () => ({ isAndroidBrowser: () => platform.android }));

function fakeWebGl(events: string[], lost = false) {
  return {
    COLOR_BUFFER_BIT: 0x4000,
    isContextLost: () => lost,
    clear: () => events.push('clear'),
    flush: () => events.push('flush'),
  } as unknown as WebGLRenderingContext;
}

async function freshModule() {
  vi.resetModules();
  return import('./canvasRasterFlush');
}

describe('withCanvasRasterFlush', () => {
  let events: string[];
  let getContext: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    platform.android = true;
    events = [];
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((kind: string) => {
        events.push(`create:${kind}`);
        return fakeWebGl(events) as unknown as RenderingContext;
      });
  });

  afterEach(() => getContext.mockRestore());

  it('creates the flush context before the work and flushes after it', async () => {
    const { withCanvasRasterFlush } = await freshModule();

    withCanvasRasterFlush(() => events.push('work'));

    expect(events).toEqual(['create:webgl', 'work', 'clear', 'flush']);
  });

  it('reuses one context across folds', async () => {
    const { withCanvasRasterFlush } = await freshModule();

    withCanvasRasterFlush(() => events.push('work'));
    withCanvasRasterFlush(() => events.push('work'));

    expect(events.filter((event) => event.startsWith('create'))).toHaveLength(1);
    expect(events.filter((event) => event === 'flush')).toHaveLength(2);
  });

  it('only runs the work outside Android', async () => {
    platform.android = false;
    const { withCanvasRasterFlush } = await freshModule();

    withCanvasRasterFlush(() => events.push('work'));

    expect(events).toEqual(['work']);
  });

  it('still runs the work when WebGL is unavailable or lost', async () => {
    getContext.mockImplementation(() => null);
    const unavailable = await freshModule();
    unavailable.withCanvasRasterFlush(() => events.push('work'));

    getContext.mockImplementation(() => fakeWebGl(events, true) as unknown as RenderingContext);
    const lost = await freshModule();
    lost.withCanvasRasterFlush(() => events.push('work'));

    expect(events).toEqual(['work', 'work']);
  });
});
