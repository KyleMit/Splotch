import { browser } from '$app/environment';

import { TABLET_MIN_SIDE_PX } from '../breakpoints';

// Every display mode that drops the browser chrome. A typo here evaluates to
// false and quietly drops that mode from isStandalone().
const APP_LIKE_DISPLAY_MODE_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
] as const;

// A hand-held device rather than a monitor: the primary input is a finger, so
// the screen itself can turn. `pointer` reports the primary pointer only, which
// is why a touchscreen laptop driven by its mouse does not match.
const COARSE_POINTER_QUERY = '(pointer: coarse)';

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
  return (
    APP_LIKE_DISPLAY_MODE_QUERIES.some((query) => window.matchMedia?.(query).matches) ||
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

/** An Android browser on the Chromium engine: Chrome, and the browsers and
 *  WebViews built on it, which all carry a `Chrome/` token. Firefox does not. */
export function isAndroidChromium(): boolean {
  return isAndroidBrowser() && /\bChrome\/\d/.test(navigator.userAgent || '');
}

// Best-effort friendly OS name from a user-agent string. Pure display sugar — on
// the web the raw UA is sent alongside it, so a miss here loses nothing.
export function osLabelFromUserAgent(ua: string): string {
  if (!ua) return '';
  const android = ua.match(/Android ([0-9.]+)/);
  if (android) return `Android ${android[1]}`;
  const ios = ua.match(/(?:iPhone|iPad|iPod).*?OS ([0-9_]+)/);
  if (ios) return `iOS ${ios[1].replace(/_/g, '.')}`;
  const mac = ua.match(/Mac OS X ([0-9_]+)/);
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`;
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  const win = ua.match(/Windows NT ([0-9.]+)/);
  if (win) return `Windows (NT ${win[1]})`;
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

export type Platform = 'android' | 'ios' | 'web';

export type Orientation = 'portrait' | 'landscape';

type OrientationLockMembers = {
  lock?: (orientation: Orientation) => Promise<void>;
  unlock?: () => void;
};

// lib.dom declares both members as required on ScreenOrientation, but no WebKit
// build ships either, so the optional shape is the honest one at this boundary.
// They are omitted before being re-added: an intersection cannot weaken a member
// the other side requires, so intersecting the optional shape straight onto
// ScreenOrientation would still promise callers members that are always there.
// The omitted keys come from `keyof` rather than a written-out pair, so adding a
// member to the shape above cannot leave the required original behind it — and
// deferredIcons.test.ts reads a quoted icon name in any source file as that file
// rendering the icon, which a literal pair here would trip. One declaration
// serves both readers of it: the capability check below and the call in
// `lib/platform/orientation.ts`.
export type LockableScreenOrientation = Omit<ScreenOrientation, keyof OrientationLockMembers> &
  OrientationLockMembers;

export function getPlatform(): Platform {
  if (!browser) return 'web';
  const platform = globalThis.Capacitor?.getPlatform?.();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
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
 * probe above).
 *
 * On the web the question is instead whether this browser, on this device, can
 * turn anything, and two independent facts have to hold:
 *  - The Screen Orientation API's `lock()` has to exist. No WebKit build ships
 *    it — MDN's compatibility data records `version_added: false` for Safari and
 *    Safari iOS — so no browser on iOS or iPadOS, all of which run WebKit, can
 *    ever honor the choice.
 *  - The primary pointer has to be coarse, i.e. a device held in a hand rather
 *    than a monitor on a desk, because a screen that cannot physically turn has
 *    nothing for a lock to do. The capability check alone would not catch that:
 *    desktop Chrome exposes `lock()` and always throws `NotSupportedError`, and
 *    Firefox implements it for real from 144 — for the devices that can rotate.
 *    The pointer is also what makes the picker reappear under a browser's
 *    mobile-device emulation, which is where it gets tested.
 *
 * Necessary, not sufficient — a `lock()` that exists can still refuse, and two
 * such browsers stay inside this repo's floor: Chrome on Android honors a lock
 * only in fullscreen or an installed app, and Firefox for Android 114-143
 * exposes one that always fails. The picker renders there and the choice
 * persists, because a narrower gate would hide a control that becomes
 * functional the moment the user hits the Fullscreen toggle. Instead
 * `applyDeviceOrientationPreference` keys a web lock on the fullscreen state
 * `routes/+page.svelte` passes it, so a lock the tab refused is requested
 * again on entering fullscreen and after each re-entry. An installed app needs
 * no retry: it launches as its own document, which applies the preference at
 * boot. Firefox's always-failing `lock()` stays unapplied until it ages out of
 * the floor.
 *
 * A behavioral probe is not an option here either: headless Chromium resolves
 * `lock()` on a desktop viewport, and the call is async besides.
 */
export function supportsOrientationLock(): boolean {
  if (!browser) return false;
  if (!isNative()) {
    return (
      typeof (window.screen.orientation as LockableScreenOrientation | undefined)?.lock ===
        'function' && window.matchMedia?.(COARSE_POINTER_QUERY).matches === true
    );
  }
  return Math.min(window.screen.width, window.screen.height) < TABLET_MIN_SIDE_PX;
}
