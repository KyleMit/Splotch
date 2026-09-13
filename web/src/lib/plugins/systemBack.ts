import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface SystemBackPlugin {
  // Fires for each system Back press or back gesture while a listener is attached.
  addListener(eventName: 'back', listenerFunc: () => void): Promise<PluginListenerHandle>;
  // Sends the app behind the home screen without finishing the activity.
  moveToBackground(): Promise<void>;
}

// Android-only (SystemBackPlugin.java), so there is no web fallback: iOS has no system Back and
// the web keeps the browser's own. Reach this module only through lazyPluginModule() so
// @capacitor/core stays out of the SSR/prerender graph — see web/src/lib/nativePlugin.ts.
export const SystemBack = registerPlugin<SystemBackPlugin>('SystemBack');
