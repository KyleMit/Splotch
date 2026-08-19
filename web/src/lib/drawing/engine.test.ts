import { beforeEach, expect, it } from 'vitest';

import {
  committedBrushMode,
  replayHarnessStroke,
  setCrayonMode,
  setEraserMode,
  setMagicMode,
} from './engine';

// committedBrushMode is the E2E harness's answer to "what would a stroke started
// now paint as" (ADR-0080), so its precedence has to be renderOp's — not the
// UI's, where the brushes are one exclusive axis. These cases are the overlaps
// the UI cannot produce but a mid-flush engine can, while the two $effects that
// push the flags land.
beforeEach(() => {
  setEraserMode(false);
  setMagicMode(false);
  setCrayonMode(false);
});

it('reports the plain pen when no modifier is set', () => {
  expect(committedBrushMode()).toBe('pen');
});

it('reports each modifier the UI can select on its own', () => {
  setMagicMode(true);
  expect(committedBrushMode()).toBe('magic');
  setMagicMode(false);

  setCrayonMode(true);
  expect(committedBrushMode()).toBe('crayon');
  setCrayonMode(false);

  setEraserMode(true);
  expect(committedBrushMode()).toBe('eraser');
});

it('ranks a magic op above an eraser or crayon one, as renderOp does', () => {
  setMagicMode(true);
  setEraserMode(true);
  setCrayonMode(true);
  expect(committedBrushMode()).toBe('magic');
});

it('ranks erasing above crayon texture, as renderOp does', () => {
  setCrayonMode(true);
  setEraserMode(true);
  expect(committedBrushMode()).toBe('eraser');
});

it('rejects store drawing replay while the eraser is active', () => {
  setEraserMode(true);
  expect(() =>
    replayHarnessStroke({ color: '#E63946', points: [{ x: 10, y: 20 }], size: 3 })
  ).toThrow('Store drawing replay does not support the eraser');
});

it('distinguishes an empty replay from an unavailable engine', () => {
  expect(() => replayHarnessStroke({ color: '#E63946', points: [], size: 3 })).not.toThrow();
  expect(() =>
    replayHarnessStroke({ color: '#E63946', points: [{ x: 10, y: 20 }], size: 3 })
  ).toThrow('Drawing engine is not live');
});
