import { registerPlugin } from '@capacitor/core';

export interface AppSettingsPlugin {
  // Opens this app's own page in the device Settings, where the photo-library (iOS) or storage
  // (Android 7–9) permission a save needs can be granted.
  open(): Promise<void>;
}

// Native-only (AppSettingsPlugin.java, AppSettingsPlugin.swift): a web save never needs an OS
// permission, so nothing on the web offers to open Settings. Import this module only behind
// `__IS_CAPACITOR__` so @capacitor/core stays out of the web bundle.
export const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings');
