import { describe, it, expect, beforeEach, vi } from 'vitest';

// Toggle the native/web split per test. vi.hoisted runs before the vi.mock
// factories, so the factories can close over this mutable state.
const ctrl = vi.hoisted(() => ({ native: false }));

vi.mock('./platform.js', () => ({
  isNative: () => ctrl.native,
  getPlatform: () => (ctrl.native ? 'android' : 'web')
}));

// In-memory stand-in for the durable Capacitor Preferences store.
const prefsStore = vi.hoisted(() => new Map());
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }) => ({ value: prefsStore.has(key) ? prefsStore.get(key) : null }),
    set: async ({ key, value }) => void prefsStore.set(key, value),
    remove: async ({ key }) => void prefsStore.delete(key)
  }
}));

import {
  readBool,
  writeBool,
  readString,
  writeString,
  readInt,
  writeInt,
  removeKey,
  hydrateDurableStorage
} from './storage.js';

beforeEach(() => {
  localStorage.clear();
  prefsStore.clear();
  ctrl.native = false;
});

describe('readBool / writeBool', () => {
  it('round-trips true and false', () => {
    writeBool('k', true);
    expect(localStorage.getItem('k')).toBe('true');
    expect(readBool('k', false)).toBe(true);

    writeBool('k', false);
    expect(readBool('k', true)).toBe(false);
  });

  it('returns the fallback when the key is absent', () => {
    expect(readBool('missing', true)).toBe(true);
    expect(readBool('missing', false)).toBe(false);
  });
});

describe('readString / writeString', () => {
  it('round-trips a string and falls back when absent', () => {
    writeString('s', 'hello');
    expect(readString('s', 'fallback')).toBe('hello');
    expect(readString('absent', 'fallback')).toBe('fallback');
  });
});

describe('readInt', () => {
  it('round-trips an integer', () => {
    writeInt('n', 7);
    expect(localStorage.getItem('n')).toBe('7');
    expect(readInt('n', 0)).toBe(7);
  });

  it('falls back when the stored value is not a number', () => {
    localStorage.setItem('n', 'not-a-number');
    expect(readInt('n', 3)).toBe(3);
  });

  it('falls back when an allowed-list is given and the value is excluded', () => {
    localStorage.setItem('n', '99');
    expect(readInt('n', 3, [1, 2, 3, 4, 5])).toBe(3);
  });

  it('returns the value when it is in the allowed-list', () => {
    localStorage.setItem('n', '4');
    expect(readInt('n', 3, [1, 2, 3, 4, 5])).toBe(4);
  });
});

describe('removeKey', () => {
  it('removes the key from localStorage', () => {
    writeString('s', 'x');
    removeKey('s');
    expect(localStorage.getItem('s')).toBeNull();
  });
});

describe('mirror to durable storage (native)', () => {
  it('does not touch Preferences on the web', async () => {
    ctrl.native = false;
    writeString('web-key', 'v');
    // Let any (mistaken) async mirror settle, then assert nothing was mirrored.
    await Promise.resolve();
    expect(prefsStore.has('web-key')).toBe(false);
  });

  it('mirrors writes to Preferences on native', async () => {
    ctrl.native = true;
    writeString('nk', 'v');
    // mirror() is fire-and-forget: flush the microtask queue (dynamic import +
    // the Preferences.set promise) before asserting.
    await vi.waitFor(() => expect(prefsStore.get('nk')).toBe('v'));
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
    // Register the key as managed (read*/write* track it) without writing to
    // localStorage, then seed only the durable store — simulating eviction.
    readString('evicted', null);
    prefsStore.set('evicted', 'recovered');

    const restored = await hydrateDurableStorage();
    expect(restored).toBe(true);
    expect(localStorage.getItem('evicted')).toBe('recovered');
  });

  it('back-fills Preferences from a localStorage-only value without reporting a restore', async () => {
    ctrl.native = true;
    writeString('local-only', 'keep'); // tracked; mirror also fires but store is cleared below
    prefsStore.clear();

    const restored = await hydrateDurableStorage();
    expect(restored).toBe(false); // nothing was restored *into* localStorage
    expect(prefsStore.get('local-only')).toBe('keep'); // but durable store was seeded
  });
});
