import { browser } from '$app/environment';
import { isNative } from '$lib/platform';

// Splotch fills the screen with a non-scrolling canvas, so a mobile browser's
// URL bar never gets the downward scroll that would normally minimize it and
// just sits there eating vertical space. The Fullscreen API is the only
// standards-based way to reclaim it in a plain browser tab — and only on
// Android, where requestFullscreen() on the document element gives true
// immersive mode (URL bar *and* system nav gone).
//
// Deliberately narrow:
//   • iOS Safari (iPhone) has no element fullscreen at all — document
//     .fullscreenEnabled is false there — so this is a silent no-op and the
//     honest iOS path stays "Add to Home Screen" (see SetupInstructions).
//   • Desktop is excluded: yanking a tab into fullscreen on the first click is
//     hostile, and the URL-bar squeeze only matters on phones anyway.
//   • The native shell already runs fullscreen, so isNative() opts out.
function canRequestImmersiveFullscreen(): boolean {
  if (!browser || isNative()) return false;
  if (!document.fullscreenEnabled) return false;
  if (document.fullscreenElement) return false;
  return /android/i.test(navigator.userAgent || '');
}

// MUST be called from within a user gesture (the first pointerdown) — browsers
// reject a fullscreen request without one. Failures are swallowed: an
// unsupported or refused request just leaves the URL bar where it was.
export async function requestImmersiveFullscreen(): Promise<void> {
  if (!canRequestImmersiveFullscreen()) return;
  try {
    await document.documentElement.requestFullscreen();
  } catch {}
}
