import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration guard for issue #521: hydrateDurableStorage() must refresh the
// REAL persisted stores after a native WebView eviction, not just synthetic
// vi.fn() callbacks. That only works if each store self-registers via
// onDurableRestore() at module init AND sits in the static import graph before
// hydrate runs. storage.test.ts proves hydrate *invokes* registered callbacks;
// this file proves the actual store modules *are* registered — so a store that
// forgets onDurableRestore(...), or a refactor that drops one from the boot
// import graph, turns this test red instead of silently reintroducing the bug
// (native values failing to restore after eviction).
//
// A separate file from storage.test.ts on purpose: that suite exercises the raw
// read*/write* helpers in isolation and never imports the state stores. Here we
// import the real store modules (mirroring how +page.svelte -> earlyBoot pulls
// them into the graph) and mock ONLY the platform/native + Preferences
// boundary — the stores themselves are the thing under test, so they stay real.

// Toggle the native/web split per test. vi.hoisted runs before the vi.mock
// factories so they can close over this mutable state (mirrors storage.test.ts).
const ctrl = vi.hoisted(() => ({ native: false }));

// Spread the real module so only the two platform *behaviours* are faked; the
// constants it also exports stay real rather than being restated here.
vi.mock('$lib/platform', async (importActual) => ({
  ...(await importActual<typeof import('$lib/platform')>()),
  isNative: () => ctrl.native,
  getPlatform: () => (ctrl.native ? 'android' : 'web'),
}));

// In-memory stand-in for the durable Capacitor Preferences store.
const prefsStore = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({
      value: prefsStore.has(key) ? prefsStore.get(key) : null,
    }),
    set: async ({ key, value }: { key: string; value: string }) => void prefsStore.set(key, value),
    remove: async ({ key }: { key: string }) => void prefsStore.delete(key),
  },
}));

import { STORAGE_KEYS, hydrateDurableStorage } from './storage';
// Importing the real store modules runs their module-init code: each calls
// onDurableRestore() to register its reloader — exactly what earlyBoot.ts does
// at boot.
import { strokeState } from './state/strokeWidth.svelte';
import { toolState } from './state/tool.svelte';
import { settings } from './state/settings.svelte';
import { sessionCount, SETTINGS_ACTIVITY_DOTS_START_SESSION } from './state/sessionCounters.svelte';

function settingsActivityDotsEnabled() {
  return sessionCount('settingsActivity') >= SETTINGS_ACTIVITY_DOTS_START_SESSION;
}

beforeEach(() => {
  localStorage.clear();
  prefsStore.clear();
  ctrl.native = false;
});

describe('hydrateDurableStorage restores real persisted stores (issue #521)', () => {
  it('refreshes live $state from the durable mirror after a native eviction', async () => {
    // Sanity: the stores initialised to their defaults (localStorage was empty
    // at import), so a post-hydrate change to the restored value is meaningful.
    expect(strokeState.penSize).toBe(3);
    expect(toolState.brush).toBe('pen');
    expect(settings.soundVolume).toBe(50);
    expect(settingsActivityDotsEnabled()).toBe(false);

    ctrl.native = true;

    // Simulate a WebView eviction: the durable Preferences layer still holds the
    // parent's saved values, but localStorage lost them (cleared in beforeEach).
    prefsStore.set(STORAGE_KEYS.strokeWidthSize, '5');
    prefsStore.set(STORAGE_KEYS.brushType, 'crayon');
    prefsStore.set(STORAGE_KEYS.soundVolume, '80');
    prefsStore.set(STORAGE_KEYS.settingsActivitySessionCount, '6');

    const restored = await hydrateDurableStorage();
    expect(restored).toBe(true);

    // localStorage was repopulated from the durable mirror...
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('5');

    // ...and, crucially, every real store's reloader fired via the registry, so
    // the live $state reflects the recovered values rather than the defaults.
    // If any store dropped its onDurableRestore(...) registration or fell out of
    // the boot import graph, its assertion below fails.
    expect(strokeState.penSize).toBe(5);
    expect(toolState.brush).toBe('crayon');
    expect(settings.soundVolume).toBe(80);
    expect(settingsActivityDotsEnabled()).toBe(true);
  });
});
