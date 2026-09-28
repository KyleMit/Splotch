import { registerPlugin } from '@capacitor/core';

export interface DeviceLockPlugin {
  // True when Guided Access (iOS) or App Pinning / lock-task mode (Android) is active.
  isLocked(): Promise<{ locked: boolean }>;
}

// Native-only (DeviceLockPlugin.java, DeviceLockPlugin.swift): the web cannot observe either lock,
// so SetupInstructions.svelte asks only inside a native shell and reads a failed call as unlocked.
// Import this module only behind `__IS_CAPACITOR__` so @capacitor/core stays out of the web bundle.
export const DeviceLock = registerPlugin<DeviceLockPlugin>('DeviceLock');
