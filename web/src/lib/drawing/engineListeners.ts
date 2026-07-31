import { listen } from './listenerRegistry';
import type { ListenWindowFn } from './penStreamQuirks';

interface EngineListenerHandlers {
  handleResize: () => void;
  refreshCanvasRect: () => void;
  resyncOnReentry: () => void;
  startDrawing: (event: PointerEvent) => void;
  draw: (event: PointerEvent) => void;
  stopDrawing: (event: PointerEvent) => void;
  cancelTouch: (event: TouchEvent) => void;
  registerPenListeners: (listen: ListenWindowFn) => void;
}

export function registerDrawingEngineListeners(
  removers: Array<() => void>,
  canvas: HTMLCanvasElement,
  handlers: EngineListenerHandlers
) {
  listen(removers, window, 'resize', handlers.handleResize);
  // Scroll and orientation can move the canvas without resizing it.
  listen(removers, window, 'scroll', handlers.refreshCanvasRect, true);
  listen(removers, window, 'orientationchange', handlers.refreshCanvasRect);
  // The orientation angle can settle after resize; either signal must recompute the view.
  const screenOrientation = window.screen?.orientation;
  if (typeof screenOrientation?.addEventListener === 'function') {
    listen(removers, screenOrientation, 'change', handlers.handleResize);
  }
  // Backgrounded rotations emit neither signal, so visibility restores the missed state.
  listen(removers, document, 'visibilitychange', handlers.resyncOnReentry);
  listen(removers, canvas, 'pointerdown', handlers.startDrawing);
  listen(removers, canvas, 'pointermove', handlers.draw);
  listen(removers, canvas, 'pointerup', handlers.stopDrawing);
  listen(removers, canvas, 'pointerout', handlers.stopDrawing);
  listen(removers, canvas, 'pointercancel', handlers.stopDrawing);
  // Cancelling the parallel touch stream is what releases iPadOS Scribble's pen claim.
  listen(removers, canvas, 'touchstart', handlers.cancelTouch, { passive: false });
  listen(removers, canvas, 'touchmove', handlers.cancelTouch, { passive: false });
  handlers.registerPenListeners((type, handler, capture) =>
    listen(removers, window, type, handler, capture)
  );
}
