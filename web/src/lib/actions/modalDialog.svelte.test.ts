import { describe, expect, it, vi } from 'vitest';
import { createModal } from '$lib/state/modal.svelte';
import { DIALOG_CLOSING_CLASS, modalDialog, waitForDialogRetirement } from './modalDialog.svelte';

describe('modalDialog', () => {
  function afterContentRetirementPaint() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
  }

  it('stays pending until the action retires the dialog, then resolves', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        onRequestClose: modal.hide,
      }));
      return action.destroy;
    });

    try {
      modal.show(null);
      await Promise.resolve();

      let settled = false;
      const retired = waitForDialogRetirement(dialog).then(() => (settled = true));
      modal.hide();
      await Promise.resolve();
      expect(settled).toBe(false);

      await afterContentRetirementPaint();
      await retired;
      expect(dialog.open).toBe(false);

      await expect(waitForDialogRetirement(dialog)).resolves.toBeUndefined();
    } finally {
      destroy();
      dialog.remove();
    }
  });

  it('settles when dialog retirement is abandoned', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        onRequestClose: modal.hide,
      }));
      return action.destroy;
    });

    try {
      modal.show(null);
      await Promise.resolve();
      const retired = waitForDialogRetirement(dialog);
      modal.hide();
      await Promise.resolve();
      modal.show(null);
      await Promise.resolve();

      await afterContentRetirementPaint();
      await expect(retired).resolves.toBeUndefined();
      expect(dialog.open).toBe(true);
    } finally {
      modal.hide();
      await Promise.resolve();
      destroy();
      dialog.remove();
    }
  });

  it('removes exiting content from focus and accessibility until cleanup', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const content = dialog.appendChild(document.createElement('div'));
    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        onRequestClose: modal.hide,
      }));
      return action.destroy;
    });

    try {
      modal.show(null);
      await Promise.resolve();
      modal.hide();
      await Promise.resolve();

      expect(content.inert).toBe(true);
      await afterContentRetirementPaint();
      expect(dialog.open).toBe(false);

      modal.show(null);
      await Promise.resolve();
      expect(content.inert).toBe(false);
    } finally {
      modal.hide();
      await Promise.resolve();
      destroy();
      dialog.remove();
    }
  });

  it('keeps waiting while an open dialog is still playing its exit', async () => {
    const dialog = document.body.appendChild(document.createElement('dialog'));
    dialog.appendChild(document.createElement('div'));
    try {
      dialog.showModal();
      dialog.classList.add(DIALOG_CLOSING_CLASS);

      let settled = false;
      const retired = waitForDialogRetirement(dialog).then(() => (settled = true));
      await afterContentRetirementPaint();
      expect(settled).toBe(false);

      dialog.close();
      await retired;
      expect(settled).toBe(true);
    } finally {
      if (dialog.open) dialog.close();
      dialog.remove();
    }
  });

  it('clears an anchored origin when the same dialog reopens without one', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        origin: modal.origin,
        onRequestClose: modal.hide,
      }));
      return action.destroy;
    });

    try {
      modal.show({ x: 100, y: 200 });
      await Promise.resolve();
      expect(dialog.style.getPropertyValue('--origin-x')).not.toBe('');
      expect(dialog.style.getPropertyValue('--origin-y')).not.toBe('');

      modal.hide();
      await Promise.resolve();
      modal.show(null);
      await Promise.resolve();

      expect(dialog.style.getPropertyValue('--origin-x')).toBe('');
      expect(dialog.style.getPropertyValue('--origin-y')).toBe('');
    } finally {
      modal.hide();
      await Promise.resolve();
      destroy();
      dialog.remove();
    }
  });

  it('allows a descendant control outside the dialog border box to receive pointer input', () => {
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const button = dialog.appendChild(document.createElement('button'));
    dialog.getBoundingClientRect = () =>
      ({ left: 100, right: 200, top: 100, bottom: 200 }) as DOMRect;
    let pointerDowns = 0;
    button.addEventListener('pointerdown', () => pointerDowns++);

    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: false,
        onRequestClose: () => {},
      }));
      return action.destroy;
    });

    try {
      button.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: 300,
          clientY: 300,
        })
      );
      expect(pointerDowns).toBe(1);
    } finally {
      destroy();
      dialog.remove();
    }
  });

  it('dismisses a pointer event targeting the backdrop outside the dialog border box', () => {
    const dialog = document.body.appendChild(document.createElement('dialog'));
    dialog.getBoundingClientRect = () =>
      ({ left: 100, right: 200, top: 100, bottom: 200 }) as DOMRect;
    let closeRequests = 0;

    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: false,
        onRequestClose: () => closeRequests++,
      }));
      return action.destroy;
    });

    try {
      const pointerDown = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 300,
        clientY: 300,
      });
      dialog.dispatchEvent(pointerDown);

      expect(closeRequests).toBe(1);
      expect(pointerDown.defaultPrevented).toBe(true);
    } finally {
      destroy();
      dialog.remove();
    }
  });

  it('keeps retired content hidden until the closed dialog reopens', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const content = dialog.appendChild(document.createElement('div'));
    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        onRequestClose: modal.hide,
      }));
      return action.destroy;
    });

    try {
      modal.show(null);
      await Promise.resolve();
      modal.hide();
      await Promise.resolve();

      expect(dialog.open).toBe(true);
      expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(true);
      expect(content.style.visibility).toBe('');

      await afterContentRetirementPaint();

      expect(dialog.open).toBe(false);
      expect(content.style.visibility).toBe('hidden');

      modal.show(null);
      await Promise.resolve();

      expect(dialog.open).toBe(true);
      expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(false);
      expect(content.style.visibility).toBe('');
    } finally {
      destroy();
      dialog.remove();
    }
  });

  // Chromium's CloseWatcher makes a dialog's `cancel` non-cancelable once the
  // previous preventDefault spent the page's user activation, so a repeated
  // Escape or Android back closes the dialog natively past onCancel. Stood in
  // for here by a direct native close with dismissal disallowed.
  it('reopens a dialog the platform closed past a refused dismissal', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    let dismissAllowed = false;
    const onRequestClose = vi.fn(modal.hide);
    const onClose = vi.fn();
    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        onRequestClose,
        onClose,
        allowDismiss: () => dismissAllowed,
      }));
      return action.destroy;
    });

    try {
      modal.show(null);
      await Promise.resolve();
      expect(dialog.open).toBe(true);

      dialog.close();
      await afterContentRetirementPaint();

      expect(dialog.open).toBe(true);
      expect(modal.open).toBe(true);
      expect(onRequestClose).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.style.animation).toBe('none');

      dismissAllowed = true;
      modal.hide();
      await Promise.resolve();
      await afterContentRetirementPaint();

      expect(dialog.open).toBe(false);
      expect(onClose).toHaveBeenCalledOnce();
      expect(dialog.style.animation).toBe('');
    } finally {
      destroy();
      dialog.remove();
    }
  });

  function stubExit(dialog: HTMLDialogElement, endTime: number) {
    let finish = () => {};
    const finished = new Promise<void>((resolve) => (finish = resolve));
    Object.defineProperty(dialog, 'getAnimations', {
      configurable: true,
      value: () =>
        dialog.classList.contains(DIALOG_CLOSING_CLASS)
          ? [{ finished, effect: { getComputedTiming: () => ({ endTime }) } }]
          : [],
    });
    return () => finish();
  }

  function mountClosable(dialog: HTMLDialogElement, modal: ReturnType<typeof createModal>) {
    return $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        onRequestClose: modal.hide,
      }));
      return action.destroy;
    });
  }

  it('closes only once the exit animation finishes', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const finishExit = stubExit(dialog, 10_000);
    const destroy = mountClosable(dialog, modal);

    try {
      modal.show(null);
      await Promise.resolve();
      modal.hide();
      await Promise.resolve();
      await afterContentRetirementPaint();

      expect(dialog.open).toBe(true);
      expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(true);

      finishExit();
      await vi.waitFor(() => expect(dialog.open).toBe(false));
    } finally {
      destroy();
      dialog.remove();
    }
  });

  it('closes past an exit that never reports finishing', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    stubExit(dialog, 20);
    const destroy = mountClosable(dialog, modal);

    try {
      modal.show(null);
      await Promise.resolve();
      modal.hide();
      await Promise.resolve();

      expect(dialog.open).toBe(true);
      await vi.waitFor(() => expect(dialog.open).toBe(false));
    } finally {
      destroy();
      dialog.remove();
    }
  });

  it('restarts cleanly when reopened mid-exit', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const content = dialog.appendChild(document.createElement('div'));
    const finishExit = stubExit(dialog, 10_000);
    const destroy = mountClosable(dialog, modal);

    try {
      modal.show(null);
      await Promise.resolve();
      modal.hide();
      await Promise.resolve();
      modal.show(null);
      await Promise.resolve();
      finishExit();
      await afterContentRetirementPaint();

      expect(dialog.open).toBe(true);
      expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(false);
      expect(content.inert).toBe(false);
      expect(content.style.pointerEvents).toBe('');
    } finally {
      modal.hide();
      await Promise.resolve();
      destroy();
      dialog.remove();
    }
  });

  it('cancels content retirement when the dialog reopens before close', async () => {
    const modal = createModal();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const content = dialog.appendChild(document.createElement('div'));
    const destroy = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: modal.open,
        onRequestClose: modal.hide,
      }));
      return action.destroy;
    });

    try {
      modal.show(null);
      await Promise.resolve();
      await afterContentRetirementPaint();
      modal.hide();
      await Promise.resolve();
      await afterContentRetirementPaint();
      modal.show(null);
      await Promise.resolve();

      expect(dialog.open).toBe(true);
      expect(content.style.visibility).toBe('');
    } finally {
      modal.hide();
      await Promise.resolve();
      destroy();
      dialog.remove();
    }
  });
});
