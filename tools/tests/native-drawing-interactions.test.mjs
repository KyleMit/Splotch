import { legacyDrawing } from './native-paper-fixtures.mjs';
import { describe, expect, it } from 'vitest';
import { createPngCapture, createStrokeInput } from '../../src/drawing/interactions.ts';
import { addStroke, createHistory, emptyDrawing, undoDrawing } from '../../src/drawing/model.ts';
import { parseDrawing } from '../../src/drawing/drawingFormat.ts';

describe('native drawing interaction ownership', () => {
  it('ignores an expired export callback after a new capture starts', async () => {
    const captures = createPngCapture();
    const first = captures.begin(emptyDrawing(), () => true);
    const refused = first.promise.catch((error) => error.message);
    expect(first.cancel('expired')).toBe(true);
    expect(await refused).toBe('expired');
    const second = captures.begin(emptyDrawing(), () => true);
    expect(first.complete('old PNG', { width: 1, height: 1 })).toBe(false);
    expect(second.complete('new PNG', { width: 1, height: 1 })).toBe(true);
    await expect(second.promise).resolves.toMatchObject({
      base64: 'new PNG',
      size: { width: 1, height: 1 },
    });
    expect(second.complete('duplicate PNG', { width: 1, height: 1 })).toBe(false);
  });

  it('rejects an owned pending capture when its view unmounts', async () => {
    const request = createPngCapture().begin(emptyDrawing(), () => true);
    const refused = request.promise.catch((error) => error.message);
    expect(request.cancel('cancelled')).toBe(true);
    expect(await refused).toBe('cancelled');
    expect(request.complete('late PNG', { width: 1, height: 1 })).toBe(false);
  });

  it('keeps another finger out of the original stroke and preserves the original endpoint', () => {
    const input = createStrokeInput();
    input.start('finger A', { color: 'Purple', brush: 'marker', width: 22 }, { x: 10, y: 20 });
    expect(input.sample('finger B', { x: 900, y: 700 })).toBeNull();
    expect(input.finish('finger B', { x: 900, y: 700 })).toBeNull();
    const stroke = input.finish('finger A', { x: 10.25, y: 20.25 });
    expect(stroke.points).toEqual([
      { x: 10, y: 20 },
      { x: 10.25, y: 20.25 },
    ]);
    expect(input.sample('finger B', { x: 800, y: 600 })).toBeNull();
    expect(input.finish()).toBeNull();
  });

  it('finishes exactly once when an additional contact interrupts drawing', () => {
    const input = createStrokeInput();
    input.start('finger A', { color: 'Blue', brush: 'pencil', width: 7 }, { x: 10, y: 20 });
    expect(input.finish().points).toEqual([{ x: 10, y: 20 }]);
    expect(input.sample('finger A', { x: 80, y: 90 })).toBeNull();
    expect(input.sample('finger B', { x: 80, y: 90 })).toBeNull();
    expect(input.finish()).toBeNull();
  });

  it('keeps a long stroke and its final sample, save, undo, and the next stroke', () => {
    const input = createStrokeInput();
    const draft = input.start(
      'finger A',
      { color: 'Blue', brush: 'pencil', width: 7 },
      { x: 10, y: 20 }
    );
    draft.points = Array.from({ length: 100_000 }, () => ({ x: 10, y: 20 }));
    expect(input.sample('finger A', { x: 30, y: 40 }).points).toHaveLength(100_001);
    const finished = input.finish('finger A', { x: 50, y: 60 });
    expect(finished.points).toHaveLength(100_002);
    expect(input.identifier()).toBeUndefined();
    const committed = addStroke(createHistory(legacyDrawing()), finished);
    expect(parseDrawing(JSON.parse(JSON.stringify(committed.drawing)))).toEqual(committed.drawing);
    expect(undoDrawing(committed).drawing).toEqual(legacyDrawing());
    input.start('finger B', { color: 'Purple', brush: 'marker', width: 22 }, { x: 70, y: 80 });
    expect(input.finish('finger B', { x: 90, y: 100 }).points).toHaveLength(2);
  });
});

it('returns the exact producer grid and keeps its currentness live after completion', async () => {
  let current = true;
  const request = createPngCapture().begin(emptyDrawing(), () => current);
  const size = { width: 1600, height: 2000 };
  expect(request.complete('producer-png', size)).toBe(true);
  const captured = await request.promise;
  expect(captured.base64).toBe('producer-png');
  expect(captured.size).toBe(size);
  expect(captured.isCurrent()).toBe(true);
  current = false;
  expect(captured.isCurrent()).toBe(false);
});
