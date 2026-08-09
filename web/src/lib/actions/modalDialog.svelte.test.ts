import { describe, expect, it } from 'vitest';
import { createModal } from '$lib/state/modal.svelte';
import { modalDialog } from './modalDialog.svelte';

describe('modalDialog', () => {
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
});
