import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createSettingsMediaQueries } from './settingsMediaQuery.svelte';
import { setResizingActionButtons, settingsModal } from '$lib/state/ui.svelte';

// Deferred rather than immediate, so a test can land a change while the pane is
// in the background and then run the queued update on demand.
const idle = vi.hoisted(() => ({ queued: [] as (() => void)[] }));
vi.mock('$lib/idle', () => ({
  scheduleIdle: (run: () => void) => {
    idle.queued.push(run);
    return () => {
      idle.queued = idle.queued.filter((queued) => queued !== run);
    };
  },
}));

function runQueuedIdle() {
  const pending = idle.queued;
  idle.queued = [];
  for (const run of pending) run();
}

// Static imports on purpose, as in dialogTheme's harness: resetting modules
// hands the state modules a second copy of Svelte's runtime, and an effect made
// under the test's root is then an orphan to the module's own.
function fakeMatchMedia() {
  const listeners: { add: number; remove: number; changed: (() => void)[] } = {
    add: 0,
    remove: 0,
    changed: [],
  };
  const query = () => ({
    matches: false,
    addEventListener: (_type: string, run: () => void) => {
      listeners.add += 1;
      listeners.changed.push(run);
    },
    removeEventListener: () => {
      listeners.remove += 1;
    },
  });
  const matchMedia = vi.fn(query);
  vi.stubGlobal('matchMedia', matchMedia);
  return { listeners, matchMedia };
}

async function harness() {
  idle.queued = [];
  const { listeners, matchMedia } = fakeMatchMedia();
  // Braced so nothing is returned: $effect.root treats a returned value as its
  // teardown, and the factory's getters object is not one.
  const stop = $effect.root(() => {
    createSettingsMediaQueries({ wide: '(min-width: 900px)', compact: '(max-height: 500px)' });
  });
  await tick();
  return { listeners, matchMedia, stop };
}

describe('createSettingsMediaQueries', () => {
  // The subscription outlives the pane's visibility. Reading whether Settings is
  // on screen inside the subscribing effect made it a dependency, so every open,
  // every close and both edges of a Button Size drag rebuilt two MediaQueryList
  // objects and their listeners — on the Settings open path.
  it('subscribes once across opens, closes and button-size drags', async () => {
    const { listeners, stop } = await harness();
    expect(listeners.add).toBe(2);

    try {
      for (const open of [true, false, true, false]) {
        if (open) settingsModal.show(null);
        else settingsModal.hide();
        await tick();
      }
      for (const resizing of [true, false, true, false]) {
        setResizingActionButtons(resizing);
        await tick();
      }

      expect(listeners.add).toBe(2);
      expect(listeners.remove).toBe(0);
    } finally {
      settingsModal.hide();
      setResizingActionButtons(false);
      stop();
      vi.unstubAllGlobals();
    }
  });

  // A handle left behind after its idle callback already ran reads as
  // outstanding work, so the next foreground transition redoes an update that is
  // already applied — rebuilding the MediaQueryList objects this change exists
  // to stop rebuilding.
  it('treats a completed idle update as done when the pane comes forward', async () => {
    const { listeners, matchMedia, stop } = await harness();

    try {
      listeners.changed[0]?.();
      runQueuedIdle();
      const afterIdle = matchMedia.mock.calls.length;

      settingsModal.show(null);
      await tick();

      expect(matchMedia.mock.calls.length).toBe(afterIdle);
    } finally {
      settingsModal.hide();
      stop();
      vi.unstubAllGlobals();
    }
  });

  it('drops both subscriptions when the pane is torn down', async () => {
    const { listeners, stop } = await harness();

    stop();
    await tick();

    expect(listeners.remove).toBe(2);
    vi.unstubAllGlobals();
  });
});
