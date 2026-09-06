import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tick } from 'svelte';
import { setTheme } from './settings.svelte';
import { createModal } from './modal.svelte';
import { createDialogTheme } from './dialogTheme.svelte';

vi.mock('../secureStorage', () => ({
  saveApiKey: vi.fn(async () => {}),
  loadApiKey: vi.fn(async () => null),
  clearApiKey: vi.fn(async () => {}),
}));

// Static imports on purpose: a vi.resetModules() harness hands the state
// modules a second copy of Svelte's runtime, and an effect created under the
// test's root is then an orphan to the module's $effect.pre. Effects settle
// on a microtask, which `tick()` awaits (the aiProgress test's pattern).
async function harness() {
  setTheme('light');
  const modal = createModal();
  let dialogTheme!: ReturnType<typeof createDialogTheme>;
  const stop = $effect.root(() => {
    dialogTheme = createDialogTheme(modal);
  });
  await tick();
  return { modal, dialogTheme, stop };
}

describe('createDialogTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps a closed dialog on the theme it last showed while the app flips', async () => {
    const { dialogTheme, stop } = await harness();
    expect(dialogTheme.current).toBe('light');
    setTheme('dark');
    await tick();
    expect(dialogTheme.current).toBe('light');
    stop();
  });

  it('catches up to the current theme when the dialog opens', async () => {
    const { modal, dialogTheme, stop } = await harness();
    setTheme('dark');
    await tick();
    modal.show(null);
    await tick();
    expect(dialogTheme.current).toBe('dark');
    stop();
  });

  it('follows a flip while open, then freezes again on close', async () => {
    const { modal, dialogTheme, stop } = await harness();
    modal.show(null);
    await tick();
    setTheme('dark');
    await tick();
    expect(dialogTheme.current).toBe('dark');
    modal.hide();
    await tick();
    setTheme('light');
    await tick();
    expect(dialogTheme.current).toBe('dark');
    stop();
  });
});
