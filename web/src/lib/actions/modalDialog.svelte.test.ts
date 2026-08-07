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
});
