import { describe, it, expect, beforeEach, vi } from 'vitest';

// Toggle the native/web split per test. vi.hoisted runs before the vi.mock
// factories, so the factories can close over this mutable state.
const ctrl = vi.hoisted(() => ({ native: false }));

vi.mock('$lib/platform', () => ({
  isNative: () => ctrl.native,
  getPlatform: () => (ctrl.native ? 'android' : 'web'),
}));

// In-memory stand-in for the durable Capacitor Preferences store.
const prefsStore = vi.hoisted(() => new Map<string, string>());
const prefsSetFailure = vi.hoisted(() => ({ key: null as string | null }));
const prefsRemoveFailure = vi.hoisted(() => ({ key: null as string | null, attempts: 0 }));
// Holds one key's removal until the test releases it, so a restore can be
// caught mid-retry.
const prefsRemoveHold = vi.hoisted(() => ({
  key: null as string | null,
  release: null as (() => void) | null,
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({
      value: prefsStore.has(key) ? prefsStore.get(key) : null,
    }),
    set: async ({ key, value }: { key: string; value: string }) => {
      if (prefsSetFailure.key === key) throw new Error('Preferences set failed');
      prefsStore.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      if (prefsRemoveFailure.key === key) {
        prefsRemoveFailure.attempts += 1;
        throw new Error('Preferences remove failed');
      }
      if (prefsRemoveHold.key === key) {
        await new Promise<void>((resolve) => {
          prefsRemoveHold.release = resolve;
        });
      }
      prefsStore.delete(key);
    },
  },
}));

import {
  STORAGE_KEYS,
  readBool,
  writeBool,
  readString,
  writeString,
  readInt,
  writeInt,
  removeKey,
  hydrateDurableStorage,
  writeCaptureReportToPreferences,
  removeCaptureReportFromPreferences,
} from './storage';

beforeEach(() => {
  localStorage.clear();
  prefsStore.clear();
  prefsSetFailure.key = null;
  prefsRemoveFailure.key = null;
  prefsRemoveFailure.attempts = 0;
  prefsRemoveHold.key = null;
  prefsRemoveHold.release = null;
  ctrl.native = false;
});

describe('readBool / writeBool', () => {
  it('round-trips true and false', () => {
    writeBool(STORAGE_KEYS.soundEnabled, true);
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBe('true');
    expect(readBool(STORAGE_KEYS.soundEnabled, false)).toBe(true);

    writeBool(STORAGE_KEYS.soundEnabled, false);
    expect(readBool(STORAGE_KEYS.soundEnabled, true)).toBe(false);
  });

  it('returns the fallback when the key is absent', () => {
    expect(readBool(STORAGE_KEYS.saveOnDelete, true)).toBe(true);
    expect(readBool(STORAGE_KEYS.saveOnDelete, false)).toBe(false);
  });

  it('returns the fallback when the stored value is corrupt', () => {
    localStorage.setItem(STORAGE_KEYS.saveOnDelete, 'garbage');
    expect(readBool(STORAGE_KEYS.saveOnDelete, true)).toBe(true);
    expect(readBool(STORAGE_KEYS.saveOnDelete, false)).toBe(false);
  });
});

describe('readString / writeString', () => {
  it('round-trips a string and falls back when absent', () => {
    writeString(STORAGE_KEYS.legacyAiAccessToken, 'hello');
    expect(readString(STORAGE_KEYS.legacyAiAccessToken, 'fallback')).toBe('hello');
    expect(readString(STORAGE_KEYS.brushType, 'fallback')).toBe('fallback');
  });
});

describe('readInt', () => {
  it('round-trips an integer', () => {
    writeInt(STORAGE_KEYS.soundVolume, 7);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('7');
    expect(readInt(STORAGE_KEYS.soundVolume, 0)).toBe(7);
  });

  it('falls back when the stored value is not a number', () => {
    localStorage.setItem(STORAGE_KEYS.soundVolume, 'not-a-number');
    expect(readInt(STORAGE_KEYS.soundVolume, 3)).toBe(3);
  });

  it('falls back when an allowed-list is given and the value is excluded', () => {
    localStorage.setItem(STORAGE_KEYS.soundVolume, '99');
    expect(readInt(STORAGE_KEYS.soundVolume, 3, [1, 2, 3, 4, 5])).toBe(3);
  });

  it('returns the value when it is in the allowed-list', () => {
    localStorage.setItem(STORAGE_KEYS.soundVolume, '4');
    expect(readInt(STORAGE_KEYS.soundVolume, 3, [1, 2, 3, 4, 5])).toBe(4);
  });
});

describe('removeKey', () => {
  it('removes the key from localStorage', () => {
    writeString(STORAGE_KEYS.legacyAiAccessToken, 'x');
    removeKey(STORAGE_KEYS.legacyAiAccessToken);
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBeNull();
  });

  it('removes the key from Preferences on native', async () => {
    ctrl.native = true;
    localStorage.setItem(STORAGE_KEYS.legacyAiAccessToken, 'x');
    prefsStore.set(STORAGE_KEYS.legacyAiAccessToken, 'x');

    removeKey(STORAGE_KEYS.legacyAiAccessToken);

    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBeNull();
    await vi.waitFor(() => expect(prefsStore.has(STORAGE_KEYS.legacyAiAccessToken)).toBe(false));
  });

  it('keeps a removed key removed after a failed Preferences removal and the next durable restore', async () => {
    ctrl.native = true;
    localStorage.setItem(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiUserApiKey;

    removeKey(STORAGE_KEYS.legacyAiUserApiKey);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(1));
    await hydrateDurableStorage();

    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
  });

  it('finishes a pending removal on the next durable restore once Preferences cooperates', async () => {
    ctrl.native = true;
    localStorage.setItem(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiUserApiKey;
    removeKey(STORAGE_KEYS.legacyAiUserApiKey);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(1));

    prefsRemoveFailure.key = null;
    await hydrateDurableStorage();

    expect(prefsStore.has(STORAGE_KEYS.legacyAiUserApiKey)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pendingDurableRemovals) ?? '[]')).toEqual(
      []
    );
  });

  it('honours a pending removal that only the durable copy still names after an eviction', async () => {
    ctrl.native = true;
    localStorage.setItem(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiUserApiKey;
    removeKey(STORAGE_KEYS.legacyAiUserApiKey);
    await vi.waitFor(() =>
      expect(prefsStore.get(STORAGE_KEYS.pendingDurableRemovals)).toContain(
        STORAGE_KEYS.legacyAiUserApiKey
      )
    );

    localStorage.clear();
    await hydrateDurableStorage();

    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
  });

  it('settling one pending removal keeps another that only the durable list names', async () => {
    ctrl.native = true;
    for (const key of [STORAGE_KEYS.legacyAiAccessToken, STORAGE_KEYS.legacyAiUserApiKey]) {
      localStorage.setItem(key, 'plaintext');
      prefsStore.set(key, 'plaintext');
    }
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiAccessToken;
    removeKey(STORAGE_KEYS.legacyAiAccessToken);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(1));
    // The API-key tombstone reaches the durable list but not localStorage.
    const setItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce((key, value) => {
      if (key !== STORAGE_KEYS.pendingDurableRemovals) setItem(key, value);
    });
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiUserApiKey;
    removeKey(STORAGE_KEYS.legacyAiUserApiKey);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(2));
    vi.restoreAllMocks();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pendingDurableRemovals) ?? '[]')).toEqual([
      STORAGE_KEYS.legacyAiAccessToken,
    ]);

    // The token removal now lands; the API-key removal keeps failing.
    await hydrateDurableStorage();
    await hydrateDurableStorage();

    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
    expect(prefsStore.has(STORAGE_KEYS.legacyAiAccessToken)).toBe(false);
  });

  it('keeps a removal requested while the restore awaited another one', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiAccessToken, 'plaintext');
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiAccessToken;
    removeKey(STORAGE_KEYS.legacyAiAccessToken);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(1));
    prefsRemoveFailure.key = null;

    prefsRemoveHold.key = STORAGE_KEYS.legacyAiAccessToken;
    const restore = hydrateDurableStorage();
    await vi.waitFor(() => expect(prefsRemoveHold.release).toBeTypeOf('function'));
    localStorage.setItem(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiUserApiKey;
    removeKey(STORAGE_KEYS.legacyAiUserApiKey);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(2));
    prefsRemoveHold.release?.();
    await restore;

    await hydrateDurableStorage();

    expect(prefsStore.has(STORAGE_KEYS.legacyAiAccessToken)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBeNull();
  });

  it('a later write survives the durable restore even when its clear of the list failed', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiUserApiKey;
    removeKey(STORAGE_KEYS.legacyAiUserApiKey);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(1));
    prefsRemoveFailure.key = null;

    prefsSetFailure.key = STORAGE_KEYS.pendingDurableRemovals;
    writeString(STORAGE_KEYS.legacyAiUserApiKey, 'new');
    await vi.waitFor(() => expect(prefsStore.get(STORAGE_KEYS.legacyAiUserApiKey)).toBe('new'));
    expect(prefsStore.get(STORAGE_KEYS.pendingDurableRemovals)).toContain(
      STORAGE_KEYS.legacyAiUserApiKey
    );
    prefsSetFailure.key = null;

    await hydrateDurableStorage();

    expect(prefsStore.get(STORAGE_KEYS.legacyAiUserApiKey)).toBe('new');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBe('new');
    await vi.waitFor(() =>
      expect(JSON.parse(prefsStore.get(STORAGE_KEYS.pendingDurableRemovals) ?? '[]')).toEqual([])
    );
  });

  it('a later write to the key supersedes its pending removal', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'plaintext-key');
    prefsRemoveFailure.key = STORAGE_KEYS.legacyAiUserApiKey;
    removeKey(STORAGE_KEYS.legacyAiUserApiKey);
    await vi.waitFor(() => expect(prefsRemoveFailure.attempts).toBe(1));

    writeString(STORAGE_KEYS.legacyAiUserApiKey, 'rewritten');
    await vi.waitFor(() =>
      expect(prefsStore.get(STORAGE_KEYS.legacyAiUserApiKey)).toBe('rewritten')
    );
    await hydrateDurableStorage();

    expect(prefsRemoveFailure.attempts).toBe(1);
    expect(prefsStore.get(STORAGE_KEYS.legacyAiUserApiKey)).toBe('rewritten');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBe('rewritten');
  });
});

describe('resilience to a throwing localStorage', () => {
  // The read and write latches are module state by design — one warning per
  // page, not per call — and the module has no way to unlatch them, so the
  // only module that can be observed warning for the first time is one that
  // has never warned. Every other test in this file shares the statically
  // imported instance, which any earlier failure has already latched.
  it('warns once for each failure class', async () => {
    vi.resetModules();
    const unwarned = await import('./storage');
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      unwarned.writeBool(STORAGE_KEYS.soundEnabled, true);
      unwarned.writeBool(STORAGE_KEYS.soundEnabled, false);
      expect(unwarned.readBool(STORAGE_KEYS.soundEnabled, true)).toBe(true);
      expect(unwarned.readBool(STORAGE_KEYS.soundEnabled, false)).toBe(false);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
      warn.mockRestore();
    }
  });

  it('does not let a setItem throw escape into the caller', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => writeBool(STORAGE_KEYS.soundEnabled, true)).not.toThrow();
      expect(() => writeString(STORAGE_KEYS.legacyAiAccessToken, 'v')).not.toThrow();
      expect(() => writeInt(STORAGE_KEYS.soundVolume, 1)).not.toThrow();
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });

  it('returns the fallback when getItem throws instead of letting the throw escape', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(readBool(STORAGE_KEYS.soundEnabled, true)).toBe(true);
      expect(readBool(STORAGE_KEYS.soundEnabled, false)).toBe(false);
      expect(readString(STORAGE_KEYS.legacyAiAccessToken, 'fallback')).toBe('fallback');
      expect(readString(STORAGE_KEYS.legacyAiAccessToken, null)).toBeNull();
      expect(readInt(STORAGE_KEYS.soundVolume, 7)).toBe(7);
      expect(readInt(STORAGE_KEYS.soundVolume, 3, [1, 2, 3])).toBe(3);
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });

  it('does not let a removeItem throw escape into the caller', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => removeKey(STORAGE_KEYS.soundEnabled)).not.toThrow();
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });
});

describe('mirror to durable storage (native)', () => {
  it('does not touch Preferences on the web', async () => {
    ctrl.native = false;
    writeString(STORAGE_KEYS.theme, 'v');
    // Let any (mistaken) async mirror settle, then assert nothing was mirrored.
    await Promise.resolve();
    expect(prefsStore.has(STORAGE_KEYS.theme)).toBe(false);
  });

  it('mirrors writes to Preferences on native', async () => {
    ctrl.native = true;
    writeString(STORAGE_KEYS.brushType, 'v');
    // mirror() is fire-and-forget: flush the microtask queue (dynamic import +
    // the Preferences.set promise) before asserting.
    await vi.waitFor(() => expect(prefsStore.get(STORAGE_KEYS.brushType)).toBe('v'));
  });
});

describe('bundled capture Preferences mailbox', () => {
  const nonce = '7f16d248-63df-4ba2-81d4-fb27ef0a40e2';

  it('awaits the full Preferences round trip without copying into localStorage', async () => {
    ctrl.native = true;
    const report = JSON.stringify({ rows: 'x'.repeat(650_000) });

    await expect(writeCaptureReportToPreferences(nonce, report)).resolves.toBe(true);
    expect(localStorage.getItem(nonce)).toBeNull();
    expect(prefsStore.get(nonce)).toBe(report);

    await expect(removeCaptureReportFromPreferences(nonce)).resolves.toBe(true);
    expect(localStorage.getItem(nonce)).toBeNull();
    expect(prefsStore.has(nonce)).toBe(false);
  });

  it('reports that no Preferences channel exists on web', async () => {
    await expect(writeCaptureReportToPreferences(nonce, '{}')).resolves.toBe(false);
    await expect(removeCaptureReportFromPreferences(nonce)).resolves.toBe(false);
  });
});
