import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  removeDownloadedColoringPacks: vi.fn<() => Promise<void>>(),
}));

vi.mock('$lib/coloringPacks/manager', () => ({
  removeDownloadedColoringPacks: mocks.removeDownloadedColoringPacks,
}));

import ColoringSection from './ColoringSection.svelte';
import { settingsModal } from '$lib/state/ui.svelte';

let mounted: ReturnType<typeof mount> | null = null;

function setOpen(open: boolean) {
  if (open) settingsModal.show(null);
  else settingsModal.hide();
  flushSync();
}

function mountOpen() {
  const target = document.createElement('div');
  document.body.append(target);
  setOpen(true);
  mounted = mount(ColoringSection, { target });
  flushSync();
  return target;
}

afterEach(async () => {
  setOpen(false);
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  mocks.removeDownloadedColoringPacks.mockReset();
});

// The wide Settings shell keeps its sections mounted across a close, so a
// failure from one visit has to be cleared by the section itself.
describe('ColoringSection remove failure', () => {
  it('clears the failure message when Settings is closed and opened again', async () => {
    mocks.removeDownloadedColoringPacks.mockRejectedValueOnce(new Error('store unavailable'));
    const section = mountOpen();
    const removeButton = [...section.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Remove downloaded pictures'
    );

    removeButton?.click();
    await vi.waitFor(() => expect(section.querySelector('.remove-error')).not.toBeNull());

    setOpen(false);
    setOpen(true);
    expect(section.querySelector('.remove-error')).toBeNull();
  });
});
