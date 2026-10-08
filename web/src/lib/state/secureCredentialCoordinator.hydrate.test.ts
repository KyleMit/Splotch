import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for secure storage (Keychain/Keystore on native, the
// encrypted IndexedDB payload on the web), one slot per credential.
const secureStore = vi.hoisted(() => ({
  apiKey: null as string | null,
  accessCode: null as string | null,
}));

vi.mock('../secureStorage', async (importOriginal) => ({
  UnreadableSecretError: (await importOriginal<typeof import('../secureStorage')>())
    .UnreadableSecretError,
  saveApiKey: vi.fn(),
  loadApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  saveAccessCode: vi.fn(),
  loadAccessCode: vi.fn(),
  clearAccessCode: vi.fn(),
}));

vi.mock('../idb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../idb')>()),
  requestPersistentStorage: vi.fn(async () => false),
}));

import {
  clearAccessCode,
  clearApiKey,
  loadAccessCode,
  loadApiKey,
  saveAccessCode,
  saveApiKey,
} from '../secureStorage';
import { STORAGE_KEYS } from '../storage';
import { hydrateAiAccessToken, setAiAccessToken } from './aiAccessToken';
import { hydrateApiKey, setAiUserApiKey } from './aiKey';
import { settingsState } from './settings.svelte';

// Both boot hydrations run the same legacy-plaintext migration, so every edge
// case here runs against each credential through its public entry points.
const CREDENTIALS = [
  {
    name: 'API key',
    slot: 'apiKey',
    legacyKey: STORAGE_KEYS.legacyAiUserApiKey,
    save: saveApiKey,
    load: loadApiKey,
    clear: clearApiKey,
    hydrate: hydrateApiKey,
    set: setAiUserApiKey,
    live: () => settingsState.aiUserApiKey,
    mirror: settingsState.mirrorAiUserApiKey,
  },
  {
    name: 'access code',
    slot: 'accessCode',
    legacyKey: STORAGE_KEYS.legacyAiAccessToken,
    save: saveAccessCode,
    load: loadAccessCode,
    clear: clearAccessCode,
    hydrate: hydrateAiAccessToken,
    set: setAiAccessToken,
    live: () => settingsState.aiAccessToken,
    mirror: settingsState.mirrorAiAccessToken,
  },
] as const;

function installSecureStore() {
  for (const { slot, save, load, clear } of CREDENTIALS) {
    vi.mocked(save)
      .mockReset()
      .mockImplementation(async (value: string) => {
        secureStore[slot] = value;
      });
    vi.mocked(load)
      .mockReset()
      .mockImplementation(async () => secureStore[slot]);
    vi.mocked(clear)
      .mockReset()
      .mockImplementation(async () => {
        secureStore[slot] = null;
      });
  }
}

beforeEach(() => {
  localStorage.clear();
  secureStore.apiKey = null;
  secureStore.accessCode = null;
  for (const { mirror } of CREDENTIALS) mirror('');
  installSecureStore();
});

// Each module wires one coordinator, and a hydration that rejects latches it
// into refusing every later write until a hydration completes. A clean
// hydration here keeps that latch inside the test that set it.
afterEach(async () => {
  localStorage.clear();
  installSecureStore();
  for (const { hydrate } of CREDENTIALS) await hydrate();
});

describe.each(CREDENTIALS)('$name boot hydration', (credential) => {
  const { slot, legacyKey, save, load, hydrate, set, live } = credential;

  it('restores the stored credential into the live store', async () => {
    secureStore[slot] = 'stored-credential';

    await hydrate();

    expect(live()).toBe('stored-credential');
  });

  it('leaves both stores empty when nothing is saved anywhere', async () => {
    await hydrate();

    expect(live()).toBe('');
    expect(secureStore[slot]).toBeNull();
  });

  it('migrates a legacy plaintext copy into secure storage and scrubs it', async () => {
    localStorage.setItem(legacyKey, 'legacy-credential');

    await hydrate();

    expect(live()).toBe('legacy-credential');
    expect(secureStore[slot]).toBe('legacy-credential');
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('prefers the secure copy over a stale plaintext copy and scrubs it', async () => {
    secureStore[slot] = 'secure-credential';
    localStorage.setItem(legacyKey, 'stale-credential');

    await hydrate();

    expect(live()).toBe('secure-credential');
    expect(secureStore[slot]).toBe('secure-credential');
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('keeps the plaintext copy and the live store empty when migration fails', async () => {
    localStorage.setItem(legacyKey, 'retryable-credential');
    vi.mocked(save).mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(hydrate()).rejects.toThrow('secure storage unavailable');

    expect(live()).toBe('');
    expect(secureStore[slot]).toBeNull();
    expect(localStorage.getItem(legacyKey)).toBe('retryable-credential');
  });

  it('two boots racing the legacy migration both end with the credential intact', async () => {
    localStorage.setItem(legacyKey, 'legacy-credential');

    await Promise.all([hydrate(), hydrate()]);

    expect(live()).toBe('legacy-credential');
    expect(secureStore[slot]).toBe('legacy-credential');
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('retains completed fallback persistence as the baseline for a superseding abandoned replacement', async () => {
    vi.mocked(load).mockRejectedValueOnce(new Error('transient read'));
    await expect(hydrate()).rejects.toThrow('transient read');
    localStorage.setItem(legacyKey, 'fallback-credential');
    const writing = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    vi.mocked(save).mockImplementationOnce(async (value) => {
      writing.resolve();
      await releaseWrite.promise;
      secureStore[slot] = value;
    });
    const hydration = hydrate();
    await writing.promise;
    let owned = true;
    vi.mocked(save).mockImplementationOnce(async (value) => {
      secureStore[slot] = value;
      owned = false;
    });
    const replacement = set('abandoned', () => owned);
    releaseWrite.resolve();
    await hydration;
    await expect(replacement).resolves.toBe(false);
    expect(live()).toBe('');
    expect(secureStore[slot]).toBe('fallback-credential');
    expect(vi.mocked(save).mock.calls.map(([value]) => value)).toEqual([
      'fallback-credential',
      'abandoned',
      'fallback-credential',
    ]);
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('never replaces a live credential with a stale plaintext copy', async () => {
    await set('fresh-credential');
    localStorage.setItem(legacyKey, 'stale-credential');
    vi.mocked(load).mockResolvedValueOnce(null);

    await hydrate();

    expect(live()).toBe('fresh-credential');
    expect(secureStore[slot]).toBe('fresh-credential');
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  // The read is held open deliberately: with the default mock it resolves on
  // the next microtask and hydration finishes before the save is issued, so the
  // superseding ordering never occurs.
  it('never migrates over a credential saved while hydration was still reading', async () => {
    localStorage.setItem(legacyKey, 'legacy-credential');
    let releaseRead!: () => void;
    const readHeld = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    vi.mocked(load).mockImplementationOnce(async () => {
      const seen = secureStore[slot];
      await readHeld;
      return seen;
    });

    const hydrating = hydrate();
    const saving = set('just-saved');
    releaseRead();
    await Promise.all([hydrating, saving]);

    expect(live()).toBe('just-saved');
    expect(secureStore[slot]).toBe('just-saved');
    // The superseded boot stops before its scrub; the next boot scrubs the
    // plaintext without restoring it.
    expect(localStorage.getItem(legacyKey)).toBe('legacy-credential');
    await hydrate();
    expect(live()).toBe('just-saved');
    expect(secureStore[slot]).toBe('just-saved');
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });
});
