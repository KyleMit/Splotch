import { expect, it, vi } from 'vitest';

import { registerDrawingEngineListeners } from './engineListeners';

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

it('resyncs the drawing surface on Capacitor resume', () => {
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
