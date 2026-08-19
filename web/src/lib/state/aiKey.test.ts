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
import { hydrateApiKey, setAiUserApiKey } from './aiKey';
import { loadApiKey, saveApiKey } from '../secureStorage';
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
  vi.mocked(loadApiKey)
    .mockReset()
    .mockImplementation(async () => secureStore.apiKey);
  vi.mocked(requestPersistentStorage).mockReset().mockResolvedValue(false);
});

describe('setAiUserApiKey', () => {
  it('requests persistent storage when a parent saves a key without waiting for permission', async () => {
    vi.mocked(requestPersistentStorage).mockImplementationOnce(() => new Promise(() => {}));

    await setAiUserApiKey('sk-persisted');

    expect(requestPersistentStorage).toHaveBeenCalledOnce();
    expect(secureStore.apiKey).toBe('sk-persisted');
  });

  it('does not request persistent storage when a parent forgets a key', async () => {
    secureStore.apiKey = 'sk-existing';

    await setAiUserApiKey('');

    expect(requestPersistentStorage).not.toHaveBeenCalled();
    expect(secureStore.apiKey).toBeNull();
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
  it('does not request persistent storage during startup hydration', async () => {
    secureStore.apiKey = 'sk-stored-key';

    await hydrateApiKey();

    expect(requestPersistentStorage).not.toHaveBeenCalled();
  });

  it('hydrates the live store from secure storage', async () => {
    secureStore.apiKey = 'sk-stored-key';
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('sk-stored-key');
  });

  it('never deletes a key that arrived while hydration was still reading', async () => {
    // hydrateApiKey awaits loadApiKey, and a parent can finish saving inside
    // that window. The delete does not go through the write coordinator — which
    // exists precisely so an older write cannot land on a newer one — so without
    // a guard it erases the key that just arrived, acting on the value that
    // preceded it. The session looks healthy and the credential is gone at the
    // next launch.
    //
    // The read is held open deliberately: with the default mock it resolves on
    // the next microtask and hydration finishes before the save even starts, so
    // the dangerous ordering never occurs and the test would pass against the
    // bug it is named for.
    secureStore.apiKey = 'AIzaSyStoredBeforeTheMigration';
    let releaseRead!: () => void;
    const readHeld = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    vi.mocked(loadApiKey).mockImplementationOnce(async () => {
      const seen = secureStore.apiKey;
      await readHeld;
      return seen;
    });

    const hydrating = hydrateApiKey();
    const saving = setAiUserApiKey('sk-just-saved');
    releaseRead();
    await Promise.all([hydrating, saving]);

    expect(secureStore.apiKey).toBe('sk-just-saved');
    expect(settings.aiUserApiKey).toBe('sk-just-saved');
  });

  it('leaves an unrecognised key alone rather than deleting what it cannot classify', async () => {
    // Destructive on recognition, not on failure to recognise: a future key
    // format this build has never heard of must survive an old build's boot.
    secureStore.apiKey = 'xx-some-future-key-shape';
    await hydrateApiKey();
    expect(secureStore.apiKey).toBe('xx-some-future-key-shape');
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
