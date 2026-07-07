import { browser } from '$app/environment';
import { isAndroidBrowser, isIosDevice, isNative, isStandalone } from '$lib/platform';
import { readBool, writeBool } from '$lib/storage';

// "Add to Home Screen" / PWA install, surfaced as a friendly parent-facing prompt.
//
// Two worlds, deliberately different (see ADR-0039):
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

// The device family, for choosing which manual install steps apply. Distinct
// from mode: an iOS in-app-browser user is an 'ios' device but mode 'none'.
export type InstallDeviceOs = 'ios' | 'android' | 'desktop';

export const install = $state({
  mode: 'none' as InstallMode,
  // Parent tapped "not now" — suppress the floating banner (the Parent Center
  // setup guide stays available regardless).
  dismissed: false,
  installed: false,
});

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;

function isIosSafari() {
  if (!isIosDevice()) return false;
  // Add-to-Home-Screen only exists in real Safari, not the in-app Chrome/Firefox/Edge
  // WebViews (CriOS/FxiOS/EdgiOS) or embedded webviews, so don't promise it there.
  const ua = navigator.userAgent || '';
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

// Single source of truth for "what kind of device is this" — consumers (the
// Parent Center setup guide) must not re-sniff the UA themselves.
export function installDeviceOs(): InstallDeviceOs {
  if (isIosDevice()) return 'ios';
  if (isAndroidBrowser()) return 'android';
  return 'desktop';
}

// The fallback hint to show when there's no live one-tap prompt for this device.
function manualMode(): InstallMode {
  if (isIosSafari()) return 'ios';
  if (isAndroidBrowser()) return 'android';
  return 'none';
}

function markInstalled() {
  deferredPrompt = null;
  install.installed = true;
  install.mode = 'none';
  writeBool(INSTALLED_KEY, true);
}

// beforeinstallprompt is one-shot and can fire before the page component
// mounts (on a repeat visit the service worker already controls the page, so
// Chromium's installability check races hydration). Listen from module load,
// not from initInstallPrompt(), so an early event isn't silently lost.
if (browser && !isNative()) {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's default mini-infobar — we own the timing and presentation.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    // The browser only fires this when the app is NOT currently installed, so
    // it outranks a stale persisted flag (installed once, later uninstalled —
    // localStorage survives a PWA uninstall).
    if (install.installed || readBool(INSTALLED_KEY, false)) {
      install.installed = false;
      writeBool(INSTALLED_KEY, false);
    }
    install.mode = 'oneTap';
  });

  // Fires after any install path (our dialog, the browser menu, etc.).
  window.addEventListener('appinstalled', markInstalled);
}

// Web-only; no-op inside the native shell. Seeds mode/dismissed/installed from
// persisted state and the manual-hint heuristic.
export function initInstallPrompt() {
  if (!browser || initialized || isNative()) return;
  initialized = true;

  install.dismissed = readBool(DISMISSED_KEY, false);

  // A live prompt captured before init already proved the app is installable
  // (and not installed) — the listener above has set mode/installed.
  if (deferredPrompt) return;

  if (readBool(INSTALLED_KEY, false) || isStandalone()) {
    install.installed = true;
    install.mode = 'none';
    return;
  }

  install.mode = manualMode();
}

// Replay the stashed Chromium prompt. MUST be called from a user gesture.
// Returns the user's choice, or 'unavailable' when there's no live prompt
// (already used, gone stale, never fired, or non-Chromium). On 'unavailable'
// a still-'oneTap' mode drops to the manual hint so the UI falls back to
// something a tap can actually do.
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) {
    if (install.mode === 'oneTap') install.mode = manualMode();
    return 'unavailable';
  }
  const evt = deferredPrompt;
  deferredPrompt = null; // a beforeinstallprompt event can only be prompt()ed once
  let outcome: 'accepted' | 'dismissed';
  try {
    await evt.prompt();
    ({ outcome } = await evt.userChoice);
  } catch {
    // The stashed event went stale (e.g. Chrome revoked installability since
    // capture). Swallow it — callers must never be left with a stuck busy flag.
    if (install.mode === 'oneTap') install.mode = manualMode();
    return 'unavailable';
  }
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
