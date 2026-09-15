import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installUndoShortcut } from './undoShortcut';
import { canvasState } from '$lib/state/canvas.svelte';

const undo = vi.fn();
vi.mock('$lib/drawing/engine', () => ({
  undo: () => undo(),
}));

function pressCtrlZ(init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, ...init }));
}

function pressCtrlZFrom(target: Element) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
}

let teardown: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  canvasState.canUndo = true;
  document.body.replaceChildren();
});

afterEach(() => {
  teardown?.();
  teardown = null;
});

it('undoes on Ctrl+Z when history is available', () => {
  teardown = installUndoShortcut();

  pressCtrlZ();

  expect(undo).toHaveBeenCalledTimes(1);
});

it('undoes on Cmd+Z (metaKey) the same as Ctrl+Z', () => {
  teardown = installUndoShortcut();

  pressCtrlZ({ ctrlKey: false, metaKey: true });

  expect(undo).toHaveBeenCalledTimes(1);
});

it('does nothing when history is empty', () => {
  canvasState.canUndo = false;
  teardown = installUndoShortcut();

  pressCtrlZ();

  expect(undo).not.toHaveBeenCalled();
});

it('ignores the combo with an extra modifier held', () => {
  teardown = installUndoShortcut();

  pressCtrlZ({ shiftKey: true });
  pressCtrlZ({ altKey: true });

  expect(undo).not.toHaveBeenCalled();
});

it('ignores keys other than z', () => {
  teardown = installUndoShortcut();

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));

  expect(undo).not.toHaveBeenCalled();
});

it.each(['input', 'textarea'] as const)('leaves native undo to an editable %s', (tagName) => {
  const editable = document.createElement(tagName);
  document.body.append(editable);
  teardown = installUndoShortcut();

  pressCtrlZFrom(editable);

  expect(undo).not.toHaveBeenCalled();
});

it('leaves native undo to descendants of contenteditable regions', () => {
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  const target = document.createElement('span');
  editable.append(target);
  document.body.append(editable);
  teardown = installUndoShortcut();

  pressCtrlZFrom(target);

  expect(undo).not.toHaveBeenCalled();
});

it('ignores the shortcut anywhere inside an open dialog', () => {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  const target = document.createElement('button');
  dialog.append(target);
  document.body.append(dialog);
  teardown = installUndoShortcut();

  pressCtrlZFrom(target);

  expect(undo).not.toHaveBeenCalled();
});

it('stops handling keydown after teardown', () => {
  teardown = installUndoShortcut();
  teardown();
  teardown = null;

  pressCtrlZ();

  expect(undo).not.toHaveBeenCalled();
});
