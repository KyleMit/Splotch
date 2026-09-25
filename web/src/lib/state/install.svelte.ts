import { browser } from '$app/environment';
import { isAndroidBrowser, isIosDevice, isNative, isStandalone } from '$lib/platform';
import { STORAGE_KEYS, readBool, readInt, removeKey, writeBool, writeInt } from '$lib/storage';
import { canvasState, SETTLED_IN_STROKES, type CanvasState } from './canvas.svelte';
import {
  INSTALL_REPROMPT_SESSION_MILESTONES,
  sessionCountersState,
  type SessionCountersState,
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

const STROKES_BEFORE_AUTO_CLEAR = 5;
const MAX_INSTALL_REPROMPTS = INSTALL_REPROMPT_SESSION_MILESTONES.length;
const VALID_REPROMPTS_USED = Array.from({ length: MAX_INSTALL_REPROMPTS + 1 }, (_, index) => index);

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

export interface InstallState {
  readonly mode: InstallMode;
  // Parent tapped "not now" — suppress the floating banner until its bounded
  // re-prompt schedule is due. The Install section in Settings stays available.
  readonly dismissed: boolean;
  readonly installed: boolean;
  installPromptStage(): InstallPromptStage | null;
  recordInstallRepromptSession(): void;
  markInstalled(): void;
  captureInstallPrompt(e: BeforeInstallPromptEvent): void;
  initInstallPrompt(): void;
  promptInstall(): Promise<InstallPromptOutcome>;
  dismissInstall(): void;
  disarmInstallAutoClear(): void;
  armInstallAutoClear(): void;
  autoDismissInstallIfDue(): boolean;
  // Registers the one-shot beforeinstallprompt capture and the appinstalled
  // listener (web only; the native shell is already installed).
  install(): void;
  dispose(): void;
}

interface InstallRepromptSchedule {
  readonly dismissed: boolean;
  stage(): InstallPromptStage | null;
  recordSession(): void;
  dismiss(): void;
  reset(): void;
  load(): void;
  armAutoClear(): void;
  disarmAutoClear(): void;
  autoDismissIfDue(): boolean;
}

// The bounded ADR-0039 re-prompt cycle: whether the banner was dismissed, how many
// re-prompts are spent, and the stroke countdown that auto-clears it.
function createInstallRepromptSchedule(
  canvas: CanvasState,
  sessionCounters: SessionCountersState
): InstallRepromptSchedule {
  let dismissed = $state(false);
  let repromptsUsed = $state(readInt(STORAGE_KEYS.installRepromptsUsed, 0, VALID_REPROMPTS_USED));
  // Deliberately untracked: nothing renders it.
  let autoClearArmedAt: number | null = null;

  function stage(): InstallPromptStage | null {
    if (!dismissed) return 'initial';
    if (repromptsUsed >= MAX_INSTALL_REPROMPTS) return null;

    const milestone = INSTALL_REPROMPT_SESSION_MILESTONES[repromptsUsed];
    if (sessionCounters.sessionCount('installReprompt') < milestone) return null;
    return repromptsUsed === 0 ? 'returning' : 'final';
  }

  function dismiss() {
    const current = stage();
    sessionCounters.excludeCurrentSession('installReprompt');
    if (current === 'returning' || current === 'final') {
      repromptsUsed += 1;
      writeInt(STORAGE_KEYS.installRepromptsUsed, repromptsUsed);
    }
    dismissed = true;
    autoClearArmedAt = null;
    writeBool(STORAGE_KEYS.installDismissed, true);
  }

  return {
    get dismissed() {
      return dismissed;
    },
    stage,
    recordSession() {
      if (
        canvas.strokeCount < SETTLED_IN_STROKES ||
        !dismissed ||
        repromptsUsed >= MAX_INSTALL_REPROMPTS ||
        stage() !== null
      ) {
        return;
      }
      sessionCounters.recordSession('installReprompt');
    },
    dismiss,
    reset() {
      dismissed = false;
      repromptsUsed = 0;
      autoClearArmedAt = null;
      removeKey(STORAGE_KEYS.installDismissed);
      removeKey(STORAGE_KEYS.installRepromptsUsed);
      sessionCounters.clearSessionCount('installReprompt');
    },
    load() {
      dismissed = readBool(STORAGE_KEYS.installDismissed, false);
      repromptsUsed = readInt(STORAGE_KEYS.installRepromptsUsed, 0, VALID_REPROMPTS_USED);
    },
    armAutoClear() {
      autoClearArmedAt ??= canvas.strokeCount;
    },
    disarmAutoClear() {
      autoClearArmedAt = null;
    },
    autoDismissIfDue() {
      if (
        autoClearArmedAt === null ||
        canvas.strokeCount < autoClearArmedAt + STROKES_BEFORE_AUTO_CLEAR
      ) {
        return false;
      }
      dismiss();
      return true;
    },
  };
}

export function createInstall(
  canvas: CanvasState,
  sessionCounters: SessionCountersState
): InstallState {
  const s = $state<{
    mode: InstallMode;
    installed: boolean;
  }>({
    mode: 'none',
    installed: false,
  });
  const schedule = createInstallRepromptSchedule(canvas, sessionCounters);

  // Deliberately untracked: nothing renders them.
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let initialized = false;
  let listening = false;

  // A spent/stale one-tap prompt drops to the manual hint so the UI falls back to
  // something a tap can actually do.
  function fallBackToManualHint() {
    if (s.mode === 'oneTap') s.mode = manualMode();
  }

  function installPromptStage(): InstallPromptStage | null {
    return s.installed ? null : schedule.stage();
  }

  function recordInstallRepromptSession() {
    if (s.installed || s.mode === 'none') return;
    schedule.recordSession();
  }

  function markInstalled() {
    deferredPrompt = null;
    schedule.reset();
    s.installed = true;
    s.mode = 'none';
    writeBool(STORAGE_KEYS.installCompleted, true);
  }

  function captureInstallPrompt(e: BeforeInstallPromptEvent) {
    // Stop Chrome's default mini-infobar — we own the timing and presentation.
    e.preventDefault();
    deferredPrompt = e;
    // The browser only fires this when the app is NOT currently installed, so
    // it outranks a stale persisted flag (installed once, later uninstalled —
    // localStorage survives a PWA uninstall).
    if (s.installed || readBool(STORAGE_KEYS.installCompleted, false)) {
      schedule.reset();
      s.installed = false;
      writeBool(STORAGE_KEYS.installCompleted, false);
    }
    s.mode = 'oneTap';
    // Desktop installability can arrive after the drawing route's settled-in gate.
    recordInstallRepromptSession();
  }

  return {
    get mode() {
      return s.mode;
    },
    get dismissed() {
      return schedule.dismissed;
    },
    get installed() {
      return s.installed;
    },
    installPromptStage,
    recordInstallRepromptSession,
    // Also reached by the native-configured unit suite, which drives the
    // production event callbacks without compiling their web-only listener
    // registrations back in.
    markInstalled,
    captureInstallPrompt,
    // Web-only; no-op inside the native shell. Seeds mode and the persisted install
    // lifecycle from storage plus the manual-hint heuristic.
    initInstallPrompt() {
      if (!browser || initialized || (__IS_CAPACITOR__ && isNative())) return;
      initialized = true;

      schedule.load();

      // A live prompt captured before init already proved the app is installable
      // (and not installed) — the capture has set mode/installed.
      if (deferredPrompt) return;

      if (readBool(STORAGE_KEYS.installCompleted, false) || isStandalone()) {
        markInstalled();
        return;
      }

      s.mode = manualMode();
    },
    // Replay the stashed Chromium prompt. MUST be called from a user gesture.
    // Returns the user's choice, or 'unavailable' when there's no live prompt
    // (already used, gone stale, never fired, or non-Chromium). On 'unavailable'
    // a still-'oneTap' mode drops to the manual hint so the UI falls back to
    // something a tap can actually do.
    async promptInstall() {
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
        schedule.dismiss();
      }
      return outcome;
    },
    dismissInstall: schedule.dismiss,
    disarmInstallAutoClear: schedule.disarmAutoClear,
    armInstallAutoClear: schedule.armAutoClear,
    autoDismissInstallIfDue: schedule.autoDismissIfDue,
    // beforeinstallprompt is one-shot and can fire before the page component
    // mounts (on a repeat visit the service worker already controls the page, so
    // Chromium's installability check races hydration). Listen from module load,
    // not from initInstallPrompt(), so an early event isn't silently lost.
    // The compile-time constant leads the condition so the native build folds the
    // whole block away (tools/mobile/check-static-bundle.mjs scans for it).
    install() {
      if (!__IS_CAPACITOR__ && browser && !listening) {
        listening = true;
        window.addEventListener('beforeinstallprompt', captureInstallPrompt);
        // Fires after any install path (our dialog, the browser menu, etc.).
        window.addEventListener('appinstalled', markInstalled);
      }
    },
    dispose() {
      if (!__IS_CAPACITOR__ && listening) {
        listening = false;
        window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
        window.removeEventListener('appinstalled', markInstalled);
      }
    },
  };
}

export const installState = createInstall(canvasState, sessionCountersState);

export const {
  installPromptStage,
  recordInstallRepromptSession,
  markInstalled,
  captureInstallPrompt,
  initInstallPrompt,
  promptInstall,
  dismissInstall,
  disarmInstallAutoClear,
  armInstallAutoClear,
  autoDismissInstallIfDue,
} = installState;

installState.install();
