import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: false,
  platform: 'android' as 'android' | 'ios',
  supportsLock: true,
  nativeLock: vi.fn<(options: { orientation: string }) => Promise<void>>(),
  nativeUnlock: vi.fn<() => Promise<void>>(),
  followSensor: vi.fn<() => Promise<void>>(),
  sensorModuleDelayMs: 0,
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
  getPlatform: () => (mocks.native ? mocks.platform : 'web'),
  supportsOrientationLock: () => mocks.supportsLock,
}));
vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: { lock: mocks.nativeLock, unlock: mocks.nativeUnlock },
}));
vi.mock('$lib/plugins/sensorOrientation', async () => {
  await new Promise((resolve) => setTimeout(resolve, mocks.sensorModuleDelayMs));
  return { SensorOrientation: { followSensor: mocks.followSensor } };
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const webLock = vi.fn<(orientation: string) => Promise<void>>();
const webUnlock = vi.fn<() => void>();

// `lastRequested` is module state, so every test starts from an unlatched module.
async function freshModule() {
  vi.resetModules();
  return import('./orientation');
}

beforeEach(() => {
  mocks.native = false;
  mocks.platform = 'android';
  mocks.sensorModuleDelayMs = 0;
  mocks.supportsLock = true;
  mocks.nativeLock.mockReset().mockResolvedValue(undefined);
  mocks.nativeUnlock.mockReset().mockResolvedValue(undefined);
  mocks.followSensor.mockReset().mockResolvedValue(undefined);
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

    await applyDeviceOrientationPreference(true, true, false);
    await applyDeviceOrientationPreference(true, true, false);

    expect(mocks.nativeLock).toHaveBeenCalledTimes(1);
    expect(mocks.nativeLock).toHaveBeenCalledWith({ orientation: 'landscape' });
  });

  it('locks again for a changed target', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true, false);
    await applyDeviceOrientationPreference(true, false, false);

    expect(mocks.nativeLock).toHaveBeenNthCalledWith(2, { orientation: 'portrait' });
  });

  it('retries the same target after a failed lock', async () => {
    mocks.nativeLock.mockRejectedValue(new Error('plugin not ready'));
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, false, false);
    await applyDeviceOrientationPreference(true, false, false);

    expect(mocks.nativeLock).toHaveBeenCalledTimes(2);
  });

  it('ignores fullscreen changes', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true, false);
    await applyDeviceOrientationPreference(true, true, true);

    expect(mocks.nativeLock).toHaveBeenCalledTimes(1);
  });

  it('retries the same target after a failed unlock', async () => {
    mocks.followSensor.mockRejectedValue(new Error('plugin not ready'));
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(false, false, false);
    await applyDeviceOrientationPreference(false, false, false);

    expect(mocks.followSensor).toHaveBeenCalledTimes(2);
  });

  it('follows the sensor on Android so Auto rotates past the OS rotation lock', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(false, false, false);

    expect(mocks.followSensor).toHaveBeenCalledTimes(1);
    expect(mocks.nativeUnlock).not.toHaveBeenCalled();
  });

  it('drops an Auto request that a Portrait request overtook while loading', async () => {
    mocks.sensorModuleDelayMs = 10;
    const { applyDeviceOrientationPreference } = await freshModule();

    const auto = applyDeviceOrientationPreference(false, false, false);
    await applyDeviceOrientationPreference(true, false, false);
    await auto;

    expect(mocks.nativeLock).toHaveBeenCalledWith({ orientation: 'portrait' });
    expect(mocks.followSensor).not.toHaveBeenCalled();
  });

  it('unlocks through the plugin on iOS', async () => {
    mocks.platform = 'ios';
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(false, false, false);

    expect(mocks.nativeUnlock).toHaveBeenCalledTimes(1);
    expect(mocks.followSensor).not.toHaveBeenCalled();
  });

  it('pins Portrait through the plugin after Auto on Android', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(false, false, false);
    await applyDeviceOrientationPreference(true, false, false);

    expect(mocks.nativeLock).toHaveBeenCalledWith({ orientation: 'portrait' });
  });
});

describe('applyDeviceOrientationPreference on the web', () => {
  it('locks once for repeated calls with the same target', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, false, false);
    await applyDeviceOrientationPreference(true, false, false);

    expect(webLock).toHaveBeenCalledTimes(1);
    expect(webLock).toHaveBeenCalledWith('portrait');
  });

  it('retries the same target after a rejected lock', async () => {
    webLock.mockRejectedValue(new Error('needs fullscreen'));
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true, false);
    // The web branch never awaits the lock, so let its rejection handler settle.
    await settle();
    await applyDeviceOrientationPreference(true, true, false);

    expect(webLock).toHaveBeenCalledTimes(2);
  });

  it('retries a lock the tab refused once fullscreen begins', async () => {
    webLock.mockRejectedValueOnce(new Error('needs fullscreen'));
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, false, false);
    await settle();
    await applyDeviceOrientationPreference(true, false, true);

    expect(webLock).toHaveBeenCalledTimes(2);
    expect(webLock).toHaveBeenLastCalledWith('portrait');
  });

  it('requests the lock again on re-entering fullscreen after leaving it', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true, true);
    webLock.mockRejectedValueOnce(new Error('needs fullscreen'));
    await applyDeviceOrientationPreference(true, true, false);
    await settle();
    await applyDeviceOrientationPreference(true, true, true);

    expect(webLock).toHaveBeenCalledTimes(3);
  });

  it('keeps a fullscreen lock latched across repeated calls', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true, true);
    await applyDeviceOrientationPreference(true, true, true);

    expect(webLock).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer request when an older lock is refused', async () => {
    let refuseWindowed: (reason: Error) => void = () => {};
    webLock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          refuseWindowed = reject;
        })
    );
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, false, false);
    await applyDeviceOrientationPreference(true, false, true);
    refuseWindowed(new Error('needs fullscreen'));
    await settle();
    await applyDeviceOrientationPreference(true, false, true);

    expect(webLock).toHaveBeenCalledTimes(2);
  });

  it('does not unlock again when fullscreen changes', async () => {
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(false, false, false);
    await applyDeviceOrientationPreference(false, false, true);
    await applyDeviceOrientationPreference(false, false, false);

    expect(webUnlock).toHaveBeenCalledTimes(1);
  });

  it('skips locking where the OS owns orientation', async () => {
    mocks.supportsLock = false;
    const { applyDeviceOrientationPreference } = await freshModule();

    await applyDeviceOrientationPreference(true, true, false);

    expect(webLock).not.toHaveBeenCalled();
  });
});
