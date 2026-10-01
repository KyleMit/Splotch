import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIALOG_CLOSING_CLASS } from '$lib/actions/modalDialog.svelte';
import {
  clearRequestedSettingsSection,
  SETTINGS_MODAL_ID,
  settingsModal,
} from '$lib/state/ui.svelte';
import { createPageParentCenter } from './pageParentCenter.svelte';

const idle = vi.hoisted(() => ({ queued: [] as Array<() => void>, cancel: vi.fn() }));
vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    idle.queued.push(callback);
    return idle.cancel;
  },
}));
vi.mock('$lib/components/ParentalGate.svelte', () => ({ default: vi.fn() }));

vi.mock('$lib/components/SettingsModal.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/boot/persistedState', () => ({ hydratePersistedState: vi.fn() }));

function createParentCenterUnderEffects() {
  let parentCenter!: ReturnType<typeof createPageParentCenter>;
  const destroy = $effect.root(() => {
    parentCenter = createPageParentCenter();
  });
  return { parentCenter, destroy };
}

function afterDialogRetirementCheck() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

function openSettingsDialog() {
  const dialog = document.body.appendChild(document.createElement('dialog'));
  dialog.id = SETTINGS_MODAL_ID;
  dialog.showModal();
  return dialog;
}

afterEach(() => {
  idle.queued.length = 0;
  idle.cancel.mockClear();
  settingsModal.hide();
  clearRequestedSettingsSection();
  document.getElementById(SETTINGS_MODAL_ID)?.remove();
});

describe('standalone page Parent Center', () => {
  it('warms the gate through the existing idle owner and returns its cancellation', async () => {
    const { parentCenter, destroy } = createParentCenterUnderEffects();
    try {
      expect(parentCenter.gateComponent).toBeNull();
      const cancel = parentCenter.warmParentalGate();
      expect(idle.queued).toHaveLength(1);
      expect(parentCenter.gateComponent).toBeNull();
      idle.queued[0]();
      await vi.waitFor(() => expect(parentCenter.gateComponent).not.toBeNull());
      cancel();
      expect(idle.cancel).toHaveBeenCalledOnce();
    } finally {
      destroy();
    }
  });

  it('keeps its modal mounted when Settings reopens during retirement', async () => {
    const dialog = openSettingsDialog();
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

  it('keeps its modal mounted until the Settings dialog finishes its exit', async () => {
    const dialog = openSettingsDialog();
    dialog.classList.add(DIALOG_CLOSING_CLASS);
    const { parentCenter, destroy } = createParentCenterUnderEffects();

    try {
      parentCenter.openParentCenter(null);
      await Promise.resolve();
      settingsModal.hide();
      await afterDialogRetirementCheck();

      expect(parentCenter.managingPolicies).toBe(true);
      dialog.close();
      await vi.waitFor(() => expect(parentCenter.managingPolicies).toBe(false));
    } finally {
      destroy();
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
