import { legacyDrawing } from './native-paper-fixtures.mjs';
import { describe, expect, it } from 'vitest';
import { MAX_UNDO_DEPTH } from '../../web/src/lib/drawing/undoHistory.ts';
import {
  addStroke,
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
  it('keeps drawing beyond the former stroke and point caps', () => {
    const stroke = { ...firstStroke, width: 22 };
    const manyStrokes = { ...legacyDrawing(), strokes: Array.from({ length: 1000 }, () => stroke) };
    const added = addStroke(createHistory(manyStrokes), stroke);
    expect(added.drawing.strokes).toHaveLength(1001);
    const points = Array.from({ length: 100_001 }, () => ({ x: 10, y: 20 }));
    const long = addStroke(createHistory(legacyDrawing()), { ...stroke, points });
    expect(parseDrawing(long.drawing).strokes[0].points).toHaveLength(points.length);
  });

  it('keeps shipping undo depth even when retained pictures contain many points', () => {
    const points = Array.from({ length: 100_001 }, () => ({ x: 10, y: 20 }));
    let history = createHistory(legacyDrawing());
    for (let count = 0; count <= MAX_UNDO_DEPTH; count += 1) {
      history = commitDrawing(history, {
        ...legacyDrawing(),
        strokes: [{ ...firstStroke, width: 22, points }],
      });
    }
    expect(history.undo).toHaveLength(MAX_UNDO_DEPTH);
  });

  it('commits the final sample even when it falls below the move threshold', () => {
    const points = [{ x: 10, y: 20 }];
    const final = { x: 10.25, y: 20.25 };
    expect(appendPoint(points, final)).toBe(points);
    expect(appendPoint(points, final, true)).toEqual([...points, final]);
  });

  it('undoes clear and reopening without mutating an earlier save snapshot', () => {
    const original = addStroke(createHistory(legacyDrawing()), { ...firstStroke, width: 22 });
    const snapshot = JSON.stringify(original.drawing);
    const cleared = clearDrawing(original, false);
    expect(cleared.drawing.strokes).toEqual([]);
    expect(undoDrawing(cleared).drawing).toEqual(original.drawing);
    const opened = commitDrawing(cleared, parseDrawing(JSON.parse(snapshot)));
    expect(undoDrawing(opened).drawing.strokes).toEqual([]);
    expect(JSON.stringify(original.drawing)).toBe(snapshot);
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
