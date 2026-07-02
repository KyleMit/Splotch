import { browser } from '$app/environment';
import { isNative } from '$lib/platform';
import { readBool, writeBool } from '$lib/storage';

// "Add to Home Screen" / PWA install, surfaced as a friendly parent-facing prompt.
//
// Two worlds, deliberately different (see ADR-0038):
//   • Chromium (Android, desktop Chrome/Edge) fires `beforeinstallprompt`. We
//     intercept it, stash the event, and replay it from a tap to show the real
//     one-tap native install dialog — the best possible experience.
//   • iOS Safari exposes NO install API at all. The only path is the manual
//     Share-sheet flow, so there we can only guide the parent with a friendly hint.
//
// Inside the native Capacitor shell the app is already "installed", so the whole
// feature is inert there.

const DISMISSED_KEY = 'splotch-install-dismissed';
const INSTALLED_KEY = 'splotch-install-completed';

// Chromium-only event; not in the default TS DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// How (if at all) we can offer install on this device/browser right now:
//   'oneTap'  — Chromium fired beforeinstallprompt; tap = native install dialog.
//   'android' — Android browser without a live prompt; guide to the ⋮ menu.
//   'ios'     — iOS Safari; guide to the Share sheet.
//   'none'    — already installed, native shell, or an unsupported browser.
export type InstallMode = 'none' | 'oneTap' | 'android' | 'ios';

export const install = $state({
  mode: 'none' as InstallMode,
  // Parent tapped "not now" — suppress the floating banner (the Parent Center
  // setup guide stays available regardless).
  dismissed: false,
  installed: false,
});

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent || '';
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ masquerades as desktop Safari; a touch-capable "Mac" is an iPad.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  // Add-to-Home-Screen only exists in real Safari, not the in-app Chrome/Firefox/Edge
  // WebViews (CriOS/FxiOS/EdgiOS) or embedded webviews, so don't promise it there.
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

// The fallback hint to show when there's no live one-tap prompt for this device.
function manualMode(): InstallMode {
  if (isIosSafari()) return 'ios';
  if (/android/i.test(navigator.userAgent || '')) return 'android';
  return 'none';
}

function markInstalled() {
  deferredPrompt = null;
  install.installed = true;
  install.mode = 'none';
  writeBool(INSTALLED_KEY, true);
}

// Web-only; no-op inside the native shell. Wires up the Chromium prompt capture
// and seeds the initial mode from a manual-hint heuristic.
export function initInstallPrompt() {
  if (!browser || initialized || isNative()) return;
  initialized = true;

  install.dismissed = readBool(DISMISSED_KEY, false);

  if (readBool(INSTALLED_KEY, false) || isStandalone()) {
    install.installed = true;
    install.mode = 'none';
    return;
  }

  install.mode = manualMode();

  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's default mini-infobar — we own the timing and presentation.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    install.mode = 'oneTap';
  });

  // Fires after any install path (our dialog, the browser menu, etc.).
  window.addEventListener('appinstalled', markInstalled);
}

// Replay the stashed Chromium prompt. MUST be called from a user gesture.
// Returns the user's choice, or 'unavailable' when there's no live prompt
// (already used, never fired, or non-Chromium) so callers can fall back to the
// manual hint.
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const evt = deferredPrompt;
  deferredPrompt = null; // a beforeinstallprompt event can only be prompt()ed once
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  if (outcome === 'accepted') {
    markInstalled();
  } else {
    // Declined: the one-shot prompt is spent. Drop to the manual menu hint and
    // stop nagging with the banner on this device.
    install.mode = manualMode();
    dismissInstall();
  }
  return outcome;
}

export function dismissInstall() {
  install.dismissed = true;
  writeBool(DISMISSED_KEY, true);
}
