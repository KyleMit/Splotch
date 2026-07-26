import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctrl = vi.hoisted(() => ({ native: false }));
const prefsStore = vi.hoisted(() => new Map<string, string>());
const secureStore = vi.hoisted(() => ({ apiKey: null as string | null }));

vi.mock('../platform', () => ({
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
}));

vi.mock('../idb', () => ({
  requestPersistentStorage: vi.fn(async () => false),
}));

vi.mock('../state/saveFolder.svelte', () => ({
  hydrateSaveFolder: vi.fn(),
}));

vi.mock('../orientation', () => ({
  applyDeviceOrientationPreference: vi.fn(),
}));

import { STORAGE_KEYS } from '../storage';
import { settings } from '../state/settings.svelte';
import { hydratePersistedState } from './persistedState';

beforeEach(() => {
  localStorage.clear();
  prefsStore.clear();
  secureStore.apiKey = null;
  settings.aiUserApiKey = '';
  ctrl.native = false;
});

describe('hydratePersistedState', () => {
  it('migrates a legacy API key restored from Preferences and scrubs both plaintext copies', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'durable-legacy-key');

    await hydratePersistedState();

    expect(settings.aiUserApiKey).toBe('durable-legacy-key');
    expect(secureStore.apiKey).toBe('durable-legacy-key');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
    await vi.waitFor(() => expect(prefsStore.has(STORAGE_KEYS.legacyAiUserApiKey)).toBe(false));
  });
});
