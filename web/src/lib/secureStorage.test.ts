import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import type { DBSchema, IdbDatabase } from './idbDatabase';
import { STORAGE_KEYS } from './storageKeys';

// The stand-in below is keyed and valued like secureStorage's own SecureDb,
// which the module keeps private.
interface SecretsDb extends DBSchema {
  secrets: { key: string; value: unknown };
}

if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);

const platform = vi.hoisted(() => ({ native: false }));
const nativeRows = vi.hoisted(() => new Map<string, string>());

vi.mock('$lib/platform', () => ({
  isNative: () => platform.native,
  getPlatform: () => 'web',
}));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    set: async (name: string, value: string) => void nativeRows.set(name, value),
    get: async (name: string) => nativeRows.get(name),
    remove: async (name: string) => void nativeRows.delete(name),
  },
}));

// In-memory stand-in for the idb-backed secrets store. `txGetOverride` lets a
// test simulate another tab writing the master key between the initial check
// and the readwrite transaction; `txPuts` records which rows the transactional
// path wrote.
const ctrl = vi.hoisted(() => {
  const rows = new Map<string, unknown>();
  const state = {
    rows,
    txPuts: [] as string[],
    failNextGet: false,
    holdNextGet: null as Promise<void> | null,
    abortNextTransaction: false,
    txGetOverride: null as ((key: string) => unknown) | null,
    closeConnection: () => {},
    reset() {
      rows.clear();
      state.txPuts.length = 0;
      state.failNextGet = false;
      state.holdNextGet = null;
      state.abortNextTransaction = false;
      state.txGetOverride = null;
      state.closeConnection = () => {};
    },
  };
  return state;
});

vi.mock('./idb', () => {
  const db = {
    closed: Promise.resolve(),
    async get(_store: string, key: string) {
      if (ctrl.failNextGet) {
        ctrl.failNextGet = false;
        throw new Error('transient idb failure');
      }
      const value = ctrl.rows.get(key);
      const hold = ctrl.holdNextGet;
      if (hold) {
        ctrl.holdNextGet = null;
        await hold;
      }
      return value;
    },
    async put(_store: string, value: unknown, key: string) {
      ctrl.rows.set(key, value);
    },
    async delete(_store: string, key: string) {
      ctrl.rows.delete(key);
    },
    // Like idb, `done` is created eagerly, so an aborted transaction rejects it
    // whether or not the caller ever awaits it.
    transaction(_store: string, _mode: string) {
      const aborted = ctrl.abortNextTransaction;
      ctrl.abortNextTransaction = false;
      const abortError = new Error('transaction aborted');
      return {
        store: {
          async get(key: string) {
            if (aborted) throw abortError;
            return ctrl.txGetOverride ? ctrl.txGetOverride(key) : ctrl.rows.get(key);
          },
          async put(value: unknown, key: string) {
            ctrl.txPuts.push(key);
            ctrl.rows.set(key, value);
          },
        },
        done: aborted ? Promise.reject(abortError) : Promise.resolve(),
      };
    },
  };
  // Each connection stays open until the test closes it; like the real memo, a
  // closed one is replaced on the next call, and like a real closed connection
  // it can no longer open a transaction.
  return {
    lazyIdbDatabase: () => {
      let connection: Promise<typeof db> | null = null;
      return () => {
        if (!connection) {
          let isClosed = false;
          const closed = new Promise<void>((resolve) => {
            ctrl.closeConnection = () => {
              isClosed = true;
              resolve();
            };
          });
          const assertOpen = () => {
            if (isClosed) throw new Error('The database connection is closing');
          };
          const current = Promise.resolve({
            closed,
            get(store: string, key: string) {
              assertOpen();
              return db.get(store, key);
            },
            put(store: string, value: unknown, key: string) {
              assertOpen();
              return db.put(store, value, key);
            },
            delete(store: string, key: string) {
              assertOpen();
              return db.delete(store, key);
            },
            transaction(store: string, mode: string) {
              assertOpen();
              return db.transaction(store, mode);
            },
          });
          void closed.then(() => {
            if (connection === current) connection = null;
          });
          connection = current;
        }
        return connection as unknown as Promise<IdbDatabase<SecretsDb>>;
      };
    },
  };
});

const MASTER_KEY_ROW = 'master-key';
const API_KEY_ROW = 'gemini-api-key';
const ACCESS_CODE_ROW = 'managed-access-code';

type SecureStorage = typeof import('./secureStorage');
let secureStorage: SecureStorage;

// Re-import per test so the module-level master-key memoization starts fresh,
// like a new tab.
beforeEach(async () => {
  ctrl.reset();
  nativeRows.clear();
  localStorage.clear();
  platform.native = false;
  vi.restoreAllMocks();
  vi.resetModules();
  secureStorage = await import('./secureStorage');
});

describe('web save/load round trip', () => {
  it('persists only ciphertext and loads the original value back', async () => {
    await secureStorage.saveApiKey('secret-key-123');

    const record = ctrl.rows.get(API_KEY_ROW) as { iv: Uint8Array; data: ArrayBuffer };
    expect(record.iv).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(record.data)).not.toContain('secret-key-123');

    await expect(secureStorage.loadApiKey()).resolves.toBe('secret-key-123');
  });

  it('returns null when nothing is stored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-payload value', 'not-a-payload'],
    ['a malformed payload', { iv: new Uint8Array(12), data: 'not-an-array-buffer' }],
  ])('warns and returns null when the secret row contains %s', async (_description, record) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ctrl.rows.set(API_KEY_ROW, record);

    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Secure storage load failed', expect.any(Error));
  });

  it('warns and returns null when the persisted master key cannot decrypt the payload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await secureStorage.saveApiKey('secret-key-123');
    const replacement = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    ctrl.rows.set(MASTER_KEY_ROW, replacement);

    vi.resetModules();
    const freshTab = await import('./secureStorage');

    await expect(freshTab.loadApiKey()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Secure storage load failed', expect.any(Error));
  });

  it('clearApiKey removes the payload but keeps the master key for reuse', async () => {
    await secureStorage.saveApiKey('secret-key-123');
    await secureStorage.clearApiKey();

    expect(ctrl.rows.has(API_KEY_ROW)).toBe(false);
    expect(ctrl.rows.has(MASTER_KEY_ROW)).toBe(true);
    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
  });

  it('clears a saved API key when saving an empty value', async () => {
    await secureStorage.saveApiKey('secret-key-123');
    await secureStorage.saveApiKey('');

    expect(ctrl.rows.has(API_KEY_ROW)).toBe(false);
    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
  });

  it('keeps the API key and managed access code in distinct encrypted rows', async () => {
    await secureStorage.saveApiKey('secret-key-123');
    await secureStorage.saveAccessCode('managed-code');

    expect(ctrl.rows.has(API_KEY_ROW)).toBe(true);
    expect(ctrl.rows.has(ACCESS_CODE_ROW)).toBe(true);
    await expect(secureStorage.loadApiKey()).resolves.toBe('secret-key-123');
    await expect(secureStorage.loadAccessCode()).resolves.toBe('managed-code');
  });
});

describe('native save/load round trip', () => {
  it('uses distinct named Keychain or Keystore slots for both credentials', async () => {
    platform.native = true;

    await secureStorage.saveApiKey('native-key');
    await secureStorage.saveAccessCode('native-code');

    expect(nativeRows.get(API_KEY_ROW)).toBe('native-key');
    expect(nativeRows.get(ACCESS_CODE_ROW)).toBe('native-code');
    expect(ctrl.rows.has(API_KEY_ROW)).toBe(false);
    expect(ctrl.rows.has(ACCESS_CODE_ROW)).toBe(false);
    await expect(secureStorage.loadApiKey()).resolves.toBe('native-key');
    await expect(secureStorage.loadAccessCode()).resolves.toBe('native-code');
  });
});

describe('master key creation', () => {
  it('concurrent first-time savers share one master key via the memoized promise', async () => {
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey');

    await Promise.all([secureStorage.saveApiKey('one'), secureStorage.saveApiKey('two')]);

    expect(generateKey).toHaveBeenCalledTimes(1);
    await expect(secureStorage.loadApiKey()).resolves.toMatch(/^(one|two)$/);
  });

  it('a failed creation is not memoized, so the next attempt succeeds', async () => {
    ctrl.failNextGet = true;
    await expect(secureStorage.saveApiKey('first')).rejects.toThrow('transient idb failure');

    await secureStorage.saveApiKey('second');
    await expect(secureStorage.loadApiKey()).resolves.toBe('second');
  });

  it('leaves no unhandled rejection when the master-key transaction aborts', async () => {
    ctrl.abortNextTransaction = true;

    await expect(secureStorage.saveApiKey('secret-key-123')).rejects.toThrow('transaction aborted');
  });

  it('replaces a payload-shaped master-key row with a generated key', async () => {
    ctrl.rows.set(MASTER_KEY_ROW, {
      iv: new Uint8Array(12),
      data: new ArrayBuffer(16),
    });

    await secureStorage.saveApiKey('secret-key-123');

    expect(ctrl.txPuts).toContain(MASTER_KEY_ROW);
    expect(ctrl.rows.get(MASTER_KEY_ROW)).not.toMatchObject({
      iv: expect.any(Uint8Array),
      data: expect.any(ArrayBuffer),
    });
    await expect(secureStorage.loadApiKey()).resolves.toBe('secret-key-123');
  });

  it('reads the key again after the browser closes the connection it was read through', async () => {
    await secureStorage.saveApiKey('before-close');
    const closeConnection = ctrl.closeConnection;
    // The database went with the connection.
    ctrl.rows.clear();
    closeConnection();
    await Promise.resolve();

    await secureStorage.saveApiKey('after-close');

    expect(ctrl.rows.has(MASTER_KEY_ROW)).toBe(true);
    vi.resetModules();
    const nextLaunch = await import('./secureStorage');
    await expect(nextLaunch.loadApiKey()).resolves.toBe('after-close');
  });

  it('fails a save that was encrypting when the database was deleted and another tab saved', async () => {
    await secureStorage.saveApiKey('initial');
    const closeConnection = ctrl.closeConnection;
    let releaseEncrypt!: () => void;
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        releaseEncrypt = resolve;
      });
      return encrypt(...args);
    });
    const heldSave = secureStorage.saveApiKey('held');
    await vi.waitFor(() => expect(releaseEncrypt).toBeTypeOf('function'));

    // The browser deletes the database and closes the connection the held save
    // read its key through; another tab then saves into the recreated one.
    ctrl.rows.clear();
    closeConnection();
    vi.resetModules();
    const otherTab = await import('./secureStorage');
    await otherTab.saveApiKey('other');

    releaseEncrypt();
    await expect(heldSave).rejects.toThrow('connection is closing');

    await expect(otherTab.loadApiKey()).resolves.toBe('other');
  });

  it('refuses to write a payload into a database that has no master key row', async () => {
    await secureStorage.saveApiKey('before-loss');
    ctrl.rows.delete(MASTER_KEY_ROW);
    ctrl.txPuts.length = 0;

    await expect(secureStorage.saveApiKey('orphaned')).rejects.toThrow('master key is gone');

    expect(ctrl.txPuts).toEqual([]);
  });

  it('a tab that loses the cross-tab race adopts the winner key instead of overwriting it', async () => {
    const winner = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    ctrl.txGetOverride = (key) => {
      if (key !== MASTER_KEY_ROW) return ctrl.rows.get(key);
      ctrl.rows.set(MASTER_KEY_ROW, winner);
      return winner;
    };

    await secureStorage.saveApiKey('raced-value');

    expect(ctrl.txPuts).not.toContain(MASTER_KEY_ROW);
    expect(ctrl.rows.get(MASTER_KEY_ROW)).toBe(winner);

    ctrl.txGetOverride = null;
    vi.resetModules();
    const freshTab = await import('./secureStorage');
    await expect(freshTab.loadApiKey()).resolves.toBe('raced-value');
  });
});

describe('skipping the vault when every row is known absent', () => {
  it('does not skip until both secrets have been read and found missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(secureStorage.loadApiKey()).resolves.toBeNull();

    // One row accounted for is not an empty vault.
    ctrl.rows.clear();
    await expect(secureStorage.loadAccessCode()).resolves.toBeNull();
    warn.mockRestore();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.secureVaultEmpty) ?? '[]')).toHaveLength(2);
  });

  it('stops opening the vault once both rows are known absent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await secureStorage.loadApiKey();
    await secureStorage.loadAccessCode();
    warn.mockRestore();

    // Planted afterwards: the read must be skipped, not merely empty.
    await secureStorage.saveApiKey('secret-key-123');
    localStorage.setItem(
      STORAGE_KEYS.secureVaultEmpty,
      JSON.stringify(['gemini-api-key', 'managed-access-code'])
    );

    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
  });

  // The property the whole flag rests on. loadSecret turns an IndexedDB open,
  // read or decrypt failure into `null`, so anything that decided "empty" from
  // a returned value would mark the vault empty on a transient failure and hide
  // a real credential for good.
  it('records nothing when the read fails rather than returns empty', async () => {
    await secureStorage.saveApiKey('secret-key-123');
    localStorage.removeItem(STORAGE_KEYS.secureVaultEmpty);
    ctrl.failNextGet = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
    warn.mockRestore();

    expect(localStorage.getItem(STORAGE_KEYS.secureVaultEmpty)).toBeNull();
    // And the credential is still reachable on the next attempt.
    await expect(secureStorage.loadApiKey()).resolves.toBe('secret-key-123');
  });

  it('forgets what it knew as soon as a secret is written', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await secureStorage.loadApiKey();
    await secureStorage.loadAccessCode();
    warn.mockRestore();
    await secureStorage.saveApiKey('secret-key-123');

    expect(localStorage.getItem(STORAGE_KEYS.secureVaultEmpty)).toBeNull();
  });

  it('records nothing and leaves no unhandled rejection when the absence re-check aborts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ctrl.abortNextTransaction = true;

    await expect(secureStorage.loadApiKey()).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith('Secure storage load failed', expect.any(Error));
    expect(localStorage.getItem(STORAGE_KEYS.secureVaultEmpty)).toBeNull();
  });

  it('keeps a secret another tab saved during an absent read reachable on the next launch', async () => {
    let finishBootRead!: () => void;
    ctrl.holdNextGet = new Promise<void>((resolve) => {
      finishBootRead = resolve;
    });
    const bootingTabRead = secureStorage.loadApiKey();
    await vi.waitFor(() => expect(ctrl.holdNextGet).toBeNull());

    vi.resetModules();
    const savingTab = await import('./secureStorage');
    await savingTab.saveApiKey('secret-key-123');

    finishBootRead();
    await expect(bootingTabRead).resolves.toBeNull();
    await expect(secureStorage.loadAccessCode()).resolves.toBeNull();

    vi.resetModules();
    const nextLaunch = await import('./secureStorage');
    await expect(nextLaunch.loadApiKey()).resolves.toBe('secret-key-123');
  });
});
