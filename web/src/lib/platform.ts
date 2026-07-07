import { browser } from '$app/environment';

// Capacitor injects a global `Capacitor` object both in the native runtime and
// once @capacitor/core is loaded on the web. We read it off the global rather
// than importing @capacitor/core here so this module stays safe to evaluate
// during SSR/prerender (Node), where no such global exists.

/** True only when running inside a native Capacitor shell (Android/iOS). */
export function isNative(): boolean {
  return browser && globalThis.Capacitor?.isNativePlatform?.() === true;
}

/**
 * True when the web app is running as an installed PWA — any app-like display
 * mode, where the browser chrome (URL bar) is already gone. iOS Safari reports
 * this through the legacy `navigator.standalone` flag rather than the
 * `display-mode` media queries.
 *
 * This is a pure display-mode read and is independent of `isNative()`: the
 * native Capacitor shell runs chrome-free too, so callers that care about "is
 * there any browser chrome to reclaim" should also check `isNative()`.
 */
export function isStandalone(): boolean {
  if (!browser) return false;
  return !!(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * UA-based iOS device sniff, for web code deciding which OS's instructions
 * apply. iPadOS 13+ masquerades as desktop Safari, so a touch-capable "Mac"
 * counts as an iPad.
 */
export function isIosDevice(): boolean {
  if (!browser) return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** UA-based Android sniff, for web code deciding which OS's instructions apply. */
export function isAndroidBrowser(): boolean {
  return browser && /android/i.test(navigator.userAgent || '');
}

export type Platform = 'android' | 'ios' | 'web';

export function getPlatform(): Platform {
  if (!browser) return 'web';
  return (globalThis.Capacitor?.getPlatform?.() ?? 'web') as Platform;
}

/**
 * Whether the app may force its own device orientation.
 *
 * iPadOS 26 deprecated `UIRequiresFullScreen` and moved iPad apps to the
 * windowing model: a windowed app "can always rotate" and the OS owns
 * orientation through its own window chrome, ignoring any in-app lock (Apple
 * TN3192). Trying to lock there just floats a letterboxed window, so we hide the
 * orientation toggles and stop calling lock() wherever the OS owns orientation.
 *
 * Why approximate instead of asking the OS directly:
 *  - Not build-time: one CAPACITOR=true bundle ships in both the iPhone and iPad
 *    binaries, so this can't be a compile-time constant — it's a per-device fact.
 *  - No native capability to query: UIKit exposes the lock *state*
 *    (UIWindowScene.isInterfaceOrientationLocked) and a lock *request*
 *    (prefersInterfaceOrientationLocked), but no "is this scene windowed / can it
 *    be locked" boolean. Per Apple DTS, on iPad even setting the request is
 *    ignored. The only authoritative-and-future-proof signal is behavioral —
 *    request a lock and observe via didUpdateEffectiveGeometry whether it
 *    actually took — which needs a custom plugin and is async (Capacitor calls
 *    return Promises), so it can't back a synchronous render-time check like this.
 *  - A native idiom plugin (userInterfaceIdiom == .pad) would be exact, but it
 *    classifies by "is iPad," so it's no more future-proof than this heuristic
 *    for a hypothetical windowed iPhone — it just trades a screen-size guess for
 *    a device-class one, at the cost of native code + an async call.
 *
 * So we approximate "OS owns orientation" as a tablet-class device, read from the
 * physical screen's smaller side (not the resizable window) so a small iPad
 * window doesn't read as a phone. Every shipping iPhone is fullscreen-only and
 * stays well under 600 CSS px even in landscape, so the split is clean today; if
 * Apple ever brings windowing to the iPhone, revisit this (likely the behavioral
 * probe above). Web is left as-is (best-effort lock).
 */
export function supportsOrientationLock(): boolean {
  if (!browser) return false;
  if (!isNative()) return true;
  return Math.min(window.screen.width, window.screen.height) < 600;
}
