import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real orientation module and its latch; only the native plugin, the
// durable store, and the platform answers are stood in.
const prefsStore = vi.hoisted(() => new Map<string, string>());
const lock = vi.hoisted(() => vi.fn<(options: { orientation: string }) => Promise<void>>());

vi.mock('$lib/platform', async (importActual) => ({
  ...(await importActual<typeof import('$lib/platform')>()),
  isNative: () => true,
  getPlatform: () => 'android',
  supportsOrientationLock: () => true,
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({
      value: prefsStore.has(key) ? prefsStore.get(key) : null,
    }),
    set: async ({ key, value }: { key: string; value: string }) => void prefsStore.set(key, value),
    remove: async ({ key }: { key: string }) => void prefsStore.delete(key),
  },
}));

vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: { lock, unlock: vi.fn(async () => {}) },
}));

vi.mock('../secureStorage', async (importOriginal) => ({
  UnreadableSecretError: (await importOriginal<typeof import('../secureStorage')>())
    .UnreadableSecretError,
  saveApiKey: vi.fn(async () => {}),
  loadApiKey: vi.fn(async () => null),
  clearApiKey: vi.fn(async () => {}),
  saveAccessCode: vi.fn(async () => {}),
  loadAccessCode: vi.fn(async () => null),
  clearAccessCode: vi.fn(async () => {}),
}));
vi.mock('../idb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../idb')>()),
  requestPersistentStorage: vi.fn(async () => false),
}));
vi.mock('../state/saveFolder.svelte', () => ({ hydrateSaveFolder: vi.fn() }));

import { STORAGE_KEYS } from '../storage';
import { applyDeviceOrientationPreference } from '../platform/orientation';
import { setOrientationChoice, settingsState } from '../state/settings.svelte';
import { fullscreenState } from '../state/fullscreen.svelte';
import { hydratePersistedState, hydrateSettings } from './persistedState';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let unmountDrawingRoute: (() => void) | null = null;

// Stands in for the orientation $effect in routes/+page.svelte.
function mountDrawingRouteOrientation() {
  unmountDrawingRoute = $effect.root(() => {
    $effect(() => {
      void applyDeviceOrientationPreference(
        settingsState.orientationChoice(),
        fullscreenState.active
      );
    });
  });
}

async function chooseOrientation(choice: 'portrait' | 'landscape') {
  setOrientationChoice(choice);
  flushSync();
  await settle();
}

// The WebView lost `lost` from localStorage; Preferences still holds `durable`.
function evict(lost: string[], durable: Record<string, string>) {
  for (const key of lost) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(durable)) prefsStore.set(key, value);
}

async function lockRequestsAfter(hydrate: () => Promise<void>) {
  lock.mockClear();
  await hydrate();
  flushSync();
  await settle();
  return lock.mock.calls.map(([options]) => options.orientation);
}

beforeEach(() => {
  localStorage.clear();
  prefsStore.clear();
  lock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  unmountDrawingRoute?.();
  unmountDrawingRoute = null;
});

describe('orientation after a durable restore', () => {
  it('reaches the device once when the restore changes the choice', async () => {
    mountDrawingRouteOrientation();
    await chooseOrientation('landscape');
    evict([STORAGE_KEYS.lockRotation, STORAGE_KEYS.forceLandscape], {
      [STORAGE_KEYS.lockRotation]: 'true',
      [STORAGE_KEYS.forceLandscape]: 'false',
    });

    expect(await lockRequestsAfter(hydrateSettings)).toEqual(['portrait']);
  });

  it('requests nothing when the restore leaves an applied choice unchanged', async () => {
    mountDrawingRouteOrientation();
    await chooseOrientation('landscape');
    evict([STORAGE_KEYS.soundVolume], { [STORAGE_KEYS.soundVolume]: '70' });

    expect(await lockRequestsAfter(hydrateSettings)).toEqual([]);
  });

  it('retries a lock that failed before the restore', async () => {
    mountDrawingRouteOrientation();
    await chooseOrientation('portrait');
    lock.mockRejectedValueOnce(new Error('refused'));
    await chooseOrientation('landscape');
    evict([STORAGE_KEYS.soundVolume], { [STORAGE_KEYS.soundVolume]: '70' });

    expect(await lockRequestsAfter(hydrateSettings)).toEqual(['landscape']);
  });

  it('applies a changed choice on a route without the orientation effect', async () => {
    await chooseOrientation('landscape');
    await applyDeviceOrientationPreference('landscape', false);
    evict([STORAGE_KEYS.lockRotation, STORAGE_KEYS.forceLandscape], {
      [STORAGE_KEYS.lockRotation]: 'true',
      [STORAGE_KEYS.forceLandscape]: 'false',
    });

    expect(await lockRequestsAfter(() => hydratePersistedState())).toEqual(['portrait']);
  });
});
