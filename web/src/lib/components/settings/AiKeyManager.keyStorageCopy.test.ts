import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '$lib/platform';

const platform = vi.hoisted((): { current: Platform } => ({ current: 'ios' }));

vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  getPlatform: () => platform.current,
}));
// The switch swaps two revealed blocks; happy-dom rejects each unfinished Web
// Animation it cancels, so the reveal runs with no duration here.
vi.mock('./sectionReveal', () => ({ sectionReveal: () => ({}) }));

import AiKeyManager from './AiKeyManager.svelte';
import { setAiImage } from '$lib/state/settings.svelte';
import { settingsModal } from '$lib/state/ui.svelte';

let mounted: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  setAiImage(false);
});

function renderedCopy(on: Platform) {
  platform.current = on;
  setAiImage(true);
  settingsModal.show(null);
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(AiKeyManager, { target });
  flushSync();
  const collapse = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  return {
    note: collapse(target.querySelector('.byok-storage-note')?.textContent),
    form: collapse(target.querySelector('.byok-storage-note')?.closest('div')?.textContent),
  };
}

// A saved key stays on this device on every platform (docs/MOBILE/compliance.md,
// Apple 5.1.1); the words are pinned as a parent reads them.
describe('AiKeyManager key-storage copy', () => {
  it('tells an iPhone parent the key is kept only on this device', () => {
    expect(renderedCopy('ios').note).toBe(
      "Your key is saved in this device's iOS Keychain — encrypted by the system and kept only on this device."
    );
  });

  it('keeps the Android key on this device', () => {
    expect(renderedCopy('android').note).toBe(
      "Your key is saved in this device's Android Keystore — encrypted by the system and kept only on this device."
    );
  });

  it('says the key is saved only on this device on every platform', () => {
    expect(renderedCopy('ios').form).toContain(
      'Your key is saved only on this device, used only for pictures made here, and billed to your OpenAI account. We never keep a copy of it.'
    );
  });
});
