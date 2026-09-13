import type { Component } from 'svelte';
import { getPlatform } from '$lib/platform';

// Android system Back and back gesture (ADR-0165). iOS has no system Back, and the web keeps the
// browser's own history Back, so everything behind this gate loads only in the Android app: the
// __IS_CAPACITOR__ literal drops the import() from the web bundle at build time.
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
  }
  return () => {
    stopped = true;
    stopListening();
  };
}
