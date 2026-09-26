import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createSettingsMediaQueries } from './settingsMediaQuery.svelte';
import { setResizingActionButtons, settingsModal } from '$lib/state/ui.svelte';

// Static imports on purpose, as in dialogTheme's harness: resetting modules
// hands the state modules a second copy of Svelte's runtime, and an effect made
// under the test's root is then an orphan to the module's own.
function fakeMatchMedia() {
  const listeners: { add: number; remove: number; changed: (() => void)[] } = {
    add: 0,
    remove: 0,
    changed: [],
  };
  const viewport = { matches: false };
  const query = () => ({
    get matches() {
      return viewport.matches;
    },
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
  return { listeners, matchMedia, viewport };
}

async function harness() {
  const { listeners, matchMedia, viewport } = fakeMatchMedia();
  let shell: ReturnType<typeof createSettingsMediaQueries> | undefined;
  // Braced so nothing is returned: $effect.root treats a returned value as its
  // teardown, and the factory's getters object is not one.
  const stop = $effect.root(() => {
    shell = createSettingsMediaQueries({
      wide: '(min-width: 900px)',
      compact: '(max-height: 500px)',
    });
  });
  await tick();
  if (!shell) throw new Error('createSettingsMediaQueries did not run');
  const rotate = (matches: boolean) => {
    viewport.matches = matches;
    for (const changed of listeners.changed) changed();
  };
  return { listeners, matchMedia, rotate, shell, stop };
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

  // A closed pane's shell is invisible, and a rotation is when a change
  // arrives: swapping it then put a section view's mount inside the rotation's
  // scored frames on the Android phone.
  it('leaves a closed pane on its shell until it opens, then swaps in the open flush', async () => {
    const { rotate, shell, stop } = await harness();

    try {
      rotate(true);
      await tick();
      expect(shell.compact).toBe(false);
      expect(shell.wide).toBe(false);

      settingsModal.show(null);
      await tick();
      expect(shell.compact).toBe(true);
      expect(shell.wide).toBe(true);
    } finally {
      settingsModal.hide();
      stop();
      vi.unstubAllGlobals();
    }
  });

  it('swaps an open pane as soon as the viewport changes', async () => {
    const { rotate, shell, stop } = await harness();

    try {
      settingsModal.show(null);
      await tick();
      rotate(true);
      expect(shell.compact).toBe(true);
      expect(shell.wide).toBe(true);
    } finally {
      settingsModal.hide();
      stop();
      vi.unstubAllGlobals();
    }
  });

  // A change already applied in the foreground leaves nothing to redo on the
  // next open, which would re-evaluate both queries on the open path.
  it('reads the queries again on open only when a change landed while closed', async () => {
    const { matchMedia, rotate, stop } = await harness();

    try {
      settingsModal.show(null);
      await tick();
      rotate(true);
      settingsModal.hide();
      await tick();
      const afterForegroundChange = matchMedia.mock.calls.length;

      settingsModal.show(null);
      await tick();
      expect(matchMedia.mock.calls.length).toBe(afterForegroundChange);
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
