import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory stand-in for secure storage (Keychain/Keystore on native, the
// encrypted IndexedDB payload on the web) so hydrateApiKey's migration can be
// exercised without a real platform vault.
const secureStore = vi.hoisted(() => ({ apiKey: null as string | null }));

vi.mock('../secureStorage', () => ({
  saveApiKey: vi.fn(async (value: string) => {
    secureStore.apiKey = value;
  }),
  loadApiKey: vi.fn(async () => secureStore.apiKey),
  clearApiKey: vi.fn(async () => {
    secureStore.apiKey = null;
  }),
  requestPersistentStorage: vi.fn(async () => false),
}));

import { settings } from './settings.svelte';
import { hydrateApiKey, setAiUserApiKey } from './aiKey.svelte';
import { saveApiKey } from '../secureStorage';

const LEGACY_AI_USER_API_KEY = 'splotch-ai-user-api-key';

beforeEach(() => {
  localStorage.clear();
  secureStore.apiKey = null;
  settings.aiUserApiKey = '';
  vi.mocked(saveApiKey)
    .mockReset()
    .mockImplementation(async (value: string) => {
      secureStore.apiKey = value;
    });
});

describe('setAiUserApiKey', () => {
  it('commits the live key only after secure persistence succeeds', async () => {
    let finishSave!: () => void;
    vi.mocked(saveApiKey).mockImplementationOnce(
      (value: string) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            secureStore.apiKey = value;
            resolve();
          };
        })
    );

    const saving = setAiUserApiKey('AIza-persisted');
    await vi.waitFor(() => expect(saveApiKey).toHaveBeenCalledOnce());

    expect(settings.aiUserApiKey).toBe('');
    finishSave();
    await saving;

    expect(settings.aiUserApiKey).toBe('AIza-persisted');
    expect(secureStore.apiKey).toBe('AIza-persisted');
  });

  it('keeps the live key empty when secure persistence rejects', async () => {
    vi.mocked(saveApiKey).mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(setAiUserApiKey('AIza-rejected')).rejects.toThrow('secure storage unavailable');

    expect(settings.aiUserApiKey).toBe('');
    expect(secureStore.apiKey).toBeNull();
  });

  it('a second call supersedes an in-flight first write', async () => {
    let finishSave!: () => void;
    vi.mocked(saveApiKey).mockImplementationOnce(
      (value: string) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            secureStore.apiKey = value;
            resolve();
          };
        })
    );

    const firstWrite = setAiUserApiKey('first');
    await vi.waitFor(() => expect(saveApiKey).toHaveBeenCalledOnce());

    const secondWrite = setAiUserApiKey('second');
    finishSave();

    expect(await secondWrite).toBe(true);
    expect(settings.aiUserApiKey).toBe('second');

    expect(await firstWrite).toBe(false);
    expect(settings.aiUserApiKey).toBe('second');
  });

  it('ownership lost mid-flight restores the prior credential', async () => {
    settings.aiUserApiKey = 'prior-key';
    secureStore.apiKey = 'prior-key';

    let ownsRequest = true;
    vi.mocked(saveApiKey).mockImplementationOnce(async (value: string) => {
      secureStore.apiKey = value;
      ownsRequest = false;
    });

    const result = await setAiUserApiKey('new-key', () => ownsRequest);

    expect(result).toBe(false);
    expect(settings.aiUserApiKey).toBe('prior-key');
    expect(secureStore.apiKey).toBe('prior-key');
  });
});

describe('hydrateApiKey', () => {
  it('hydrates the live store from secure storage', async () => {
    secureStore.apiKey = 'stored-key';
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('stored-key');
  });

  it('leaves the store empty when nothing is saved anywhere', async () => {
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('');
    expect(secureStore.apiKey).toBeNull();
  });

  it('migrates a legacy plaintext key into secure storage and scrubs the plaintext copy', async () => {
    localStorage.setItem(LEGACY_AI_USER_API_KEY, 'legacy-key');

    await hydrateApiKey();

    expect(settings.aiUserApiKey).toBe('legacy-key');
    expect(secureStore.apiKey).toBe('legacy-key');
    expect(localStorage.getItem(LEGACY_AI_USER_API_KEY)).toBeNull();
  });

  it('prefers the secure copy over a stale legacy plaintext key', async () => {
    secureStore.apiKey = 'secure-key';
    localStorage.setItem(LEGACY_AI_USER_API_KEY, 'stale-legacy-key');

    await hydrateApiKey();

    expect(settings.aiUserApiKey).toBe('secure-key');
    expect(secureStore.apiKey).toBe('secure-key');
  });

  it('two boots racing the legacy migration both end with the key intact', async () => {
    localStorage.setItem(LEGACY_AI_USER_API_KEY, 'legacy-key');

    await Promise.all([hydrateApiKey(), hydrateApiKey()]);

    expect(settings.aiUserApiKey).toBe('legacy-key');
    expect(secureStore.apiKey).toBe('legacy-key');
    expect(localStorage.getItem(LEGACY_AI_USER_API_KEY)).toBeNull();
  });
});
