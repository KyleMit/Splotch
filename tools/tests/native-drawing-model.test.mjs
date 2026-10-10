import { describe, expect, it } from 'vitest';
import {
  addStroke,
  addStrokes,
  drawingCapacity,
  MAX_POINTS,
  emptyDrawing,
  appendPoint,
  clearDrawing,
  commitDrawing,
  createHistory,
  parseDrawing,
  paperPoint,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const firstStroke = {
  color: 'Purple',
  brush: 'marker',
  points: [
    { x: 10, y: 20 },
    { x: 80, y: 90 },
  ],
};

describe('native development drawing model', () => {
  it('commits the final sample even when it falls below the move threshold', () => {
    const points = [{ x: 10, y: 20 }];
    const final = { x: 10.25, y: 20.25 };
    expect(appendPoint(points, final)).toBe(points);
    expect(appendPoint(points, final, true)).toEqual([...points, final]);
  });

  it('undoes clear and reopening without mutating an earlier save snapshot', () => {
    const original = addStroke(createHistory(), { ...firstStroke, width: 22 });
    const snapshot = JSON.stringify(original.drawing);
    const cleared = clearDrawing(original, false);
    expect(cleared.drawing.strokes).toEqual([]);
    expect(undoDrawing(cleared).drawing).toEqual(original.drawing);
    const opened = commitDrawing(cleared, parseDrawing(JSON.parse(snapshot)));
    expect(undoDrawing(opened).drawing.strokes).toEqual([]);
    expect(JSON.stringify(original.drawing)).toBe(snapshot);
  });

  it('adds an entire contact cohort atomically and keeps clear as a separate Undo step', () => {
    const history = createHistory();
    const first = { ...firstStroke, width: 22 };
    const secondStroke = { ...firstStroke, color: 'Blue', brush: 'pencil', width: 7 };
    const committed = addStrokes(history, [first, secondStroke]);
    expect(committed.drawing.strokes).toEqual([first, secondStroke]);
    expect(committed.undo).toEqual([history.drawing]);
    const cleared = clearDrawing(committed, false);
    expect(cleared.undo).toHaveLength(2);
    expect(undoDrawing(cleared).drawing).toEqual(committed.drawing);
    expect(undoDrawing(undoDrawing(cleared)).drawing).toEqual(history.drawing);
    expect(clearDrawing(history, true).undo).toEqual([]);
    expect(clearDrawing(history, true).drawing.rainbow).toBe(1);
    expect(addStrokes(history, [])).toBe(history);
  });

  it('refuses an oversized cohort without partially committing or mutating history', () => {
    const existing = {
      ...firstStroke,
      width: 22,
      points: Array.from({ length: MAX_POINTS - 1 }, () => ({ x: 10, y: 20 })),
    };
    const history = createHistory({ ...emptyDrawing(), strokes: [existing] });
    expect(drawingCapacity(history.drawing).points).toBe(1);
    expect(() => addStrokes(history, [{ ...firstStroke, width: 22 }])).toThrow('picture is full');
    expect(history.drawing.strokes).toEqual([existing]);
    expect(history.undo).toEqual([]);
  });

  it('maps resized paper to the same bounded logical coordinates', () => {
    expect(paperPoint(200, 150, 400, 300)).toEqual({ x: 512, y: 384 });
    expect(paperPoint(400, 300, 800, 600)).toEqual({ x: 512, y: 384 });
    expect(paperPoint(-10, 1000, 400, 300)).toEqual({ x: 0, y: 768 });
  });

  it.each([
    { version: 2, strokes: [] },
    { version: 1, strokes: [{ ...firstStroke, color: 'Foreign' }] },
    { version: 1, strokes: [{ ...firstStroke, brush: 'foreign' }] },
    { version: 1, strokes: [{ ...firstStroke, points: [{ x: NaN, y: 0 }] }] },
    { version: 1, strokes: [{ ...firstStroke, points: [{ x: 1025, y: 0 }] }] },
    { version: 1, strokes: [{ ...firstStroke, points: [] }] },
  ])('refuses unsupported saved drawing data %#', (input) => {
    expect(() => parseDrawing(input)).toThrow();
  });

  it('copies accepted storage input so later mutations cannot change the live picture', () => {
    const input = { version: 1, strokes: [{ ...firstStroke, points: [{ x: 10, y: 20 }] }] };
    const drawing = parseDrawing(input);
    input.strokes[0].points[0].x = 100;
    expect(drawing.strokes[0].points[0].x).toBe(10);
  });
});
