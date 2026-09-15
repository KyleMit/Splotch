import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRequestedSettingsSection, settingsModal } from '$lib/state/ui.svelte';
import { createPrivacyParentCenter } from './parentCenter.svelte';

vi.mock('$lib/components/SettingsModal.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/boot/persistedState', () => ({ hydratePersistedState: vi.fn() }));

function createParentCenterUnderEffects() {
  let parentCenter!: ReturnType<typeof createPrivacyParentCenter>;
  const destroy = $effect.root(() => {
    parentCenter = createPrivacyParentCenter();
  });
  return { parentCenter, destroy };
}

function afterDialogRetirementCheck() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

afterEach(() => {
  settingsModal.hide();
  clearRequestedSettingsSection();
  document.querySelector('#settingsModal')?.remove();
});

describe('privacy Parent Center', () => {
  it('keeps its modal mounted when Settings reopens during retirement', async () => {
    const dialog = document.body.appendChild(document.createElement('dialog'));
    dialog.id = 'settingsModal';
    dialog.showModal();
    const { parentCenter, destroy } = createParentCenterUnderEffects();

    try {
      parentCenter.openParentCenter(null);
      await Promise.resolve();
      settingsModal.hide();
      await Promise.resolve();
      settingsModal.show(null);
      await Promise.resolve();

      await afterDialogRetirementCheck();

      expect(parentCenter.managingPolicies).toBe(true);
    } finally {
      destroy();
      dialog.close();
      dialog.remove();
    }
  });

  it('drops its modal mount when Settings closes before the dialog loads', async () => {
    const { parentCenter, destroy } = createParentCenterUnderEffects();

    try {
      parentCenter.openParentCenter(null);
      await Promise.resolve();
      settingsModal.hide();
      await Promise.resolve();

      expect(parentCenter.managingPolicies).toBe(false);
    } finally {
      destroy();
    }
  });
});
