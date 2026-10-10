import { describe, expect, it } from 'vitest';
import {
  BRUSHES,
  MAGIC_RAINBOW_COUNT,
  rainbowLine,
} from '../../experiments/native-architecture/src/drawing/brushes.ts';
import {
  CRAYON_BANDS,
  crayonPasses,
  waxAt,
} from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { createStrokeInput } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import {
  addStroke,
  clearDrawing,
  commitDrawing,
  createHistory,
  parseDrawing,
  strokeStyle,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

function stroke(history, brush, color, points) {
  const input = createStrokeInput();
  input.start('finger', strokeStyle(brush, color, history.drawing), points[0]);
  for (const point of points.slice(1)) input.sample('finger', point);
  return addStroke(history, input.finish('finger'));
}

function waxCoverage(seeds) {
  let wax = 0;
  const dimension = 256;
  for (let y = 0; y < dimension; y++) {
    for (let x = 0; x < dimension; x++) {
      wax += seeds.some((seed) => waxAt(x, y, seed, CRAYON_BANDS[1].coverage));
    }
  }
  return wax / dimension ** 2;
}

describe('native Crayon and Magic behavior', () => {
  it('contains real paper tooth and fills different pits during a repeated pass', () => {
    const first = waxCoverage([41]);
    const second = waxCoverage([41, 82]);
    expect(first).toBeGreaterThan(0.4);
    expect(first).toBeLessThan(0.75);
    expect(second).toBeGreaterThan(first + 0.1);
    expect(waxCoverage([41, 41])).toBe(first);
  });

  it('builds fresh wax during a backtrack while gentle corners and hand jitter retain one phase', () => {
    const style = { brush: 'crayon', color: 'Red', seed: 1 };
    const points = [
      { x: 50, y: 100 },
      { x: 150, y: 100 },
      { x: 250, y: 100 },
      { x: 150, y: 100 },
      { x: 50, y: 100 },
    ];
    const passes = crayonPasses({ ...style, points }, BRUSHES.crayon.width);
    expect(passes).toHaveLength(2);
    expect(passes[1].points[0]).toEqual(points[2]);
    expect(passes[1].seed).not.toBe(passes[0].seed);
    expect(waxCoverage(passes.map((pass) => pass.seed))).toBeGreaterThan(
      waxCoverage([passes[0].seed]) + 0.1
    );
    expect(
      crayonPasses(
        {
          ...style,
          points: [
            { x: 10, y: 20 },
            { x: 11, y: 20 },
            { x: 10, y: 20 },
            { x: 11, y: 21 },
          ],
        },
        BRUSHES.crayon.width
      )
    ).toHaveLength(1);
    expect(
      crayonPasses(
        {
          ...style,
          points: [
            { x: 50, y: 100 },
            { x: 150, y: 100 },
            { x: 250, y: 120 },
            { x: 350, y: 170 },
          ],
        },
        BRUSHES.crayon.width
      )
    ).toHaveLength(1);
  });

  it('opens a fresh deposition phase when a loop re-enters older wax', () => {
    const points = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 100 },
    ];
    const passes = crayonPasses(
      { brush: 'crayon', color: 'Purple', seed: 2, points },
      BRUSHES.crayon.width
    );
    expect(passes).toHaveLength(2);
    expect(passes[1].points).toEqual(points.slice(-2));
  });

  it('retains every brush in drawing order through serialization, clear, open, and undo', () => {
    let history = createHistory();
    for (const brush of ['pencil', 'crayon', 'magic', 'marker', 'crayon']) {
      history = stroke(history, brush, brush === 'marker' ? 'Blue' : 'Red', [
        { x: 100, y: 100 },
        { x: 250, y: 100 },
      ]);
    }
    const snapshot = JSON.stringify(history.drawing);
    const reopened = parseDrawing(JSON.parse(snapshot));
    expect(reopened).toEqual(history.drawing);
    expect(reopened.strokes.map((item) => item.brush)).toEqual([
      'pencil',
      'crayon',
      'magic',
      'marker',
      'crayon',
    ]);
    expect(
      reopened.strokes.filter((item) => item.brush === 'crayon').map((item) => item.seed)
    ).toEqual([1, 2]);
    const cleared = clearDrawing(history);
    expect(cleared.drawing.strokes).toEqual([]);
    expect(cleared.drawing.rainbow).toBe((history.drawing.rainbow + 1) % MAGIC_RAINBOW_COUNT);
    expect(undoDrawing(cleared).drawing).toEqual(reopened);
    expect(undoDrawing(commitDrawing(cleared, reopened)).drawing).toEqual(cleared.drawing);
    expect(JSON.stringify(history.drawing)).toBe(snapshot);
  });

  it('holds one paper-anchored rainbow across palette changes and switches between brushes', () => {
    let history = stroke(createHistory(), 'magic', 'Red', [{ x: 100, y: 100 }]);
    history = stroke(history, 'marker', 'Green', [{ x: 500, y: 200 }]);
    history = stroke(history, 'magic', 'Blue', [{ x: 800, y: 100 }]);
    expect(history.drawing.strokes[0]).toEqual({
      brush: 'magic',
      rainbow: 0,
      points: [{ x: 100, y: 100 }],
    });
    expect(history.drawing.strokes[2]).toEqual({
      brush: 'magic',
      rainbow: 0,
      points: [{ x: 800, y: 100 }],
    });
    expect(strokeStyle('magic', 'Yellow', undoDrawing(history).drawing).rainbow).toBe(0);
    const restored = parseDrawing(JSON.parse(JSON.stringify(history.drawing)));
    expect(rainbowLine(restored.rainbow, 1024, 768)).toEqual(rainbowLine(0, 1024, 768));
    expect(rainbowLine(clearDrawing(history).drawing.rainbow, 1024, 768)).not.toEqual(
      rainbowLine(0, 1024, 768)
    );
  });

  it('keeps the original Pencil and Marker save format readable', () => {
    const saved = {
      version: 1,
      strokes: [
        { brush: 'pencil', color: 'Purple', points: [{ x: 40, y: 50 }] },
        { brush: 'marker', color: 'Blue', points: [{ x: 70, y: 80 }] },
      ],
    };
    expect(parseDrawing(saved)).toEqual({ version: 2, rainbow: 0, strokes: saved.strokes });
  });

  it.each([
    { brush: 'crayon', color: 'Blue', seed: 0 },
    { brush: 'crayon', color: 'Blue', seed: -1 },
    { brush: 'crayon', color: 'Blue', seed: 0.5 },
    { brush: 'crayon', color: 'Blue', seed: Number.MAX_SAFE_INTEGER + 1 },
    { brush: 'crayon', color: 'Foreign', seed: 1 },
    { brush: 'magic', rainbow: 1 },
    { brush: 'magic', rainbow: null },
    { brush: 'magic', rainbow: 0.5 },
  ])('rejects corrupt brush metadata before replacing live ink %#', (style) => {
    const history = stroke(createHistory(), 'marker', 'Red', [{ x: 100, y: 100 }]);
    expect(() =>
      parseDrawing({
        version: 2,
        rainbow: 0,
        strokes: [{ ...style, points: [{ x: 100, y: 100 }] }],
      })
    ).toThrow('invalid brush');
    expect(history.drawing.strokes[0].brush).toBe('marker');
  });
});
