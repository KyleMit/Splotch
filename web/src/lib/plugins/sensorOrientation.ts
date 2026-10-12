import { registerPlugin } from '@capacitor/core';

export interface SensorOrientationPlugin {
  // Rotates with the accelerometer (three orientations, never upside-down portrait) even when the
  // device's own Auto-rotate toggle is off.
  followSensor(): Promise<void>;
}

// Android-only (SensorOrientationPlugin.java): iOS exposes no way past the Control Center rotation
// lock, so it keeps @capacitor/screen-orientation's unlock(). Import this module only behind
// `__IS_CAPACITOR__` so @capacitor/core stays out of the web bundle.
export const SensorOrientation = registerPlugin<SensorOrientationPlugin>('SensorOrientation');
