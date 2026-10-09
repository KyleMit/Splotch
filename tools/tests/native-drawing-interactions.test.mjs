import { describe, expect, it } from 'vitest';
import {
  createPngCapture,
  createStrokeInput,
} from '../../experiments/native-architecture/src/drawing/interactions.ts';
import {
  addStroke,
  createHistory,
  emptyDrawing,
  MAX_POINTS,
  parseDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

describe('native drawing interaction ownership', () => {
  it('ignores an expired export callback after a new capture starts', async () => {
    const captures = createPngCapture();
    const first = captures.begin(emptyDrawing());
    const refused = first.promise.catch((error) => error.message);
    expect(first.cancel('expired')).toBe(true);
    expect(await refused).toBe('expired');
    const second = captures.begin(emptyDrawing());
    expect(first.complete('old PNG')).toBe(false);
    expect(second.complete('new PNG')).toBe(true);
    await expect(second.promise).resolves.toBe('new PNG');
    expect(second.complete('duplicate PNG')).toBe(false);
  });

  it('rejects an owned pending capture when its view unmounts', async () => {
    const request = createPngCapture().begin(emptyDrawing());
    const refused = request.promise.catch((error) => error.message);
    expect(request.cancel('cancelled')).toBe(true);
    expect(await refused).toBe('cancelled');
    expect(request.complete('late PNG')).toBe(false);
  });

  it('keeps another finger out of the original stroke and preserves the original endpoint', () => {
    const input = createStrokeInput();
    input.start('finger A', 'Purple', 'marker', { x: 10, y: 20 });
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
    input.start('finger A', 'Blue', 'pencil', { x: 10, y: 20 });
    expect(input.finish().points).toEqual([{ x: 10, y: 20 }]);
    expect(input.sample('finger A', { x: 80, y: 90 })).toBeNull();
    expect(input.sample('finger B', { x: 80, y: 90 })).toBeNull();
    expect(input.finish()).toBeNull();
  });

  it('releases capped input and preserves save, undo, and the next stroke after a refused sample', () => {
    const input = createStrokeInput();
    const draft = input.start('finger A', 'Blue', 'pencil', { x: 10, y: 20 });
    draft.points = Array.from({ length: MAX_POINTS }, () => ({ x: 10, y: 20 }));
    expect(() => input.sample('finger A', { x: 30, y: 40 })).toThrow('Lift your finger');
    const finished = input.finish('finger A', { x: 50, y: 60 });
    expect(finished.points).toHaveLength(MAX_POINTS);
    expect(input.identifier()).toBeUndefined();
    const committed = addStroke(createHistory(), finished);
    expect(parseDrawing(JSON.parse(JSON.stringify(committed.drawing)))).toEqual(committed.drawing);
    expect(undoDrawing(committed).drawing).toEqual(emptyDrawing());
    input.start('finger B', 'Purple', 'marker', { x: 70, y: 80 });
    expect(input.finish('finger B', { x: 90, y: 100 }).points).toHaveLength(2);
  });
});
