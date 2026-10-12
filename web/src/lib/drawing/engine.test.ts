import { beforeEach, expect, it, vi } from 'vitest';

import { cancelCrayonWarmup, warmCrayonTiles } from './crayonBrush';
import { committedBrushMode, replayHarnessStroke, setBrush, setColor } from './engine';
import { ensureMagicSheet } from './magicBrush';

vi.mock('./crayonBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crayonBrush')>()),
  warmCrayonTiles: vi.fn(),
  cancelCrayonWarmup: vi.fn(),
}));

vi.mock('./magicBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./magicBrush')>()),
  ensureMagicSheet: vi.fn(),
}));

function replayOneDot() {
  replayHarnessStroke({ color: '#E63946', points: [{ x: 10, y: 20 }], size: 3 });
}

beforeEach(() => {
  setBrush('pen');
  vi.clearAllMocks();
});

it('commits whichever brush was set last', () => {
  for (const brush of ['crayon', 'magic', 'eraser', 'pen'] as const) {
    setBrush(brush);
    expect(committedBrushMode()).toBe(brush);
  }
});

it('switching from the eraser to the pen lifts the eraser-only replay guard', () => {
  setBrush('eraser');
  expect(replayOneDot).toThrow('Store drawing replay does not support the eraser');

  setBrush('pen');
  expect(committedBrushMode()).toBe('pen');
  expect(replayOneDot).toThrow('Drawing engine is not live');
});

it('switching from magic to crayon warms the active colour and commits crayon', () => {
  setColor('#2c5faa');
  setBrush('magic');
  expect(ensureMagicSheet).toHaveBeenCalledOnce();
  expect(warmCrayonTiles).not.toHaveBeenCalled();

  setBrush('crayon');
  expect(committedBrushMode()).toBe('crayon');
  expect(warmCrayonTiles).toHaveBeenCalledWith('#2c5faa');
  expect(ensureMagicSheet).toHaveBeenCalledOnce();
});

it('leaving crayon cancels its tile warm-up', () => {
  setBrush('crayon');
  vi.mocked(cancelCrayonWarmup).mockClear();

  setBrush('eraser');

  expect(cancelCrayonWarmup).toHaveBeenCalledOnce();
});

it('distinguishes an empty replay from an unavailable engine', () => {
  expect(() => replayHarnessStroke({ color: '#E63946', points: [], size: 3 })).not.toThrow();
  expect(replayOneDot).toThrow('Drawing engine is not live');
});
