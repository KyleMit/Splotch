import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative, getPlatform } from '$lib/platform';
import { impactThreshold } from '$lib/haptics';
import { toggleEraser } from '$lib/state/tool.svelte';

export interface PencilEraserPlugin {
  // Fires each time an Apple Pencil (gen 2 / Pro) double-tap is detected natively.
  addListener(
    eventName: 'doubleTap',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
}

// Reach this module only through lazyPluginModule() so @capacitor/core stays out of the
// SSR/prerender graph — see web/src/lib/nativePlugin.ts. The gesture is iOS-native only, so
// the web fallback's listener is inert (the bridge is never started off iOS anyway).
export const PencilEraser = registerPlugin<PencilEraserPlugin>('PencilEraser', {
  web: () => ({
    addListener: async () => ({ remove: async () => {} })
  })
});

// Subscribe to Apple Pencil double-taps and toggle the eraser, mirroring the on-screen
// eraser button (with a haptic tick for confirmation). No-ops off iOS-native. Returns a
// cleanup that detaches the listener; safe to call before the async subscription resolves.
export function initPencilEraser(): () => void {
  if (!isNative() || getPlatform() !== 'ios') return () => {};

  let handle: PluginListenerHandle | undefined;
  let removed = false;

  PencilEraser.addListener('doubleTap', () => {
    toggleEraser();
    impactThreshold();
  }).then((h) => {
    if (removed) h.remove();
    else handle = h;
  });

  return () => {
    removed = true;
    handle?.remove();
  };
}
