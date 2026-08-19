import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctrl = vi.hoisted(() => ({ native: false }));
const prefsStore = vi.hoisted(() => new Map<string, string>());
const secureStore = vi.hoisted(() => ({
  apiKey: null as string | null,
  accessCode: null as string | null,
}));

// Spread the real module so only the two platform *behaviours* are faked; the
// constants it also exports stay real rather than being restated here.
vi.mock('$lib/platform', async (importActual) => ({
  ...(await importActual<typeof import('$lib/platform')>()),
  isNative: () => ctrl.native,
  getPlatform: () => (ctrl.native ? 'android' : 'web'),
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

vi.mock('../secureStorage', () => ({
  saveApiKey: vi.fn(async (value: string) => {
    secureStore.apiKey = value;
  }),
  loadApiKey: vi.fn(async () => secureStore.apiKey),
  clearApiKey: vi.fn(async () => {
    secureStore.apiKey = null;
  }),
  saveAccessCode: vi.fn(async (value: string) => {
    secureStore.accessCode = value;
  }),
  loadAccessCode: vi.fn(async () => secureStore.accessCode),
  clearAccessCode: vi.fn(async () => {
    secureStore.accessCode = null;
  }),
}));

vi.mock('../idb', () => ({
  requestPersistentStorage: vi.fn(async () => false),
}));

vi.mock('../state/saveFolder.svelte', () => ({
  hydrateSaveFolder: vi.fn(),
}));

vi.mock('../platform/orientation', () => ({
  applyDeviceOrientationPreference: vi.fn(),
}));

import { STORAGE_KEYS } from '../storage';
import { saveAccessCode } from '../secureStorage';
import { applyDeviceOrientationPreference } from '../platform/orientation';
import { settings } from '../state/settings.svelte';
import { hydratePersistedState } from './persistedState';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  prefsStore.clear();
  secureStore.apiKey = null;
  secureStore.accessCode = null;
  settings.aiUserApiKey = '';
  settings.aiAccessToken = '';
  settings.lockRotationEnabled = true;
  settings.forceLandscapeOrientation = false;
  ctrl.native = false;
  vi.mocked(saveAccessCode)
    .mockReset()
    .mockImplementation(async (value: string) => {
      secureStore.accessCode = value;
    });
});

describe('hydratePersistedState', () => {
  it('migrates a legacy API key restored from Preferences and scrubs both plaintext copies', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'sk-durable-legacy-key');

    await hydratePersistedState();

    expect(settings.aiUserApiKey).toBe('sk-durable-legacy-key');
    expect(secureStore.apiKey).toBe('sk-durable-legacy-key');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
    await vi.waitFor(() => expect(prefsStore.has(STORAGE_KEYS.legacyAiUserApiKey)).toBe(false));
  });

  it('migrates a managed code restored from Preferences and scrubs both plaintext copies', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiAccessToken, 'durable-managed-code');

    await hydratePersistedState();

    expect(settings.aiAccessToken).toBe('durable-managed-code');
    expect(secureStore.accessCode).toBe('durable-managed-code');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBeNull();
    await vi.waitFor(() => expect(prefsStore.has(STORAGE_KEYS.legacyAiAccessToken)).toBe(false));
  });

  it('keeps both plaintext managed-code copies when secure migration fails', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiAccessToken, 'retryable-managed-code');
    vi.mocked(saveAccessCode).mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(hydratePersistedState()).rejects.toThrow('secure storage unavailable');

    expect(settings.aiAccessToken).toBe('');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBe('retryable-managed-code');
    expect(prefsStore.get(STORAGE_KEYS.legacyAiAccessToken)).toBe('retryable-managed-code');
  });

  it('applies the restored device orientation preference', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.lockRotation, 'false');
    prefsStore.set(STORAGE_KEYS.forceLandscape, 'true');

    await hydratePersistedState();

    expect(applyDeviceOrientationPreference).toHaveBeenCalledWith(false, true);
  });
});
