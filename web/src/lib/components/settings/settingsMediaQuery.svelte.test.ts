import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createSettingsMediaQueries } from './settingsMediaQuery.svelte';
import { setResizingActionButtons, settingsModal } from '$lib/state/ui.svelte';

vi.mock('$lib/idle', () => ({
  scheduleIdle: (run: () => void) => {
    run();
    return () => {};
  },
}));

// Static imports on purpose, as in dialogTheme's harness: resetting modules
// hands the state modules a second copy of Svelte's runtime, and an effect made
// under the test's root is then an orphan to the module's own.
function fakeMatchMedia() {
  const listeners: { add: number; remove: number } = { add: 0, remove: 0 };
  const query = () => ({
    matches: false,
    addEventListener: () => {
      listeners.add += 1;
    },
    removeEventListener: () => {
      listeners.remove += 1;
    },
  });
  vi.stubGlobal('matchMedia', vi.fn(query));
  return listeners;
}

async function harness() {
  const listeners = fakeMatchMedia();
  // Braced so nothing is returned: $effect.root treats a returned value as its
  // teardown, and the factory's getters object is not one.
  const stop = $effect.root(() => {
    createSettingsMediaQueries({ wide: '(min-width: 900px)', compact: '(max-height: 500px)' });
  });
  await tick();
  return { listeners, stop };
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

  it('drops both subscriptions when the pane is torn down', async () => {
    const { listeners, stop } = await harness();

    stop();
    await tick();

    expect(listeners.remove).toBe(2);
    vi.unstubAllGlobals();
  });
});
