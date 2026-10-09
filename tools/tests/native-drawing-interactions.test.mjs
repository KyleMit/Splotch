import { describe, expect, it } from 'vitest';
import { createPngCapture } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import {
  addStrokes,
  createHistory,
  drawingCapacity,
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

  it('retains independent contacts until the last lift and commits one shared Undo entry', () => {
    const input = createContactCohort();
    const history = createHistory();
    input.start('A', 'Purple', 'marker', { x: 10, y: 20 }, history.drawing);
    input.start('B', 'Blue', 'pencil', { x: 900, y: 700 }, history.drawing);
    input.sample('A', { x: 20, y: 30 });
    input.sample('B', { x: 800, y: 600 });
    input.sample('B', { x: 800.25, y: 600.25 }, true);
    expect(input.finish('B')).toBeNull();
    expect(input.hasActive()).toBe(true);
    expect(input.drafts()).toHaveLength(2);
    input.sample('A', { x: 30, y: 40 });
    const strokes = input.finish('A');
    expect(strokes).toEqual([
      {
        color: 'Purple',
        brush: 'marker',
        points: [
          { x: 10, y: 20 },
          { x: 20, y: 30 },
          { x: 30, y: 40 },
        ],
      },
      {
        color: 'Blue',
        brush: 'pencil',
        points: [
          { x: 900, y: 700 },
          { x: 800, y: 600 },
          { x: 800.25, y: 600.25 },
        ],
      },
    ]);
    const committed = addStrokes(history, strokes);
    expect(committed.undo).toHaveLength(1);
    expect(parseDrawing(JSON.parse(JSON.stringify(committed.drawing)))).toEqual(committed.drawing);
    expect(undoDrawing(committed).drawing).toEqual(history.drawing);
    expect(input.hasActive()).toBe(false);
    expect(input.drafts()).toEqual([]);
    expect(input.finish('A')).toBeNull();
    expect(input.interrupt()).toBeNull();
  });

  it('keeps one cohort across interleaved contact starts and allows identifier reuse after lift', () => {
    const input = createContactCohort();
    const drawing = emptyDrawing();
    input.start('A', 'Purple', 'marker', { x: 10, y: 20 }, drawing);
    input.start('B', 'Blue', 'pencil', { x: 80, y: 90 }, drawing);
    expect(input.finish('A')).toBeNull();
    input.start('A', 'Green', 'pencil', { x: 100, y: 200 }, drawing);
    expect(input.finish('B')).toBeNull();
    const strokes = input.finish('A');
    expect(strokes.map(({ color }) => color)).toEqual(['Purple', 'Blue', 'Green']);
    const first = addStrokes(createHistory(), strokes);
    input.start('C', 'Red', 'marker', { x: 300, y: 400 }, first.drawing);
    const second = addStrokes(first, input.finish('C'));
    expect(second.undo).toHaveLength(2);
    expect(undoDrawing(second).drawing).toEqual(first.drawing);
    expect(undoDrawing(undoDrawing(second)).drawing).toEqual(drawing);
  });

  it('ignores duplicate starts and unknown or late moves without replacing captured style', () => {
    const input = createContactCohort();
    const drawing = emptyDrawing();
    input.start('A', 'Purple', 'marker', { x: 10, y: 20 }, drawing);
    input.start('A', 'Red', 'pencil', { x: 900, y: 700 }, drawing);
    input.sample('foreign', { x: 500, y: 600 });
    expect(input.finish('foreign')).toBeNull();
    expect(input.finish('A')).toEqual([
      { color: 'Purple', brush: 'marker', points: [{ x: 10, y: 20 }] },
    ]);
    input.sample('A', { x: 800, y: 600 });
    expect(input.drafts()).toEqual([]);
  });

  it('interrupts every active contact once while preserving completed contacts and the next gesture', () => {
    const input = createContactCohort();
    const drawing = emptyDrawing();
    input.start('A', 'Blue', 'pencil', { x: 10, y: 20 }, drawing);
    input.start('B', 'Purple', 'marker', { x: 80, y: 90 }, drawing);
    input.start('C', 'Green', 'marker', { x: 100, y: 200 }, drawing);
    expect(input.finish('B')).toBeNull();
    const completed = input.interrupt();
    expect(completed).toHaveLength(3);
    expect(input.hasActive()).toBe(false);
    expect(input.finish('A')).toBeNull();
    expect(input.finish('C')).toBeNull();
    expect(input.interrupt()).toBeNull();
    input.start('D', 'Red', 'pencil', { x: 50, y: 60 }, drawing);
    expect(input.finish('D')).toEqual([
      { color: 'Red', brush: 'pencil', points: [{ x: 50, y: 60 }] },
    ]);
  });

  it('refuses overflow samples before accepting ink and still commits all accepted contacts', () => {
    const existing = {
      color: 'Purple',
      brush: 'marker',
      points: Array.from({ length: MAX_POINTS - 4 }, () => ({ x: 10, y: 20 })),
    };
    const history = createHistory({ version: 1, strokes: [existing] });
    const input = createContactCohort();
    input.start('A', 'Blue', 'pencil', { x: 30, y: 40 }, history.drawing);
    input.start('B', 'Green', 'marker', { x: 50, y: 60 }, history.drawing);
    input.sample('A', { x: 40, y: 50 });
    input.sample('B', { x: 60, y: 70 });
    expect(() => input.sample('A', { x: 70, y: 80 }, true)).toThrow('picture is full');
    expect(() => input.start('C', 'Red', 'marker', { x: 80, y: 90 }, history.drawing)).toThrow(
      'picture is full'
    );
    expect(input.finish('A')).toBeNull();
    const completed = input.finish('B');
    expect(completed.map(({ points }) => points.length)).toEqual([2, 2]);
    const committed = addStrokes(history, completed);
    expect(committed.drawing.strokes).toHaveLength(3);
    expect(committed.undo).toHaveLength(1);
    expect(undoDrawing(committed).drawing).toEqual(history.drawing);
  });

  it('keeps accepted contacts when the last available stroke slot rejects another finger', () => {
    const dot = { color: 'Purple', brush: 'marker', points: [{ x: 10, y: 20 }] };
    const availableStrokes = drawingCapacity(emptyDrawing()).strokes;
    const history = createHistory({
      version: 1,
      strokes: Array.from({ length: availableStrokes - 1 }, () => dot),
    });
    const input = createContactCohort();
    input.start('A', 'Blue', 'pencil', { x: 30, y: 40 }, history.drawing);
    expect(() => input.start('B', 'Red', 'marker', { x: 50, y: 60 }, history.drawing)).toThrow(
      'picture is full'
    );
    const committed = addStrokes(history, input.finish('A'));
    expect(committed.drawing.strokes).toHaveLength(availableStrokes);
    expect(committed.undo).toHaveLength(1);
    expect(undoDrawing(committed).drawing).toEqual(history.drawing);
  });

  it('freezes an earlier PNG snapshot while a later contact cohort completes', async () => {
    const history = createHistory();
    const request = createPngCapture().begin(history.drawing);
    const input = createContactCohort();
    input.start('A', 'Blue', 'pencil', { x: 10, y: 20 }, history.drawing);
    input.start('B', 'Green', 'marker', { x: 30, y: 40 }, history.drawing);
    const later = addStrokes(history, input.interrupt());
    expect(later.drawing.strokes).toHaveLength(2);
    expect(request.drawing).toEqual(emptyDrawing());
    expect(request.complete('earlier PNG')).toBe(true);
    await expect(request.promise).resolves.toBe('earlier PNG');
  });
});
