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
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({
      value: prefsStore.has(key) ? prefsStore.get(key) : null,
    }),
    set: async ({ key, value }: { key: string; value: string }) => {
      if (prefsSetFailure.key === key) throw new Error('Preferences set failed');
      prefsStore.set(key, value);
    },
    remove: async ({ key }: { key: string }) => void prefsStore.delete(key),
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
  reconcileStorageValues,
  hydrateDurableStorage,
  onDurableRestore,
  writeDurableCaptureReport,
  removeDurableCaptureReport,
} from './storage';

beforeEach(() => {
  localStorage.clear();
  prefsStore.clear();
  prefsSetFailure.key = null;
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
});

describe('resilience to a throwing localStorage', () => {
  it('warns once for each failure class', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      writeBool(STORAGE_KEYS.soundEnabled, true);
      writeBool(STORAGE_KEYS.soundEnabled, false);
      expect(readBool(STORAGE_KEYS.soundEnabled, true)).toBe(true);
      expect(readBool(STORAGE_KEYS.soundEnabled, false)).toBe(false);
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

describe('bundled capture report mirror', () => {
  const nonce = '7f16d248-63df-4ba2-81d4-fb27ef0a40e2';

  it('awaits the full localStorage to Preferences round trip', async () => {
    ctrl.native = true;
    const report = JSON.stringify({ rows: 'x'.repeat(650_000) });

    await expect(writeDurableCaptureReport(nonce, report)).resolves.toBe(true);
    expect(localStorage.getItem(nonce)).toBe(report);
    expect(prefsStore.get(nonce)).toBe(report);

    await expect(removeDurableCaptureReport(nonce)).resolves.toBe(true);
    expect(localStorage.getItem(nonce)).toBeNull();
    expect(prefsStore.has(nonce)).toBe(false);
  });

  it('reports that no Preferences channel exists on web', async () => {
    await expect(writeDurableCaptureReport(nonce, '{}')).resolves.toBe(false);
    await expect(removeDurableCaptureReport(nonce)).resolves.toBe(false);
  });
});

describe('reconcileStorageValues', () => {
  it('takes no action when both values are present', () => {
    expect(reconcileStorageValues('local', 'durable')).toEqual({});
  });

  it('backs up a local-only value', () => {
    expect(reconcileStorageValues('local', null)).toEqual({ backup: 'local' });
  });

  it('restores a durable-only value', () => {
    expect(reconcileStorageValues(null, 'durable')).toEqual({ restore: 'durable' });
  });

  it('takes no action when neither value is present', () => {
    expect(reconcileStorageValues(null, null)).toEqual({});
  });
});

describe('hydrateDurableStorage', () => {
  it('is a no-op on the web and returns false', async () => {
    ctrl.native = false;
    const restored = await hydrateDurableStorage();
    expect(restored).toBe(false);
  });

  it('restores a key the WebView evicted from localStorage', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.strokeWidthSize, 'recovered');

    const restored = await hydrateDurableStorage();
    expect(restored).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('recovered');
  });

  it('back-fills Preferences from a localStorage-only value without reporting a restore', async () => {
    ctrl.native = true;
    localStorage.setItem(STORAGE_KEYS.drawerOpen, 'keep');

    const restored = await hydrateDurableStorage();
    expect(restored).toBe(false); // nothing was restored *into* localStorage
    expect(prefsStore.get(STORAGE_KEYS.drawerOpen)).toBe('keep'); // but durable store was seeded
  });

  it('restores the legacy API key for secure-storage migration', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.legacyAiUserApiKey, 'stale-plaintext-key');

    const restored = await hydrateDurableStorage();
    expect(restored).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiUserApiKey)).toBe('stale-plaintext-key');
  });

  it('reconciles the remaining keys when a restoring setItem throws', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.theme, 'lost-theme');
    prefsStore.set(STORAGE_KEYS.strokeWidthSize, 'recovered');
    const realSetItem = localStorage.setItem.bind(localStorage);
    const setItem = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === STORAGE_KEYS.theme) throw new DOMException('quota', 'QuotaExceededError');
        realSetItem(key, value);
      });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let restored: boolean;
    try {
      restored = await hydrateDurableStorage();
    } finally {
      setItem.mockRestore();
      warn.mockRestore();
    }

    expect(restored).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('recovered');
  });

  it('reports no restore, and notifies nobody, when every restoring setItem throws', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.theme, 'lost-theme');
    prefsStore.set(STORAGE_KEYS.strokeWidthSize, 'lost-width');
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notified = vi.fn();
    const off = onDurableRestore(notified);
    let restored: boolean;
    try {
      restored = await hydrateDurableStorage();
    } finally {
      off();
      setItem.mockRestore();
      warn.mockRestore();
    }

    // localStorage changed zero times, so claiming a restore would make every
    // registered store re-read values that were never written.
    expect(restored).toBe(false);
    expect(notified).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBeNull();
  });

  it('reconciles the remaining keys when a reading getItem throws', async () => {
    ctrl.native = true;
    localStorage.setItem(STORAGE_KEYS.drawerOpen, 'keep');
    prefsStore.set(STORAGE_KEYS.strokeWidthSize, 'recovered');
    const realGetItem = localStorage.getItem.bind(localStorage);
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
      if (key === STORAGE_KEYS.drawerOpen) throw new DOMException('denied', 'SecurityError');
      return realGetItem(key);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let restored: boolean;
    try {
      restored = await hydrateDurableStorage();
    } finally {
      getItem.mockRestore();
      warn.mockRestore();
    }

    expect(restored).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('recovered');
    expect(prefsStore.has(STORAGE_KEYS.drawerOpen)).toBe(false); // read as absent, so nothing to back up
  });

  it('reports a completed restore when a concurrent back-fill fails', async () => {
    ctrl.native = true;
    prefsStore.set(STORAGE_KEYS.strokeWidthSize, 'recovered');
    localStorage.setItem(STORAGE_KEYS.drawerOpen, 'keep');
    prefsSetFailure.key = STORAGE_KEYS.drawerOpen;
    const cb = vi.fn();
    const off = onDurableRestore(cb);
    try {
      const restored = await hydrateDurableStorage();

      expect(restored).toBe(true);
      expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('recovered');
      expect(prefsStore.has(STORAGE_KEYS.drawerOpen)).toBe(false);
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });
});

describe('onDurableRestore', () => {
  it('invokes onDurableRestore callbacks only when a value was restored (native)', async () => {
    ctrl.native = true;
    const cb = vi.fn();
    const off = onDurableRestore(cb);
    try {
      prefsStore.set(STORAGE_KEYS.eraserWidthSize, 'recovered'); // durable-only value the WebView lost

      const restored = await hydrateDurableStorage();
      expect(restored).toBe(true);
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('does not invoke callbacks when nothing was restored', async () => {
    ctrl.native = true;
    const cb = vi.fn();
    const off = onDurableRestore(cb);
    try {
      const restored = await hydrateDurableStorage();
      expect(restored).toBe(false);
      expect(cb).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });
});
