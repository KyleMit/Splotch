import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);

vi.mock('./platform', () => ({
  isNative: () => false,
  getPlatform: () => 'web',
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
  };
});

const MASTER_KEY_ROW = 'master-key';
const API_KEY_ROW = 'gemini-api-key';

type SecureStorage = typeof import('./secureStorage');
let secureStorage: SecureStorage;

// Re-import per test so the module-level master-key memoization starts fresh,
// like a new tab.
beforeEach(async () => {
  ctrl.reset();
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
    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
  });

  it('clearApiKey removes the payload but keeps the master key for reuse', async () => {
    await secureStorage.saveApiKey('secret-key-123');
    await secureStorage.clearApiKey();

    expect(ctrl.rows.has(API_KEY_ROW)).toBe(false);
    expect(ctrl.rows.has(MASTER_KEY_ROW)).toBe(true);
    await expect(secureStorage.loadApiKey()).resolves.toBeNull();
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
