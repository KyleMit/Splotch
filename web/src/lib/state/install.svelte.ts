import { browser } from '$app/environment';
import { isAndroidBrowser, isIosDevice, isNative, isStandalone } from '$lib/platform';
import {
  STORAGE_KEYS,
  onDurableRestore,
  readBool,
  readInt,
  removeKey,
  writeBool,
  writeInt,
} from '$lib/storage';
import { canvasState, SETTLED_IN_STROKES } from './canvas.svelte';
import {
  clearSessionCount,
  excludeCurrentSession,
  INSTALL_REPROMPT_SESSION_MILESTONES,
  recordSession,
  sessionCount,
} from './sessionCounters.svelte';

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

// How (if at all) we can offer install on this device/browser right now:
//   'oneTap'  — Chromium fired beforeinstallprompt; tap = native install dialog.
//   'android' — Android browser without a live prompt; guide to the ⋮ menu.
//   'ios'     — iOS Safari; guide to the Share sheet.
//   'none'    — already installed, native shell, or an unsupported browser.
export type InstallMode = 'none' | 'oneTap' | 'android' | 'ios';

// The device family, for choosing which manual install steps apply. Distinct
// from mode: an iOS in-app-browser user is an 'ios' device but mode 'none'.
export type InstallDeviceOs = 'ios' | 'android' | 'desktop';

// The result of promptInstall(): the user's choice, or 'unavailable' when there
// was no live prompt to show.
export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';
export type InstallPromptStage = 'initial' | 'returning' | 'final';

export const install = $state({
  mode: 'none' as InstallMode,
  // Parent tapped "not now" — suppress the floating banner until its bounded
  // re-prompt schedule is due. The Install section in Settings stays available.
  dismissed: false,
  installed: false,
});

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
let installAutoClearArmedAt: number | null = null;
let repromptsUsed = $state(readInt(STORAGE_KEYS.installRepromptsUsed, 0, [0, 1, 2]));

const STROKES_BEFORE_AUTO_CLEAR = 5;
const MAX_INSTALL_REPROMPTS = INSTALL_REPROMPT_SESSION_MILESTONES.length;

function isIosSafari() {
  if (!isIosDevice()) return false;
  // Add-to-Home-Screen only exists in real Safari, not the in-app Chrome/Firefox/Edge
  // WebViews (CriOS/FxiOS/EdgiOS) or embedded webviews, so don't promise it there.
  const ua = navigator.userAgent || '';
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

// True on an iOS device in anything but Safari — a third-party browser or an
// in-app webview. NOT a claim that install is impossible there: since iOS 16.4
// (the app's floor) a browser holding com.apple.developer.web-browser can offer
// Add to Home Screen from its own Share menu, and Chrome does. But it is opt-in
// per browser, absent from in-app webviews entirely, and reached from a
// different place — so the Safari-shaped manual checklist in Settings needs a
// step to get there first.
export function isIosOutsideSafari(): boolean {
  return isIosDevice() && !isIosSafari();
}

// Single source of truth for "what kind of device is this" — consumers (the
// Install section in Settings) must not re-sniff the UA themselves.
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

// A spent/stale one-tap prompt drops to the manual hint so the UI falls back to
// something a tap can actually do.
function fallBackToManualHint() {
  if (install.mode === 'oneTap') install.mode = manualMode();
}

function resetInstallRepromptCycle() {
  install.dismissed = false;
  repromptsUsed = 0;
  installAutoClearArmedAt = null;
  removeKey(STORAGE_KEYS.installDismissed);
  removeKey(STORAGE_KEYS.installRepromptsUsed);
  clearSessionCount('installReprompt');
}

function reloadInstallRepromptState() {
  repromptsUsed = readInt(STORAGE_KEYS.installRepromptsUsed, 0, [0, 1, 2]);
}

onDurableRestore(reloadInstallRepromptState);

export function installPromptStage(): InstallPromptStage | null {
  if (install.installed) return null;
  if (!install.dismissed) return 'initial';
  if (repromptsUsed >= MAX_INSTALL_REPROMPTS) return null;

  const milestone = INSTALL_REPROMPT_SESSION_MILESTONES[repromptsUsed];
  if (sessionCount('installReprompt') < milestone) return null;
  return repromptsUsed === 0 ? 'returning' : 'final';
}

export function recordInstallRepromptSession() {
  if (
    canvasState.strokeCount < SETTLED_IN_STROKES ||
    !install.dismissed ||
    install.installed ||
    install.mode === 'none' ||
    repromptsUsed >= MAX_INSTALL_REPROMPTS ||
    installPromptStage() !== null
  ) {
    return;
  }
  recordSession('installReprompt');
}

// Exported so the native-configured unit suite can drive the production event
// callbacks without compiling their web-only listener registrations back in.
export function markInstalled() {
  deferredPrompt = null;
  resetInstallRepromptCycle();
  install.installed = true;
  install.mode = 'none';
  writeBool(STORAGE_KEYS.installCompleted, true);
}

export function captureInstallPrompt(e: BeforeInstallPromptEvent) {
  // Stop Chrome's default mini-infobar — we own the timing and presentation.
  e.preventDefault();
  deferredPrompt = e;
  // The browser only fires this when the app is NOT currently installed, so
  // it outranks a stale persisted flag (installed once, later uninstalled —
  // localStorage survives a PWA uninstall).
  if (install.installed || readBool(STORAGE_KEYS.installCompleted, false)) {
    resetInstallRepromptCycle();
    install.installed = false;
    writeBool(STORAGE_KEYS.installCompleted, false);
  }
  install.mode = 'oneTap';
}

// beforeinstallprompt is one-shot and can fire before the page component
// mounts (on a repeat visit the service worker already controls the page, so
// Chromium's installability check races hydration). Listen from module load,
// not from initInstallPrompt(), so an early event isn't silently lost.
if (browser && !__IS_CAPACITOR__) {
  window.addEventListener('beforeinstallprompt', captureInstallPrompt);

  // Fires after any install path (our dialog, the browser menu, etc.).
  window.addEventListener('appinstalled', markInstalled);
}

// Web-only; no-op inside the native shell. Seeds mode and the persisted install
// lifecycle from storage plus the manual-hint heuristic.
export function initInstallPrompt() {
  if (!browser || initialized || (__IS_CAPACITOR__ && isNative())) return;
  initialized = true;

  install.dismissed = readBool(STORAGE_KEYS.installDismissed, false);
  reloadInstallRepromptState();

  // A live prompt captured before init already proved the app is installable
  // (and not installed) — the listener above has set mode/installed.
  if (deferredPrompt) return;

  if (readBool(STORAGE_KEYS.installCompleted, false) || isStandalone()) {
    markInstalled();
    return;
  }

  install.mode = manualMode();
}

// Replay the stashed Chromium prompt. MUST be called from a user gesture.
// Returns the user's choice, or 'unavailable' when there's no live prompt
// (already used, gone stale, never fired, or non-Chromium). On 'unavailable'
// a still-'oneTap' mode drops to the manual hint so the UI falls back to
// something a tap can actually do.
export async function promptInstall(): Promise<InstallPromptOutcome> {
  if (!deferredPrompt) {
    fallBackToManualHint();
    return 'unavailable';
  }
  const evt = deferredPrompt;
  deferredPrompt = null; // a beforeinstallprompt event can only be prompt()ed once
  let outcome: Exclude<InstallPromptOutcome, 'unavailable'>;
  try {
    await evt.prompt();
    ({ outcome } = await evt.userChoice);
  } catch {
    // The stashed event went stale (e.g. Chrome revoked installability since
    // capture). Swallow it — callers must never be left with a stuck busy flag.
    fallBackToManualHint();
    return 'unavailable';
  }
  if (outcome === 'accepted') {
    markInstalled();
  } else {
    // Declined: the one-shot prompt is spent. Drop to the manual menu hint and
    // route through the same bounded re-prompt cycle as every other dismissal.
    fallBackToManualHint();
    dismissInstall();
  }
  return outcome;
}

export function dismissInstall() {
  const stage = installPromptStage();
  excludeCurrentSession('installReprompt');
  if (stage === 'returning' || stage === 'final') {
    repromptsUsed += 1;
    writeInt(STORAGE_KEYS.installRepromptsUsed, repromptsUsed);
  }
  install.dismissed = true;
  installAutoClearArmedAt = null;
  writeBool(STORAGE_KEYS.installDismissed, true);
}

export function armInstallAutoClear() {
  installAutoClearArmedAt ??= canvasState.strokeCount;
}

export function autoDismissInstallIfDue(): boolean {
  if (
    installAutoClearArmedAt === null ||
    canvasState.strokeCount < installAutoClearArmedAt + STROKES_BEFORE_AUTO_CLEAR
  ) {
    return false;
  }
  dismissInstall();
  return true;
}
