import { expect, it, vi } from 'vitest';

import { registerDrawingEngineListeners } from './engineListeners';

it('tracks a pen canvas exit before stopping its active pointer', () => {
  const removers: Array<() => void> = [];
  const canvas = document.createElement('canvas');
  const pointeroutCalls: string[] = [];

  registerDrawingEngineListeners(removers, canvas, {
    handleResize: vi.fn(),
    refreshCanvasRect: vi.fn(),
    resyncOnReentry: vi.fn(),
    startDrawing: vi.fn(),
    draw: vi.fn(),
    stopDrawing: () => pointeroutCalls.push('stopDrawing'),
    trackPenCanvasExit: () => pointeroutCalls.push('trackPenCanvasExit'),
    cancelTouch: vi.fn(),
    registerPenListeners: vi.fn(),
  });

  try {
    canvas.dispatchEvent(new Event('pointerout'));

    expect(pointeroutCalls).toEqual(['trackPenCanvasExit', 'stopDrawing']);
  } finally {
    for (const remove of removers) remove();
  }
});
