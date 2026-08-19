import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

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
    txGetOverride: null as ((key: string) => unknown) | null,
    reset() {
      rows.clear();
      state.txPuts.length = 0;
      state.failNextGet = false;
      state.txGetOverride = null;
    },
  };
  return state;
});

vi.mock('./idb', () => {
  const db = {
    async get(_store: string, key: string) {
      if (ctrl.failNextGet) {
        ctrl.failNextGet = false;
        throw new Error('transient idb failure');
      }
      return ctrl.rows.get(key);
    },
    async put(_store: string, value: unknown, key: string) {
      ctrl.rows.set(key, value);
    },
    async delete(_store: string, key: string) {
      ctrl.rows.delete(key);
    },
    transaction(_store: string, _mode: string) {
      return {
        store: {
          async get(key: string) {
            return ctrl.txGetOverride ? ctrl.txGetOverride(key) : ctrl.rows.get(key);
          },
          async put(value: unknown, key: string) {
            ctrl.txPuts.push(key);
            ctrl.rows.set(key, value);
          },
        },
        done: Promise.resolve(),
      };
    },
  };
  return {
    lazyIdbDatabase: () => () => Promise.resolve(db as unknown as import('idb').IDBPDatabase),
    idbKvStore: () => ({
      get: (key: string) => db.get('secrets', key),
      put: (key: string, value: unknown) => db.put('secrets', value, key),
      delete: (key: string) => db.delete('secrets', key),
    }),
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
