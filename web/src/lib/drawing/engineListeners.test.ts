import { afterEach, expect, it, vi } from 'vitest';

import {
  registerDrawingEngineListeners,
  createResizeListener,
  RESIZE_SETTLE_MS,
} from './engineListeners';

afterEach(() => vi.useRealTimers());

it('refreshes resize geometry immediately and settles only the last event', () => {
  vi.useFakeTimers();
  const refresh = vi.fn();
  const settle = vi.fn();
  const listener = createResizeListener(refresh, settle);
  listener.handleResize();
  vi.advanceTimersByTime(RESIZE_SETTLE_MS - 1);
  listener.handleResize();
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(settle).not.toHaveBeenCalled();
  vi.advanceTimersByTime(RESIZE_SETTLE_MS);
  expect(settle).toHaveBeenCalledOnce();
  listener.handleResize();
  listener.dispose();
  vi.advanceTimersByTime(RESIZE_SETTLE_MS);
  expect(settle).toHaveBeenCalledOnce();
});

function listenerHandlers(pointeroutCalls: string[], trackPenCanvasExit: () => void) {
  return {
    handleResize: vi.fn(),
    refreshCanvasRect: vi.fn(),
    resyncOnReentry: vi.fn(),
    startDrawing: vi.fn(),
    draw: vi.fn(),
    stopDrawing: () => pointeroutCalls.push('stopDrawing'),
    finishPenCanvasExit: () => pointeroutCalls.push('finishPenCanvasExit'),
    trackPenCanvasExit,
    cancelTouch: vi.fn(),
    registerPenListeners: vi.fn(),
  };
}

it('tracks a pen canvas exit before the engine stops its active pointer', () => {
  const removers: Array<() => void> = [];
  const canvas = document.createElement('canvas');
  const pointeroutCalls: string[] = [];

  registerDrawingEngineListeners(
    removers,
    canvas,
    listenerHandlers(pointeroutCalls, () => {
      pointeroutCalls.push('trackPenCanvasExit');
    })
  );

  try {
    canvas.dispatchEvent(new Event('pointerout'));

    expect(pointeroutCalls).toEqual(['trackPenCanvasExit', 'stopDrawing']);
  } finally {
    for (const remove of removers) remove();
  }
});

it('registers the document resume listener in the native test build', () => {
  const removers: Array<() => void> = [];
  const canvas = document.createElement('canvas');
  const handlers = listenerHandlers([], vi.fn());
  registerDrawingEngineListeners(removers, canvas, handlers);

  try {
    document.dispatchEvent(new Event('resume'));

    expect(handlers.resyncOnReentry).toHaveBeenCalledOnce();
  } finally {
    for (const remove of removers) remove();
  }
});

it('routes a canvas box resize through the settled resize path and stops observing on teardown', () => {
  const RealResizeObserver = globalThis.ResizeObserver;
  const observed: Element[] = [];
  let notify: ResizeObserverCallback | undefined;
  let disconnected = false;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      notify = callback;
    }
    observe(target: Element) {
      observed.push(target);
    }
    unobserve() {}
    disconnect() {
      disconnected = true;
    }
  } as unknown as typeof ResizeObserver;
  const removers: Array<() => void> = [];
  const canvas = document.createElement('canvas');
  const handlers = listenerHandlers([], vi.fn());

  try {
    registerDrawingEngineListeners(removers, canvas, handlers);
    notify?.([], {} as ResizeObserver);

    expect(observed).toEqual([canvas]);
    expect(handlers.handleResize).toHaveBeenCalledOnce();
  } finally {
    for (const remove of removers) remove();
    globalThis.ResizeObserver = RealResizeObserver;
  }
  expect(disconnected).toBe(true);
});

it.each(['pointerdown', 'pointerup', 'pointercancel'] as const)(
  'finishes a suspended pen from a window %s',
  (eventType) => {
    const removers: Array<() => void> = [];
    const canvas = document.createElement('canvas');
    const calls: string[] = [];

    registerDrawingEngineListeners(removers, canvas, listenerHandlers(calls, vi.fn()));

    try {
      window.dispatchEvent(new Event(eventType));

      expect(calls).toEqual(['finishPenCanvasExit']);
    } finally {
      for (const remove of removers) remove();
    }
  }
);
