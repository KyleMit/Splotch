import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: false,
  supportsLock: true,
  nativeLock: vi.fn<(options: { orientation: string }) => Promise<void>>(),
  nativeUnlock: vi.fn<() => Promise<void>>(),
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
  supportsOrientationLock: () => mocks.supportsLock,
}));
vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: { lock: mocks.nativeLock, unlock: mocks.nativeUnlock },
}));

const webLock = vi.fn<(orientation: string) => Promise<void>>();
const webUnlock = vi.fn<() => void>();

// `lastRequested` is module state, so every test starts from an unlatched module.
async function freshModule() {
  vi.resetModules();
  return import('./orientation');
}

beforeEach(() => {
  mocks.native = false;
  mocks.supportsLock = true;
  mocks.nativeLock.mockReset().mockResolvedValue(undefined);
  mocks.nativeUnlock.mockReset().mockResolvedValue(undefined);
  webLock.mockReset().mockResolvedValue(undefined);
  webUnlock.mockReset();
  Object.defineProperty(window.screen, 'orientation', {
    value: { lock: webLock, unlock: webUnlock },
    configurable: true,
  });
});

describe('applyDeviceOrientationPreference on native', () => {
  beforeEach(() => {
    mocks.native = true;
  });

  it('locks once for repeated calls with the same target', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true);
    await applyDeviceOrientationPreference(true, true);

    expect(mocks.nativeLock).toHaveBeenCalledTimes(1);
    expect(mocks.nativeLock).toHaveBeenCalledWith({ orientation: 'landscape' });
  });

  it('locks again for a changed target', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true);
    await applyDeviceOrientationPreference(true, false);

    expect(mocks.nativeLock).toHaveBeenNthCalledWith(2, { orientation: 'portrait' });
  });

  it('retries the same target after a failed lock', async () => {
    mocks.nativeLock.mockRejectedValue(new Error('plugin not ready'));
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, false);
    await applyDeviceOrientationPreference(true, false);

    expect(mocks.nativeLock).toHaveBeenCalledTimes(2);
  });

  it('retries the same target after a failed unlock', async () => {
    mocks.nativeUnlock.mockRejectedValue(new Error('plugin not ready'));
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(false, false);
    await applyDeviceOrientationPreference(false, false);

    expect(mocks.nativeUnlock).toHaveBeenCalledTimes(2);
  });
});

describe('applyDeviceOrientationPreference on the web', () => {
  it('locks once for repeated calls with the same target', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, false);
    await applyDeviceOrientationPreference(true, false);

    expect(webLock).toHaveBeenCalledTimes(1);
    expect(webLock).toHaveBeenCalledWith('portrait');
  });

  it('retries the same target after a rejected lock', async () => {
    webLock.mockRejectedValue(new Error('needs fullscreen'));
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true);
    // The web branch never awaits the lock, so let its rejection handler settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await applyDeviceOrientationPreference(true, true);

    expect(webLock).toHaveBeenCalledTimes(2);
  });

  it('skips locking where the OS owns orientation', async () => {
    mocks.supportsLock = false;
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true);

    expect(webLock).not.toHaveBeenCalled();
  });
});
