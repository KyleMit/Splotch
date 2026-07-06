import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ native: false }));
vi.mock('$app/environment', () => ({ browser: true }));
// Keep the real isStandalone (it reads the window.matchMedia stub that
// setStandalone() controls); only isNative needs to be driven per-test.
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
}));

const DISMISSED_KEY = 'splotch-install-dismissed';
const INSTALLED_KEY = 'splotch-install-completed';

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
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    window.dispatchEvent(makePromptEvent('accepted'));
    expect(install.mode).toBe('oneTap');
  });

  it('captures a prompt that fires before init — the listener lives at module load', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt } = await freshModule();
    window.dispatchEvent(makePromptEvent('accepted'));
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
    localStorage.setItem(INSTALLED_KEY, 'true');
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.installed).toBe(true);
    expect(install.mode).toBe('none');
  });

  it('re-offers one-tap when a fresh prompt disproves a stale installed flag', async () => {
    // localStorage survives a PWA uninstall; beforeinstallprompt only fires
    // when the app is NOT installed, so the live event wins.
    setUA(ANDROID_UA);
    localStorage.setItem(INSTALLED_KEY, 'true');
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    expect(install.mode).toBe('none');

    window.dispatchEvent(makePromptEvent('accepted'));
    expect(install.mode).toBe('oneTap');
    expect(install.installed).toBe(false);
    expect(localStorage.getItem(INSTALLED_KEY)).toBe('false');
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
    const { install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    window.dispatchEvent(makePromptEvent('accepted'));

    const outcome = await promptInstall();
    expect(outcome).toBe('accepted');
    expect(install.installed).toBe(true);
    expect(install.mode).toBe('none');
    expect(localStorage.getItem(INSTALLED_KEY)).toBe('true');
  });

  it('falls back to the manual hint and stops nagging when declined', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    window.dispatchEvent(makePromptEvent('dismissed'));

    const outcome = await promptInstall();
    expect(outcome).toBe('dismissed');
    expect(install.installed).toBe(false);
    expect(install.mode).toBe('android');
    expect(install.dismissed).toBe(true);
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');
  });

  it('reports unavailable when there is no live prompt to replay', async () => {
    setUA(ANDROID_UA);
    const { initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    expect(await promptInstall()).toBe('unavailable');
  });

  it('cannot be replayed twice from a single event', async () => {
    setUA(ANDROID_UA);
    const { initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    window.dispatchEvent(makePromptEvent('accepted'));
    expect(await promptInstall()).toBe('accepted');
    expect(await promptInstall()).toBe('unavailable');
  });

  it('reports unavailable and drops to the manual hint when the prompt throws', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    const e = new Event('beforeinstallprompt');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).prompt = vi.fn().mockRejectedValue(new Error('prompt went stale'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(e);

    expect(await promptInstall()).toBe('unavailable');
    expect(install.mode).toBe('android');
  });

  it('drops a stale oneTap mode to the manual hint when the prompt is already spent', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt, promptInstall } = await freshModule();
    initInstallPrompt();
    const e = new Event('beforeinstallprompt');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).prompt = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).userChoice = new Promise(() => {}); // dialog still open
    window.dispatchEvent(e);

    void promptInstall(); // consumes the one-shot event
    expect(await promptInstall()).toBe('unavailable');
    expect(install.mode).toBe('android');
  });
});

describe('appinstalled event', () => {
  it('marks installed and persists when the browser installs by any path', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt } = await freshModule();
    initInstallPrompt();
    window.dispatchEvent(new Event('appinstalled'));
    expect(install.installed).toBe(true);
    expect(install.mode).toBe('none');
    expect(localStorage.getItem(INSTALLED_KEY)).toBe('true');
  });
});

describe('dismissInstall', () => {
  it('remembers the dismissal across sessions', async () => {
    setUA(ANDROID_UA);
    const { install, initInstallPrompt, dismissInstall } = await freshModule();
    initInstallPrompt();
    dismissInstall();
    expect(install.dismissed).toBe(true);
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');

    const next = await freshModule();
    next.initInstallPrompt();
    expect(next.install.dismissed).toBe(true);
  });
});
