import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEYS } from '$lib/storage';

const mocks = vi.hoisted(() => ({ native: false }));
vi.mock('$app/environment', () => ({ browser: true }));
// Keep the real isStandalone (it reads the window.matchMedia stub that
// setStandalone() controls); only isNative needs to be driven per-test.
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
}));

function setUA(ua: string, platform = '', maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

function setStandalone(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any;
}

function makePromptEvent(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (e as any).prompt = vi.fn().mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (e as any).userChoice = Promise.resolve({ outcome, platform: 'web' });
  return e;
}

// The module guards init() with a one-shot flag and holds the deferred prompt in
// module scope, so each test needs a pristine copy.
async function freshModule() {
  vi.resetModules();
  return import('./install.svelte');
}

async function openAndroidSession() {
  setUA(ANDROID_UA);
  const session = await freshModule();
  session.initInstallPrompt();
  return session;
}

async function qualifyingInstallSession() {
  const session = await openAndroidSession();
  const { canvasState, SETTLED_IN_STROKES } = await import('./canvas.svelte');
  canvasState.strokeCount = SETTLED_IN_STROKES;
  session.recordInstallRepromptSession();
  return session;
}

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124 Mobile/15E148 Safari/604.1';

beforeEach(() => {
  localStorage.clear();
  mocks.native = false;
  setStandalone(false);
  setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
});

describe('initInstallPrompt — mode detection', () => {
  it('offers the Share-sheet hint on iOS Safari', async () => {
    setUA(IOS_SAFARI_UA);
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.mode).toBe('ios');
  });

  it('does not promise Add-to-Home-Screen in an iOS in-app browser', async () => {
    setUA(IOS_CHROME_UA);
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.mode).toBe('none');
  });

  it('shows the menu hint on Android before any prompt fires', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.mode).toBe('android');
  });

  it('upgrades to one-tap when Chromium fires beforeinstallprompt', async () => {
    setUA(ANDROID_UA);
    const { captureInstallPrompt, install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    captureInstallPrompt(makePromptEvent('accepted') as BeforeInstallPromptEvent);
    expect(install.mode).toBe('oneTap');
  });

  it('preserves a prompt captured before init', async () => {
    setUA(ANDROID_UA);
    const { captureInstallPrompt, install, initInstallPrompt } = await freshModule();
    captureInstallPrompt(makePromptEvent('accepted') as BeforeInstallPromptEvent);
    initInstallPrompt();
    expect(install.mode).toBe('oneTap');
  });

  it('treats iPadOS-as-desktop Safari (touch Mac) as iOS', async () => {
    setUA(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'MacIntel',
      5
    );
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.mode).toBe('ios');
  });
});

// The Settings checklist's Safari steps are written for Safari's Share sheet, so
// this is the signal that decides whether they need an "open it in Safari" lead-in.
describe('isIosOutsideSafari', () => {
  it('is false in iOS Safari, which the steps already describe', async () => {
    setUA(IOS_SAFARI_UA);
    const { isIosOutsideSafari } = await freshModule();
    expect(isIosOutsideSafari()).toBe(false);
  });

  it('is true in a third-party iOS browser, which reaches install its own way', async () => {
    setUA(IOS_CHROME_UA);
    const { isIosOutsideSafari } = await freshModule();
    expect(isIosOutsideSafari()).toBe(true);
  });

  it('is true in an in-app webview, which cannot install at all', async () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS]'
    );
    const { isIosOutsideSafari } = await freshModule();
    expect(isIosOutsideSafari()).toBe(true);
  });

  it('is false off iOS entirely, where Safari is not the path', async () => {
    setUA(ANDROID_UA);
    const { isIosOutsideSafari } = await freshModule();
    expect(isIosOutsideSafari()).toBe(false);
  });
});

describe('initInstallPrompt — already installed', () => {
  it('suppresses everything when running standalone', async () => {
    setUA(ANDROID_UA);
    setStandalone(true);
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.installed).toBe(true);
    expect(install.mode).toBe('none');
  });

  it('stays suppressed once a prior install was recorded', async () => {
    setUA(ANDROID_UA);
    localStorage.setItem(STORAGE_KEYS.installCompleted, 'true');
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.installed).toBe(true);
    expect(install.mode).toBe('none');
  });

  it('re-offers one-tap when a fresh prompt disproves a stale installed flag', async () => {
    // localStorage survives a PWA uninstall; beforeinstallprompt only fires
    // when the app is NOT installed, so the live event wins.
    setUA(ANDROID_UA);
    localStorage.setItem(STORAGE_KEYS.installCompleted, 'true');
    const { captureInstallPrompt, install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.mode).toBe('none');

    captureInstallPrompt(makePromptEvent('accepted') as BeforeInstallPromptEvent);
    expect(install.mode).toBe('oneTap');
    expect(install.installed).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.installCompleted)).toBe('false');
  });

  it('is inert inside the native Capacitor shell', async () => {
    setUA(ANDROID_UA);
    mocks.native = true;
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.mode).toBe('none');
  });
});

describe('promptInstall', () => {
  it('marks installed and persists when the dialog is accepted', async () => {
    setUA(ANDROID_UA);
    const { captureInstallPrompt, install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    captureInstallPrompt(makePromptEvent('accepted') as BeforeInstallPromptEvent);

    const outcome = await promptInstall();
    expect(outcome).toBe('accepted');
    expect(install.installed).toBe(true);
    expect(install.mode).toBe('none');
    expect(localStorage.getItem(STORAGE_KEYS.installCompleted)).toBe('true');
  });

  it('falls back to the manual hint and stops nagging when declined', async () => {
    setUA(ANDROID_UA);
    const { captureInstallPrompt, install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    captureInstallPrompt(makePromptEvent('dismissed') as BeforeInstallPromptEvent);

    const outcome = await promptInstall();
    expect(outcome).toBe('dismissed');
    expect(install.installed).toBe(false);
    expect(install.mode).toBe('android');
    expect(install.dismissed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.installDismissed)).toBe('true');
  });

  it('reports unavailable when there is no live prompt to replay', async () => {
    setUA(ANDROID_UA);
    const { initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    expect(await promptInstall()).toBe('unavailable');
  });

  it('cannot be replayed twice from a single event', async () => {
    setUA(ANDROID_UA);
    const { captureInstallPrompt, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    captureInstallPrompt(makePromptEvent('accepted') as BeforeInstallPromptEvent);
    expect(await promptInstall()).toBe('accepted');
    expect(await promptInstall()).toBe('unavailable');
  });

  it('reports unavailable and drops to the manual hint when the prompt throws', async () => {
    setUA(ANDROID_UA);
    const { captureInstallPrompt, install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    const e = new Event('beforeinstallprompt');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).prompt = vi.fn().mockRejectedValue(new Error('prompt went stale'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    captureInstallPrompt(e as BeforeInstallPromptEvent);

    expect(await promptInstall()).toBe('unavailable');
    expect(install.mode).toBe('android');
  });

  it('drops a stale oneTap mode to the manual hint when the prompt is already spent', async () => {
    setUA(ANDROID_UA);
    const { captureInstallPrompt, install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    const e = new Event('beforeinstallprompt');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).prompt = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).userChoice = new Promise(() => {}); // dialog still open
    captureInstallPrompt(e as BeforeInstallPromptEvent);

    void promptInstall(); // consumes the one-shot event
    expect(await promptInstall()).toBe('unavailable');
    expect(install.mode).toBe('android');
  });
});

describe('install completion', () => {
  it('marks installed and persists when the browser installs by any path', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt, markInstalled } = await freshModule();
    initInstallPrompt();
    markInstalled();
    expect(install.installed).toBe(true);
    expect(install.mode).toBe('none');
    expect(localStorage.getItem(STORAGE_KEYS.installCompleted)).toBe('true');
  });

  it('ends and clears an in-progress re-prompt cycle', async () => {
    const first = await openAndroidSession();
    first.dismissInstall();
    await qualifyingInstallSession();
    const active = await qualifyingInstallSession();

    active.markInstalled();
    active.recordInstallRepromptSession();

    expect(active.install.installed).toBe(true);
    expect(active.installPromptStage()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptsUsed)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.installDismissed)).toBeNull();
  });

  it('starts a fresh prompt cycle when a live event proves the app was uninstalled', async () => {
    setUA(ANDROID_UA);
    localStorage.setItem(STORAGE_KEYS.installCompleted, 'true');
    localStorage.setItem(STORAGE_KEYS.installDismissed, 'true');
    localStorage.setItem(STORAGE_KEYS.installRepromptSessionCount, '10');
    localStorage.setItem(STORAGE_KEYS.installRepromptsUsed, '2');
    const session = await freshModule();
    session.initInstallPrompt();

    session.captureInstallPrompt(makePromptEvent('accepted') as BeforeInstallPromptEvent);

    expect(session.install.installed).toBe(false);
    expect(session.installPromptStage()).toBe('initial');
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptsUsed)).toBeNull();
  });
});

describe('dismissInstall', () => {
  it('remembers the dismissal across sessions', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt, dismissInstall } = await freshModule();
    initInstallPrompt();
    dismissInstall();
    expect(install.dismissed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.installDismissed)).toBe('true');

    const next = await freshModule();
    next.initInstallPrompt();
    expect(next.install.dismissed).toBe(true);
  });

  it('does not count the session where the initial prompt was dismissed', async () => {
    const session = await openAndroidSession();
    const { canvasState, SETTLED_IN_STROKES } = await import('./canvas.svelte');
    canvasState.strokeCount = SETTLED_IN_STROKES;

    session.dismissInstall();
    session.recordInstallRepromptSession();

    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();
  });
});

describe('bounded install re-prompts', () => {
  it('re-prompts after five and ten qualifying sessions, then stays permanently quiet', async () => {
    const initial = await openAndroidSession();
    initial.dismissInstall();

    let session = await qualifyingInstallSession();
    for (let count = 2; count <= 4; count += 1) session = await qualifyingInstallSession();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('4');
    expect(session.installPromptStage()).toBeNull();

    session = await qualifyingInstallSession();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('5');
    expect(session.installPromptStage()).toBe('returning');
    session.dismissInstall();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptsUsed)).toBe('1');

    for (let count = 6; count <= 9; count += 1) session = await qualifyingInstallSession();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('9');
    expect(session.installPromptStage()).toBeNull();

    session = await qualifyingInstallSession();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('10');
    expect(session.installPromptStage()).toBe('final');
    session.dismissInstall();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptsUsed)).toBe('2');

    session = await qualifyingInstallSession();
    expect(session.installPromptStage()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('10');
  });

  it('counts a qualifying session at most once per page load', async () => {
    const initial = await openAndroidSession();
    initial.dismissInstall();
    const session = await qualifyingInstallSession();

    session.recordInstallRepromptSession();
    session.recordInstallRepromptSession();

    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('1');
  });

  it('does not count a page load without enough drawing', async () => {
    const initial = await openAndroidSession();
    initial.dismissInstall();
    const session = await openAndroidSession();

    session.recordInstallRepromptSession();

    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();
  });

  it('does not count before the initial banner has been dismissed', async () => {
    const session = await openAndroidSession();
    const { canvasState, SETTLED_IN_STROKES } = await import('./canvas.svelte');
    canvasState.strokeCount = SETTLED_IN_STROKES;

    session.recordInstallRepromptSession();

    expect(session.installPromptStage()).toBe('initial');
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();
  });

  it('does not count while install is unavailable', async () => {
    localStorage.setItem(STORAGE_KEYS.installDismissed, 'true');
    const session = await freshModule();
    session.initInstallPrompt();
    const { canvasState, SETTLED_IN_STROKES } = await import('./canvas.svelte');
    canvasState.strokeCount = SETTLED_IN_STROKES;

    session.recordInstallRepromptSession();

    expect(session.install.mode).toBe('none');
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();
  });

  it('keeps an unconsumed re-prompt at the same milestone across relaunches', async () => {
    const initial = await openAndroidSession();
    initial.dismissInstall();
    for (let count = 1; count <= 5; count += 1) await qualifyingInstallSession();

    const relaunched = await qualifyingInstallSession();

    expect(relaunched.installPromptStage()).toBe('returning');
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBe('5');
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptsUsed)).toBeNull();
  });
});

describe('install auto-clear', () => {
  it('dismisses and persists after five strokes relative to when it is armed', async () => {
    const { install, armInstallAutoClear, autoDismissInstallIfDue } = await freshModule();
    const { canvasState } = await import('./canvas.svelte');
    canvasState.strokeCount = 12;
    armInstallAutoClear();

    canvasState.strokeCount = 16;
    expect(autoDismissInstallIfDue()).toBe(false);
    expect(install.dismissed).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.installDismissed)).toBeNull();

    canvasState.strokeCount = 17;
    expect(autoDismissInstallIfDue()).toBe(true);
    expect(install.dismissed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.installDismissed)).toBe('true');
  });
});
