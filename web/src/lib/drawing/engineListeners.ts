import { listen } from './listenerRegistry';
import type { ListenWindowFn } from './penStreamQuirks';

interface EngineListenerHandlers {
  handleResize: () => void;
  refreshCanvasRect: () => void;
  resyncOnReentry: () => void;
  startDrawing: (event: PointerEvent) => void;
  draw: (event: PointerEvent) => void;
  stopDrawing: (event: PointerEvent) => void;
  finishPenCanvasExit: (event: PointerEvent) => void;
  trackPenCanvasExit: (event: PointerEvent) => void;
  cancelTouch: (event: TouchEvent) => void;
  registerPenListeners: (listen: ListenWindowFn) => void;
}

export function registerDrawingEngineListeners(
  removers: Array<() => void>,
  canvas: HTMLCanvasElement,
  handlers: EngineListenerHandlers
) {
  listen(removers, window, 'resize', handlers.handleResize);
  // Scroll/orientation move the canvas in the viewport without resizing it, so
  // refresh the cached rect (left/top) without the full backing-store rebuild.
  listen(removers, window, 'scroll', handlers.refreshCanvasRect, true);
  listen(removers, window, 'orientationchange', handlers.refreshCanvasRect);
  // The paper view keys off the Screen Orientation angle. Resize usually lands
  // after the angle updates, but ordering is not guaranteed everywhere. Older
  // WebViews can expose screen.orientation without the listener API.
  const screenOrientation = window.screen?.orientation;
  if (typeof screenOrientation?.addEventListener === 'function') {
    listen(removers, screenOrientation, 'change', handlers.handleResize);
  }
  // Browser visibility covers hidden tabs; Capacitor's Android WebView stays
  // `visible` while its Activity is backgrounded and reports re-entry through
  // Cordova's document-level resume event instead.
  listen(removers, document, 'visibilitychange', handlers.resyncOnReentry);
  if (__IS_CAPACITOR__) listen(removers, document, 'resume', handlers.resyncOnReentry);
  listen(removers, canvas, 'pointerdown', handlers.startDrawing);
  listen(removers, canvas, 'pointermove', handlers.draw);
  listen(removers, canvas, 'pointerup', handlers.stopDrawing);
  listen(removers, canvas, 'pointerout', (event) => {
    handlers.trackPenCanvasExit(event);
    handlers.stopDrawing(event);
  });
  listen(removers, canvas, 'pointercancel', handlers.stopDrawing);
  listen(removers, window, 'pointerdown', handlers.finishPenCanvasExit, true);
  listen(removers, window, 'pointerup', handlers.finishPenCanvasExit, true);
  listen(removers, window, 'pointercancel', handlers.finishPenCanvasExit, true);
  // iPadOS Scribble claims an Apple Pencil stroke that starts soon after a pen
  // tap: pointer events still arrive and the engine paints, but the system never
  // presents those frames. Cancelling the parallel TOUCH stream is the only
  // working release; preventDefault on pointer events is documented and
  // confirmed on-device not to help. Non-passive on purpose. The palette needs
  // the same treatment through the scribbleGuard action.
  listen(removers, canvas, 'touchstart', handlers.cancelTouch, { passive: false });
  listen(removers, canvas, 'touchmove', handlers.cancelTouch, { passive: false });
  handlers.registerPenListeners((type, handler, capture) =>
    listen(removers, window, type, handler, capture)
  );
}
