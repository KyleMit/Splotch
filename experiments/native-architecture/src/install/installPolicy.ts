import { STORAGE_KEYS } from '../../../../web/src/lib/storageKeys';

// The web export's Add to Home Screen prompt (ADR-0039), with the shipping app's
// policy and storage: a Splotch PWA dismissed or installed before the React Native
// build replaced it stays dismissed or installed afterwards. The thresholds agree
// with the shipping state modules, drift-guarded by
// tools/tests/native-web-install-drift.test.mjs.

// 'oneTap': Chromium fired beforeinstallprompt, so a tap opens the native dialog.
// 'android' / 'ios': manual steps for the browser's menu or Safari's Share sheet.
// 'none': installed, inside a native app, or a browser with no install path.
export type InstallMode = 'none' | 'oneTap' | 'android' | 'ios';
export type InstallDeviceOs = 'ios' | 'android' | 'desktop';
type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';
type InstallPromptStage = 'initial' | 'returning' | 'final';

// Committed strokes before the banner may appear, so it feels earned.
export const SETTLED_IN_STROKES = 3;
// Strokes drawn past a shown banner, unanswered, before it hands off to Settings.
export const STROKES_BEFORE_AUTO_CLEAR = 5;
// Qualifying sessions after a dismissal at which the banner returns, once each.
const INSTALL_REPROMPT_SESSION_MILESTONES = [5, 10] as const;
// A launch in any of these display modes is already the installed app.
export const APP_LIKE_DISPLAY_MODE_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
] as const;
const MAX_INSTALL_REPROMPTS = INSTALL_REPROMPT_SESSION_MILESTONES.length;
const MAX_REPROMPT_SESSIONS = Math.max(...INSTALL_REPROMPT_SESSION_MILESTONES);

export type InstallDevice = Readonly<{
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
}>;

export type InstallStorage = Readonly<{
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}>;

// The part of Chromium's BeforeInstallPromptEvent this module replays.
export type DeferredInstallPrompt = Readonly<{
  preventDefault(): void;
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}>;

export type InstallSnapshot = Readonly<{
  mode: InstallMode;
  installed: boolean;
  stage: InstallPromptStage | null;
}>;

export type InstallPromptOwner = Readonly<{
  deviceOs: InstallDeviceOs;
  outsideSafari: boolean;
  snapshot(): InstallSnapshot;
  subscribe(listener: () => void): () => void;
  capture(event: DeferredInstallPrompt): void;
  markInstalled(): void;
  prompt(): Promise<InstallPromptOutcome>;
  dismiss(): void;
  recordSession(strokes: number): void;
  armAutoClear(strokes: number): void;
  disarmAutoClear(): void;
  autoDismissIfDue(strokes: number): boolean;
}>;

// iPadOS reports a desktop Mac user agent, so a touch-capable "Mac" counts as an iPad.
function isIosDevice(device: InstallDevice) {
  return (
    /iPad|iPhone|iPod/.test(device.userAgent) ||
    (device.platform === 'MacIntel' && device.maxTouchPoints > 1)
  );
}

function isAndroidBrowser(device: InstallDevice) {
  return /android/i.test(device.userAgent);
}

// Add to Home Screen is promised only in real Safari, not in the in-app browsers.
function isIosSafari(device: InstallDevice) {
  return (
    isIosDevice(device) &&
    /Safari/.test(device.userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(device.userAgent)
  );
}

export function installDeviceOs(device: InstallDevice): InstallDeviceOs {
  if (isIosDevice(device)) return 'ios';
  if (isAndroidBrowser(device)) return 'android';
  return 'desktop';
}

export function manualInstallMode(device: InstallDevice): InstallMode {
  if (isIosSafari(device)) return 'ios';
  if (isAndroidBrowser(device)) return 'android';
  return 'none';
}

function readFlag(storage: InstallStorage, key: string) {
  return storage.read(key) === 'true';
}

function readCount(storage: InstallStorage, key: string, max: number) {
  const stored = Number.parseInt(storage.read(key) ?? '', 10);
  return Number.isNaN(stored) ? 0 : Math.min(max, Math.max(0, stored));
}

function createRepromptSchedule(storage: InstallStorage) {
  let dismissed = readFlag(storage, STORAGE_KEYS.installDismissed);
  let repromptsUsed = readCount(storage, STORAGE_KEYS.installRepromptsUsed, MAX_INSTALL_REPROMPTS);
  let sessions = readCount(
    storage,
    STORAGE_KEYS.installRepromptSessionCount,
    MAX_REPROMPT_SESSIONS
  );
  // The current document counts at most once, and never as the session it was dismissed in.
  let sessionCounted = false;
  let autoClearArmedAt: number | null = null;

  function stage(): InstallPromptStage | null {
    if (!dismissed) return 'initial';
    if (repromptsUsed >= MAX_INSTALL_REPROMPTS) return null;
    if (sessions < INSTALL_REPROMPT_SESSION_MILESTONES[repromptsUsed]) return null;
    return repromptsUsed === 0 ? 'returning' : 'final';
  }

  return {
    stage,
    dismiss() {
      const current = stage();
      sessionCounted = true;
      if (current === 'returning' || current === 'final') {
        repromptsUsed += 1;
        storage.write(STORAGE_KEYS.installRepromptsUsed, String(repromptsUsed));
      }
      dismissed = true;
      autoClearArmedAt = null;
      storage.write(STORAGE_KEYS.installDismissed, 'true');
    },
    recordSession(strokes: number) {
      if (
        strokes < SETTLED_IN_STROKES ||
        sessionCounted ||
        !dismissed ||
        repromptsUsed >= MAX_INSTALL_REPROMPTS ||
        stage() !== null
      )
        return false;
      sessionCounted = true;
      if (sessions >= MAX_REPROMPT_SESSIONS) return false;
      sessions += 1;
      storage.write(STORAGE_KEYS.installRepromptSessionCount, String(sessions));
      return true;
    },
    reset() {
      dismissed = false;
      repromptsUsed = 0;
      sessions = 0;
      autoClearArmedAt = null;
      storage.remove(STORAGE_KEYS.installDismissed);
      storage.remove(STORAGE_KEYS.installRepromptsUsed);
      storage.remove(STORAGE_KEYS.installRepromptSessionCount);
    },
    armAutoClear(strokes: number) {
      autoClearArmedAt ??= strokes;
    },
    disarmAutoClear() {
      autoClearArmedAt = null;
    },
    autoClearDue(strokes: number) {
      return autoClearArmedAt !== null && strokes >= autoClearArmedAt + STROKES_BEFORE_AUTO_CLEAR;
    },
  };
}

export function createInstallPrompt({
  device,
  storage,
}: {
  device: InstallDevice;
  storage: InstallStorage;
}): InstallPromptOwner {
  const schedule = createRepromptSchedule(storage);
  const listeners = new Set<() => void>();
  let deferredPrompt: DeferredInstallPrompt | null = null;
  let installed = false;
  let mode = manualInstallMode(device);
  let current: InstallSnapshot = { mode, installed, stage: schedule.stage() };

  function publish() {
    const next = { mode, installed, stage: installed ? null : schedule.stage() };
    if (
      next.mode === current.mode &&
      next.installed === current.installed &&
      next.stage === current.stage
    )
      return;
    current = next;
    listeners.forEach((listener) => listener());
  }

  function fallBackToManualHint() {
    if (mode === 'oneTap') mode = manualInstallMode(device);
  }

  function markInstalled() {
    deferredPrompt = null;
    schedule.reset();
    installed = true;
    mode = 'none';
    storage.write(STORAGE_KEYS.installCompleted, 'true');
    publish();
  }

  if (readFlag(storage, STORAGE_KEYS.installCompleted) || device.standalone) markInstalled();

  return {
    deviceOs: installDeviceOs(device),
    outsideSafari: isIosDevice(device) && !isIosSafari(device),
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    capture(event) {
      event.preventDefault();
      deferredPrompt = event;
      // The browser fires this only while the app is not installed, so it outranks a
      // flag left behind by an uninstalled copy.
      if (installed) {
        schedule.reset();
        installed = false;
        storage.write(STORAGE_KEYS.installCompleted, 'false');
      }
      mode = 'oneTap';
      publish();
    },
    markInstalled,
    async prompt() {
      if (!deferredPrompt) {
        fallBackToManualHint();
        publish();
        return 'unavailable';
      }
      const event = deferredPrompt;
      deferredPrompt = null;
      let outcome: 'accepted' | 'dismissed';
      try {
        await event.prompt();
        ({ outcome } = await event.userChoice);
      } catch {
        fallBackToManualHint();
        publish();
        return 'unavailable';
      }
      if (outcome === 'accepted') {
        markInstalled();
      } else {
        fallBackToManualHint();
        schedule.dismiss();
        publish();
      }
      return outcome;
    },
    dismiss() {
      schedule.dismiss();
      publish();
    },
    recordSession(strokes) {
      if (installed || mode === 'none') return;
      if (schedule.recordSession(strokes)) publish();
    },
    armAutoClear: schedule.armAutoClear,
    disarmAutoClear: schedule.disarmAutoClear,
    autoDismissIfDue(strokes) {
      if (!schedule.autoClearDue(strokes)) return false;
      schedule.dismiss();
      publish();
      return true;
    },
  };
}
