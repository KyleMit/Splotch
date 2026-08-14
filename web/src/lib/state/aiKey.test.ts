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
}));

vi.mock('../idb', () => ({
  requestPersistentStorage: vi.fn(async () => false),
}));

import { settings } from './settings.svelte';
import { createAiKeyWriteCoordinator, hydrateApiKey, setAiUserApiKey } from './aiKey';
import { saveApiKey } from '../secureStorage';
import { requestPersistentStorage } from '../idb';
import { STORAGE_KEYS } from '../storage';

beforeEach(() => {
  localStorage.clear();
  secureStore.apiKey = null;
  settings.aiUserApiKey = '';
  vi.mocked(saveApiKey)
    .mockReset()
    .mockImplementation(async (value: string) => {
      secureStore.apiKey = value;
    });
  vi.mocked(requestPersistentStorage).mockReset().mockResolvedValue(false);
});

describe('setAiUserApiKey', () => {
  it('gives each coordinator an independent write queue', async () => {
    let finishFirstWrite!: () => void;
    const firstState = { aiUserApiKey: '' };
    const secondState = { aiUserApiKey: '' };
    const firstCoordinator = createAiKeyWriteCoordinator(
      firstState,
      () =>
        new Promise<void>((resolve) => {
          finishFirstWrite = resolve;
        })
    );
    const secondCoordinator = createAiKeyWriteCoordinator(secondState, async () => {});

    const firstWrite = firstCoordinator.setAiUserApiKey('first');
    await vi.waitFor(() => expect(finishFirstWrite).toBeTypeOf('function'));

    await expect(secondCoordinator.setAiUserApiKey('second')).resolves.toBe(true);
    expect(secondState.aiUserApiKey).toBe('second');

    finishFirstWrite();
    await expect(firstWrite).resolves.toBe(true);
    expect(firstState.aiUserApiKey).toBe('first');
  });

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

    const saving = setAiUserApiKey('sk-persisted');
    await vi.waitFor(() => expect(saveApiKey).toHaveBeenCalledOnce());

    expect(settings.aiUserApiKey).toBe('');
    finishSave();
    await saving;

    expect(settings.aiUserApiKey).toBe('sk-persisted');
    expect(secureStore.apiKey).toBe('sk-persisted');
  });

  it('keeps the live key empty when secure persistence rejects', async () => {
    vi.mocked(saveApiKey).mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(setAiUserApiKey('sk-rejected')).rejects.toThrow('secure storage unavailable');

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
    expect(secureStore.apiKey).toBe('second');
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
  it('starts persistence without waiting for it', async () => {
    vi.mocked(requestPersistentStorage).mockImplementationOnce(() => new Promise(() => {}));

    await hydrateApiKey();

    expect(requestPersistentStorage).toHaveBeenCalledOnce();
  });

  it('hydrates the live store from secure storage', async () => {
    secureStore.apiKey = 'sk-stored-key';
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('sk-stored-key');
  });

  it('forgets a stored key from the retired provider instead of restoring it', async () => {
    // Restoring it would leave AI switched on and fail every generation with an
    // upstream error the parent cannot act on. Forgetting it puts Settings back
    // into the state that explains what to do.
    secureStore.apiKey = 'AIzaSyStoredBeforeTheMigration';
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('');
    expect(secureStore.apiKey).toBeNull();
  });

  it('leaves the store empty when nothing is saved anywhere', async () => {
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('');
    expect(secureStore.apiKey).toBeNull();
  });

  it('migrates a legacy plaintext key into secure storage and scrubs the plaintext copy', async () => {
    localStorage.setItem(STORAGE_KEYS.legacyAiUserApiKey, 'sk-legacy-key');

    await hydrateApiKey();

    expect(settings.aiUserApiKey).toBe('sk-legacy-key');
    expect(secureStore.apiKey).toBe('sk-legacy-key');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
  });

  it('prefers the secure copy over a stale legacy plaintext key', async () => {
    secureStore.apiKey = 'sk-secure-key';
    localStorage.setItem(STORAGE_KEYS.legacyAiUserApiKey, 'sk-stale-legacy-key');

    await hydrateApiKey();

    expect(settings.aiUserApiKey).toBe('sk-secure-key');
    expect(secureStore.apiKey).toBe('sk-secure-key');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
  });

  it('two boots racing the legacy migration both end with the key intact', async () => {
    localStorage.setItem(STORAGE_KEYS.legacyAiUserApiKey, 'sk-legacy-key');

    await Promise.all([hydrateApiKey(), hydrateApiKey()]);

    expect(settings.aiUserApiKey).toBe('sk-legacy-key');
    expect(secureStore.apiKey).toBe('sk-legacy-key');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
  });
});
