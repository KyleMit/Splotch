import type { Component } from 'svelte';
import { getPlatform } from '$lib/platform';
import { canvasState } from '$lib/state/canvas.svelte';

const webCanvasEmptyListeners = new Set<(empty: boolean) => void>();

export function syncBackNavigationCanvas(empty: boolean): void {
  if (!__IS_CAPACITOR__) {
    for (const listener of webCanvasEmptyListeners) listener(empty);
  }
}

// Native Android keeps ADR-0165's plugin path. Browser/PWA Back is a separate history-backed
// implementation; the __IS_CAPACITOR__ literal keeps each handler out of the other build.
export function installSystemBack(mountOverlay: (overlay: Component) => void): () => void {
  let stopped = false;
  let stopListening = () => {};
  if (__IS_CAPACITOR__ && getPlatform() === 'android') {
    import('./systemBackHandler')
      .then(({ LeaveConfirm, listenForSystemBack }) => {
        if (stopped) return;
        mountOverlay(LeaveConfirm);
        stopListening = listenForSystemBack();
      })
      .catch((err) => console.error('System Back handler failed to load:', err));
  } else if (!__IS_CAPACITOR__) {
    import('./webBackHandler')
      .then(({ installWebBackHandler }) => {
        if (stopped) return;
        const handler = installWebBackHandler();
        webCanvasEmptyListeners.add(handler.setCanvasEmpty);
        handler.setCanvasEmpty(canvasState.canvasEmpty);
        stopListening = () => {
          webCanvasEmptyListeners.delete(handler.setCanvasEmpty);
          handler.stop();
        };
      })
      .catch((err) => console.error('Web Back handler failed to load:', err));
  }
  return () => {
    stopped = true;
    stopListening();
  };
}
