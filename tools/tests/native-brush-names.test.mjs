import { legacyDrawing, adoptedDrawing } from './native-paper-fixtures.mjs';
import { describe, expect, it } from 'vitest';
import {
  BRUSHES,
  BRUSH_ORDER,
  DEFAULT_BRUSH,
} from '../../experiments/native-architecture/src/drawing/brushes.ts';
import {
  emptyDrawing,
  parseDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const point = { x: 512, y: 384 };

describe('canonical candidate brush vocabulary', () => {
  it('offers the original four tools in order with Pen as the initial ink brush', () => {
    expect(BRUSH_ORDER).toEqual(['pen', 'crayon', 'magic', 'eraser']);
    expect(BRUSH_ORDER.map((brush) => BRUSHES[brush].label)).toEqual([
      'Pen',
      'Crayon',
      'Magic Brush',
      'Eraser',
    ]);
    expect(DEFAULT_BRUSH).toBe('pen');
    expect(Object.keys(BRUSHES)).toEqual(BRUSH_ORDER);
  });

  it('creates solid Pen ink while keeping Crayon on its seeded texture branch', () => {
    expect(strokeStyle('pen', 'Red', emptyDrawing())).toEqual({
      brush: 'pen',
      width: BRUSHES.pen.width,
      color: 'Red',
    });
    expect(strokeStyle('crayon', 'Red', emptyDrawing())).toEqual({
      brush: 'crayon',
      width: BRUSHES.crayon.width,
      color: 'Red',
      seed: 1,
    });
  });

  it.each([
    ['pencil', 3.5],
    ['pencil', 7],
    ['pencil', 14],
    ['marker', 11],
    ['marker', 22],
    ['marker', 44],
  ])(
    'preserves stored legacy %s geometry at width %s without turning it into wax',
    (brush, width) => {
      const drawing = {
        ...legacyDrawing(),
        strokes: [{ brush, width, color: 'Blue', points: [point] }],
      };
      const before = JSON.stringify(drawing);
      const opened = parseDrawing(JSON.parse(before));
      expect(opened).toEqual(drawing);
      expect(JSON.stringify(drawing)).toBe(before);
      expect(opened.strokes[0].brush).toBe(brush);
      expect(Object.hasOwn(opened.strokes[0], 'seed')).toBe(false);
      expect(BRUSH_ORDER).not.toContain(brush);
    }
  );

  it('round trips a newly selected Pen through the actual saved-drawing parser', () => {
    const drawing = {
      ...adoptedDrawing({ width: 342, height: 256.5, pixelRatio: 1 }),
      strokes: [{ ...strokeStyle('pen', 'Blue', emptyDrawing()), points: [point] }],
    };
    expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
  });

  it.each(['Pencil', 'Marker', 'foreign', 'Pen'])(
    'rejects an unsupported persisted tool spelling %s',
    (brush) => {
      expect(() =>
        parseDrawing({
          ...adoptedDrawing({ width: 342, height: 256.5, pixelRatio: 1 }),
          strokes: [{ brush, width: 22, color: 'Blue', points: [point] }],
        })
      ).toThrow('brush');
    }
  );
});
