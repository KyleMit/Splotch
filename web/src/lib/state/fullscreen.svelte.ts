import { browser } from '$app/environment';
import { isAndroidBrowser, isNative, isStandalone } from '$lib/platform';

// Splotch fills the screen with a non-scrolling canvas, so a mobile browser's
// URL bar never gets the downward scroll that would normally minimize it and
// just sits there eating vertical space. The Fullscreen API is the only
// standards-based way to reclaim it in a plain browser tab — and only on
// Android, where requestFullscreen() on the document element gives true
// immersive mode (URL bar *and* system nav gone).
//
// This is surfaced as an opt-in toggle (the Fullscreen Toggle button), never
// auto-triggered: entering/exiting fullscreen flashes the system chrome, so the
// only acceptable place to pay that flicker is a deliberate tap.
//
// Deliberately narrow:
//   • iOS Safari (iPhone) has no element fullscreen at all — document
//     .fullscreenEnabled is false there — so `supported` stays false and no
//     toggle appears; the honest iOS path stays "Add to Home Screen".
//   • Desktop is excluded: the URL-bar squeeze only matters on phones, and the
//     browser's own F11 already covers desktop.
//   • The native shell already runs fullscreen, so isNative() opts out.
//   • An installed PWA (standalone/fullscreen display mode) has no URL bar to
//     reclaim, so isStandalone() opts out — the toggle only earns its place in a
//     plain browser tab.
function fullscreenSupported(): boolean {
  if (!browser || isNative() || isStandalone()) return false;
  if (!document.fullscreenEnabled) return false;
  return isAndroidBrowser();
}

export const fullscreen = $state({
  // Whether to surface the toggle at all (Android web browsers only).
  supported: false,
  // Whether the document is currently in immersive fullscreen.
  active: false,
});

let initialized = false;

// Web-only; seeds `supported` and keeps `active` in sync with the platform. The
// browser can drop out of fullscreen on its own (Esc, the back gesture, a
// permissions change), so `active` must track the real state, not our requests.
export function initFullscreen() {
  if (!browser || initialized) return;
  initialized = true;

  fullscreen.supported = fullscreenSupported();
  if (!fullscreen.supported) return;

  const sync = () => {
    fullscreen.active = document.fullscreenElement !== null;
  };
  sync();
  document.addEventListener('fullscreenchange', sync);
}

// Enter immersive fullscreen (dismissing the URL bar) or exit back out. MUST be
// called from a user gesture — a button click carries the transient activation
// requestFullscreen() needs. Failures are swallowed: a refused request just
// leaves the chrome where it was.
export async function toggleFullscreen() {
  if (!fullscreen.supported) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {}
}
