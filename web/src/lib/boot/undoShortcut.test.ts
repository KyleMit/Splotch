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

let teardown: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  canvasState.canUndo = true;
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

it('stops handling keydown after teardown', () => {
  teardown = installUndoShortcut();
  teardown();
  teardown = null;

  pressCtrlZ();

  expect(undo).not.toHaveBeenCalled();
});
