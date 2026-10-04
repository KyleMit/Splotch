import { flushSync } from 'svelte';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { createModal } from '$lib/state/modal.svelte';
import { DIALOG_CLOSING_CLASS, modalDialog } from './modalDialog.svelte';

function createOpacityDialog() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

  const modal = createModal();
  const dialog = document.body.appendChild(document.createElement('dialog'));
  const content = dialog.appendChild(document.createElement('div'));
  content.style.display = 'block';
  const button = content.appendChild(document.createElement('button'));
  const previouslyInert = dialog.appendChild(document.createElement('div'));
  previouslyInert.setAttribute('inert', '');
  vi.spyOn(dialog, 'getAnimations').mockReturnValue([]);
  let openings = 0;
  const destroy = $effect.root(() => {
    const action = modalDialog(dialog, () => ({
      open: modal.open,
      onRequestClose: modal.hide,
      closedContentConcealment: 'opacity',
      onOpen: () => {
        openings += 1;
        button.textContent = `Opening ${openings}`;
      },
    }));
    return action.destroy;
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    destroy();
  };
  onTestFinished(() => {
    dispose();
    dialog.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function takeFrame() {
    const callback = frames.shift();
    if (!callback) throw new Error('The dialog has no pending retirement frame');
    return callback;
  }

  async function finishRetirement() {
    takeFrame()(0);
    await vi.runOnlyPendingTimersAsync();
  }

  return { modal, dialog, content, button, previouslyInert, dispose, takeFrame, finishRetirement };
}

describe('modalDialog opacity concealment', () => {
  it('conceals closed content even when the platform exposes its dialog box', async () => {
    const { modal, dialog, content, finishRetirement } = createOpacityDialog();
    modal.show(null);
    flushSync();
    modal.hide();
    flushSync();

    expect(dialog.open).toBe(true);
    expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(true);
    expect(content.style.opacity).toBe('');
    expect(content.style.visibility).toBe('');
    expect(content.inert).toBe(true);
    expect(content.style.pointerEvents).toBe('none');

    await finishRetirement();

    expect(dialog.open).toBe(false);
    expect(content.style.opacity).toBe('0');
    expect(content.style.visibility).toBe('');
    dialog.style.display = 'block';
    expect(getComputedStyle(dialog).display).toBe('block');
    expect(getComputedStyle(content).opacity).toBe('0');
    expect(content.inert).toBe(true);
    expect(content.style.pointerEvents).toBe('none');
  });

  it('restores content, opacity and input when its owner reopens it', async () => {
    const { modal, dialog, content, button, previouslyInert, finishRetirement } =
      createOpacityDialog();
    modal.show(null);
    flushSync();
    modal.hide();
    flushSync();
    await finishRetirement();
    expect(content.style.opacity).toBe('0');

    modal.show(null);
    flushSync();

    expect(dialog.open).toBe(true);
    expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(false);
    expect(content.style.opacity).toBe('');
    expect(content.style.visibility).toBe('');
    expect(content.inert).toBe(false);
    expect(content.style.pointerEvents).toBe('');
    expect(button.textContent).toBe('Opening 2');
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(previouslyInert.inert).toBe(true);
    expect(previouslyInert.hasAttribute('inert')).toBe(true);
    expect(previouslyInert.style.opacity).toBe('');
  });

  it('cannot conceal reopened content when an abandoned exit settles late', async () => {
    const { modal, dialog, content, button, takeFrame } = createOpacityDialog();
    modal.show(null);
    flushSync();
    modal.hide();
    flushSync();
    const abandonedFrame = takeFrame();
    modal.show(null);
    flushSync();

    abandonedFrame(0);
    await vi.runOnlyPendingTimersAsync();

    expect(dialog.open).toBe(true);
    expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(false);
    expect(content.style.opacity).toBe('');
    expect(content.style.visibility).toBe('');
    expect(content.inert).toBe(false);
    expect(content.style.pointerEvents).toBe('');
    expect(button.textContent).toBe('Opening 1');
  });

  it('releases closed content concealment and input blocking when destroyed', async () => {
    const { modal, dialog, content, previouslyInert, dispose, finishRetirement } =
      createOpacityDialog();
    modal.show(null);
    flushSync();
    modal.hide();
    flushSync();
    await finishRetirement();
    expect(content.style.opacity).toBe('0');

    dispose();

    expect(dialog.open).toBe(false);
    expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(false);
    expect(content.style.opacity).toBe('');
    expect(content.inert).toBe(false);
    expect(content.style.pointerEvents).toBe('');
    expect(previouslyInert.inert).toBe(true);
  });

  it('cannot conceal content when a destroyed exit settles late', async () => {
    const { modal, dialog, content, dispose, takeFrame } = createOpacityDialog();
    modal.show(null);
    flushSync();
    modal.hide();
    flushSync();
    const abandonedFrame = takeFrame();
    dispose();

    abandonedFrame(0);
    await vi.runOnlyPendingTimersAsync();

    expect(dialog.open).toBe(true);
    expect(dialog.classList.contains(DIALOG_CLOSING_CLASS)).toBe(false);
    expect(content.style.opacity).toBe('');
    expect(content.inert).toBe(false);
    expect(content.style.pointerEvents).toBe('');
  });
});
