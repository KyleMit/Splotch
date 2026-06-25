import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative, getPlatform } from '$lib/platform';
import { impactThreshold } from '$lib/haptics';
import { toggleEraser } from '$lib/state/tool.svelte';
import { settings, setApplePencilSeen } from '$lib/state/settings.svelte';

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

// Runs on every Apple Pencil double-tap. It always records that a pencil exists on this
// device — which is what reveals the parent's on/off toggle — then toggles the eraser only
// when the parent hasn't disabled the gesture. Detection is recorded even while disabled so
// the toggle stays available for re-enabling.
export function handleDoubleTap(): void {
  if (!settings.applePencilSeen) setApplePencilSeen(true);
  if (!settings.pencilEraserEnabled) return;
  toggleEraser();
  impactThreshold();
}

// Subscribe to Apple Pencil double-taps. No-ops off iOS-native. Returns a cleanup that
// detaches the listener; safe to call before the async subscription resolves.
export function initPencilEraser(): () => void {
  if (!isNative() || getPlatform() !== 'ios') return () => {};

  let handle: PluginListenerHandle | undefined;
  let removed = false;

  PencilEraser.addListener('doubleTap', handleDoubleTap).then((h) => {
    if (removed) h.remove();
    else handle = h;
  });

  return () => {
    removed = true;
    handle?.remove();
  };
}
