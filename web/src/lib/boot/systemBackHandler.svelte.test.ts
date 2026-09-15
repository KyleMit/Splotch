import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  listeners: [] as (() => void)[],
  moveToBackground: vi.fn(async () => {}),
  removed: 0,
}));

vi.mock('$lib/plugins/systemBack', () => ({
  SystemBack: {
    addListener: async (_event: 'back', listener: () => void) => {
      plugin.listeners.push(listener);
      return {
        remove: async () => {
          plugin.removed += 1;
          plugin.listeners = plugin.listeners.filter((entry) => entry !== listener);
        },
      };
    },
    moveToBackground: plugin.moveToBackground,
  },
}));

import { modalDialog } from '$lib/actions/modalDialog.svelte';
import { createModal, type Modal } from '$lib/state/modal.svelte';
import { canvasState } from '$lib/state/canvas.svelte';
import { leaveConfirmModal } from '$lib/state/leaveConfirm';
import {
  dismissGate,
  parentalGateState,
  requireParentalGate,
  setParentalGateMode,
} from '$lib/state/parentalGate.svelte';
import { settingsModal } from '$lib/state/ui.svelte';
import { listenForSystemBack, respondToSystemBack } from './systemBackHandler';

interface MountedDialog {
  dialog: HTMLDialogElement;
  destroy: () => void;
}

const mounted: MountedDialog[] = [];

function mountDialog(options: Parameters<typeof modalDialog>[1]) {
  const dialog = document.body.appendChild(document.createElement('dialog'));
  const destroy = $effect.root(() => modalDialog(dialog, options).destroy);
  mounted.push({ dialog, destroy });
  return dialog;
}

function mountModal(modal: Modal) {
  return mountDialog(() => ({ open: modal.open, onRequestClose: modal.hide }));
}

// The frame and task a content retirement waits for before the dialog really closes.
function afterRetirement() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('respondToSystemBack', () => {
  beforeEach(() => {
    canvasState.setCanvasEmpty(true);
    plugin.moveToBackground.mockClear();
  });

  afterEach(async () => {
    leaveConfirmModal.hide();
    settingsModal.hide();
    dismissGate();
    await flush();
    for (const { dialog, destroy } of mounted.splice(0)) {
      if (dialog.open) dialog.close();
      destroy();
      dialog.remove();
    }
  });

  it('leaves at once from an empty canvas with nothing open', async () => {
    expect(respondToSystemBack()).toBe('left');
    await vi.waitFor(() => expect(plugin.moveToBackground).toHaveBeenCalledOnce());
  });

  it('asks before leaving a canvas with ink', async () => {
    canvasState.setCanvasEmpty(false);
    expect(respondToSystemBack()).toBe('confirming');
    await flush();
    expect(leaveConfirmModal.open).toBe(true);
    expect(plugin.moveToBackground).not.toHaveBeenCalled();
  });

  it('closes only the top dialog, through its own close path', async () => {
    const lower = createModal();
    const upper = createModal();
    const lowerDialog = mountModal(lower);
    const upperDialog = mountModal(upper);
    lower.show(null);
    await flush();
    upper.show(null);
    await flush();

    expect(respondToSystemBack()).toBe('closed-dialog');
    expect(upper.open).toBe(false);
    expect(lower.open).toBe(true);

    await flush();
    await afterRetirement();
    expect(upperDialog.open).toBe(false);
    expect(lowerDialog.open).toBe(true);

    expect(respondToSystemBack()).toBe('closed-dialog');
    expect(lower.open).toBe(false);
  });

  it('never reaches the dialog beneath while the top one is still retiring', async () => {
    const lower = createModal();
    const upper = createModal();
    mountModal(lower);
    mountModal(upper);
    lower.show(null);
    await flush();
    upper.show(null);
    await flush();

    upper.hide();
    await flush();
    expect(respondToSystemBack()).toBe('kept-dialog');
    expect(lower.open).toBe(true);
  });

  it('keeps a reopened dialog reachable when its previous close event arrives late', async () => {
    const modal = createModal();
    const onClose = vi.fn();
    const dialog = mountDialog(() => ({ open: modal.open, onRequestClose: modal.hide, onClose }));
    modal.show(null);
    await flush();

    // The browser queues `close`; a reopen can land before the old one is dispatched.
    dialog.dispatchEvent(new Event('close'));

    expect(onClose).not.toHaveBeenCalled();
    expect(modal.open).toBe(true);
    expect(respondToSystemBack()).toBe('closed-dialog');
    expect(modal.open).toBe(false);
  });

  it('never leaves while a requested dialog has not reached the screen', () => {
    settingsModal.show(null);
    expect(respondToSystemBack()).toBe('waited');
    expect(plugin.moveToBackground).not.toHaveBeenCalled();
  });

  it('cancels the Grown-Ups Only check without running what it guards', async () => {
    const destination = vi.fn();
    setParentalGateMode('aiImage', 'always');
    // ParentalGate.svelte's own modalDialog options.
    mountDialog(() => ({
      open: parentalGateState.open,
      onRequestClose: dismissGate,
      allowDismiss: () => !parentalGateState.unlocked,
    }));
    requireParentalGate('aiImage', destination);
    await flush();

    expect(respondToSystemBack()).toBe('closed-dialog');
    expect(parentalGateState.open).toBe(false);
    expect(parentalGateState.feature).toBeNull();
    await flush();
    await afterRetirement();
    expect(destination).not.toHaveBeenCalled();
  });

  it('holds the check open while a solved answer hands off', async () => {
    setParentalGateMode('aiImage', 'always');
    mountDialog(() => ({
      open: parentalGateState.open,
      onRequestClose: dismissGate,
      allowDismiss: () => !parentalGateState.unlocked,
    }));
    requireParentalGate('aiImage', () => {});
    await flush();
    parentalGateState.unlocked = true;

    expect(respondToSystemBack()).toBe('kept-dialog');
    expect(parentalGateState.open).toBe(true);
  });

  it('never turns mashed Back on a drawing into leaving', async () => {
    canvasState.setCanvasEmpty(false);
    mountModal(leaveConfirmModal);

    const responses = new Set<string>();
    for (let press = 0; press < 12; press++) {
      responses.add(respondToSystemBack());
      await flush();
      if (press % 3 === 2) await afterRetirement();
    }

    expect([...responses].sort()).toEqual(['closed-dialog', 'confirming', 'kept-dialog']);
    expect(plugin.moveToBackground).not.toHaveBeenCalled();
  });
});

describe('listenForSystemBack', () => {
  it('answers Back from the plugin and detaches on cleanup', async () => {
    canvasState.setCanvasEmpty(true);
    plugin.moveToBackground.mockClear();
    const stop = listenForSystemBack();
    await vi.waitFor(() => expect(plugin.listeners).toHaveLength(1));

    plugin.listeners[0]();
    await vi.waitFor(() => expect(plugin.moveToBackground).toHaveBeenCalledOnce());

    stop();
    await vi.waitFor(() => expect(plugin.listeners).toHaveLength(0));
  });

  it('detaches a subscription that resolves after cleanup', async () => {
    const removedBefore = plugin.removed;
    const stop = listenForSystemBack();
    stop();
    await vi.waitFor(() => expect(plugin.removed).toBe(removedBefore + 1));
    expect(plugin.listeners).toHaveLength(0);
  });
});
