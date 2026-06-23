import { browser } from '$app/environment';

// Capacitor injects a global `Capacitor` object both in the native runtime and
// once @capacitor/core is loaded on the web. We read it off the global rather
// than importing @capacitor/core here so this module stays safe to evaluate
// during SSR/prerender (Node), where no such global exists.

/** True only when running inside a native Capacitor shell (Android/iOS). */
export function isNative(): boolean {
  return browser && globalThis.Capacitor?.isNativePlatform?.() === true;
}

export type Platform = 'android' | 'ios' | 'web';

export function getPlatform(): Platform {
  if (!browser) return 'web';
  return (globalThis.Capacitor?.getPlatform?.() ?? 'web') as Platform;
}
