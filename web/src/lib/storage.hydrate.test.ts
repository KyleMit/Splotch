import { describe, it, expect, beforeEach, vi } from 'vitest';

// The durable-restore contract: boot-time reconcile policy, hydrate's restore
// and back-fill behaviour, and the restore-notification fan-out. Restores that
// race a pending removal stay with removeKey in storage.test.ts, which owns the
// remove-failure and remove-hold Preferences harness they need.

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
    remove: async ({ key }: { key: string }) => {
      prefsStore.delete(key);
    },
  },
}));

import {
  STORAGE_KEYS,
  reconcileStorageValues,
  hydrateDurableStorage,
  onDurableRestore,
} from './storage';

beforeEach(() => {
  localStorage.clear();
  prefsStore.clear();
  prefsSetFailure.key = null;
  ctrl.native = false;
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
