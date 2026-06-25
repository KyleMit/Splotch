import { registerPlugin } from '@capacitor/core';

export interface DeviceLockPlugin {
  // True when Guided Access (iOS) or App Pinning / lock-task mode (Android) is active.
  isLocked(): Promise<{ locked: boolean }>;
}

// The web has no way to observe either OS lock state, so its fallback is always false.
// Reach this module only through lazyPluginModule() so @capacitor/core stays out of the
// SSR/prerender graph — see web/src/lib/nativePlugin.ts.
export const DeviceLock = registerPlugin<DeviceLockPlugin>('DeviceLock', {
  web: () => ({ isLocked: async () => ({ locked: false }) }),
});
