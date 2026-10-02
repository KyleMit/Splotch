import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { createModal } from '$lib/state/modal.svelte';
import { DIALOG_CLOSING_CLASS, modalDialog } from './modalDialog.svelte';

const HELD_EXIT_DURATION_MS = 10_000;

function createMaskedDialog() {
  const modal = createModal();
  const dialog = document.body.appendChild(document.createElement('dialog'));
  const content = dialog.appendChild(document.createElement('div'));
  const stylesheet = document.head.appendChild(document.createElement('style'));
  stylesheet.textContent = '.retired-mask-fixture { opacity: 1; }';
  content.className = 'retired-mask-fixture';
  let openings = 0;
  const destroy = $effect.root(() => {
    const action = modalDialog(dialog, () => ({
      open: modal.open,
      onRequestClose: modal.hide,
      retiredContentMask: 'opacity',
      onOpen() {
        openings += 1;
        content.textContent = `Opening ${openings}`;
      },
    }));
    return action.destroy;
  });
  return {
    modal,
    dialog,
    content,
    dispose() {
      destroy();
      dialog.remove();
      stylesheet.remove();
    },
  };
}

function afterRetirementPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

describe('modalDialog retired content opacity mask', () => {
  it('conceals inert retired content when the platform exposes its closed dialog', async () => {
    const fixture = createMaskedDialog();
    try {
      fixture.modal.show(null);
      flushSync();
      fixture.modal.hide();
      flushSync();
      await afterRetirementPaint();

      expect(fixture.dialog.open).toBe(false);
      fixture.dialog.showModal();
      expect(fixture.content.textContent).toBe('Opening 1');
      expect(getComputedStyle(fixture.content).opacity).toBe('0');
      expect(fixture.content.inert).toBe(true);
      expect(fixture.content.style.pointerEvents).toBe('none');
    } finally {
      fixture.dispose();
    }
  });

  it('presents refreshed content on the owner reopening a retired dialog', async () => {
    const fixture = createMaskedDialog();
    try {
      fixture.modal.show(null);
      flushSync();
      fixture.modal.hide();
      flushSync();
      await afterRetirementPaint();

      fixture.modal.show(null);
      flushSync();

      expect(fixture.dialog.open).toBe(true);
      expect(fixture.content.textContent).toBe('Opening 2');
      expect(getComputedStyle(fixture.content).opacity).toBe('1');
      expect(fixture.content.inert).toBe(false);
      expect(fixture.content.style.pointerEvents).toBe('');
    } finally {
      fixture.dispose();
    }
  });

  it('keeps visible content when a reopened dialog abandons its pending exit', async () => {
    const fixture = createMaskedDialog();
    let finishExit = () => {};
    const finished = new Promise<void>((resolve) => (finishExit = resolve));
    Object.defineProperty(fixture.dialog, 'getAnimations', {
      configurable: true,
      value: () =>
        fixture.dialog.classList.contains(DIALOG_CLOSING_CLASS)
          ? [
              {
                finished,
                effect: { getComputedTiming: () => ({ endTime: HELD_EXIT_DURATION_MS }) },
              },
            ]
          : [],
    });
    try {
      fixture.modal.show(null);
      flushSync();
      fixture.modal.hide();
      flushSync();
      expect(fixture.content.inert).toBe(true);
      expect(getComputedStyle(fixture.content).opacity).toBe('1');

      fixture.modal.show(null);
      flushSync();
      finishExit();
      await afterRetirementPaint();

      expect(fixture.dialog.open).toBe(true);
      expect(fixture.dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(false);
      expect(getComputedStyle(fixture.content).opacity).toBe('1');
      expect(fixture.content.inert).toBe(false);
      expect(fixture.content.style.pointerEvents).toBe('');
    } finally {
      fixture.dispose();
    }
  });
});
