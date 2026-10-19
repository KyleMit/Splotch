import { canonicalPaper, legacyDrawing } from './native-paper-fixtures.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_UNDO_DEPTH } from '../../web/src/lib/drawing/undoHistory.ts';
import { createDrawingSession } from '../../experiments/native-architecture/src/product/createDrawingSession.ts';
import {
  createRainbowGradient,
  MAGIC_GRADIENT_COUNT,
} from '../../web/src/lib/drawing/magicSheetGradient.ts';
import {
  addStroke,
  addStrokes,
  appendPoint,
  clearDrawing,
  commitDrawing,
  createHistory,
  extendsStrokes,
  strokeStyle,
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

afterEach(() => vi.restoreAllMocks());

describe('native development drawing model', () => {
  it('holds a lazy pool of shipping-generated random rainbows through repeated rendering', async () => {
    const values = [0.05, 0.95, 0.25, 0.75, 0.45, 0.55, 0.15, 0.85, 0.35, 0.65, 0.1];
    const sequence = () => {
      let index = 0;
      return () => values[index++ % values.length];
    };
    const random = vi.spyOn(Math, 'random').mockImplementation(sequence());
    vi.resetModules();
    const { rainbow, MAGIC_RAINBOW_COUNT } =
      await import('../../experiments/native-architecture/src/drawing/brushes.ts');
    expect(random).not.toHaveBeenCalled();
    expect(MAGIC_RAINBOW_COUNT).toBe(MAGIC_GRADIENT_COUNT);
    const shippingRandom = vi.fn(sequence());
    const expected = Array.from({ length: MAGIC_GRADIENT_COUNT }, () =>
      createRainbowGradient(shippingRandom)
    );
    const pool = expected.map((_, index) => rainbow(index));
    expect(pool).toEqual(expected);
    expect(new Set(pool.map((gradient) => JSON.stringify(gradient))).size).toBeGreaterThan(1);
    const generated = random.mock.calls.length;
    expect(generated).toBe(shippingRandom.mock.calls.length);
    for (const [index, gradient] of pool.entries()) expect(rainbow(index)).toBe(gradient);
    expect(random).toHaveBeenCalledTimes(generated);
  });

  it('randomly chooses and holds a rainbow while Clear and Undo preserve the replacement for new ink', () => {
    const firstRandom = 0.71;
    const clearRandom = 0.24;
    const random = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(firstRandom)
      .mockReturnValueOnce(clearRandom);
    const first = createDrawingSession().getSnapshot();
    const chosen = Math.floor(firstRandom * MAGIC_GRADIENT_COUNT);
    expect(first.drawing.rainbow).toBe(chosen);
    const magic = strokeStyle('magic', 'Purple', first.drawing);
    expect(magic.rainbow).toBe(chosen);
    strokeStyle('pen', 'Blue', first.drawing);
    expect(strokeStyle('magic', 'Blue', first.drawing)).toEqual(magic);
    expect(random).toHaveBeenCalledOnce();
    const inked = addStroke(first, { ...magic, points: [{ x: 10, y: 20 }] }, canonicalPaper());
    const cleared = clearDrawing(inked, false);
    expect(cleared.drawing.rainbow).toBe(Math.floor(clearRandom * MAGIC_GRADIENT_COUNT));
    expect(random).toHaveBeenCalledTimes(2);
    const restored = undoDrawing(cleared);
    expect(restored.drawing.strokes).toBe(inked.drawing.strokes);
    expect(restored.drawing.strokes[0].rainbow).toBe(chosen);
    expect(restored.drawing.rainbow).toBe(cleared.drawing.rainbow);
    expect(strokeStyle('magic', 'Blue', restored.drawing).rainbow).toBe(cleared.drawing.rainbow);
  });

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

  // A layer holding `base` learns of an append from the model, not by reading every stroke: the
  // read counter is the evidence, and the fallback keeps every other list exact.
  describe('extendsStrokes', () => {
    const stroke = (x) => ({ ...firstStroke, brush: 'pen', width: 22, points: [{ x, y: 20 }] });
    function counted(strokes) {
      const reads = { count: 0 };
      const list = new Proxy(strokes, {
        get(target, name, receiver) {
          if (typeof name === 'string' && /^\d+$/.test(name)) reads.count += 1;
          return Reflect.get(target, name, receiver);
        },
      });
      return { list, reads };
    }
    function historyOf(strokes) {
      return createHistory({ ...legacyDrawing(), strokes });
    }

    // Negative control: without the model's append record every check reads the whole base list.
    it('recognizes an addStrokes append without reading the strokes it extends', () => {
      const { list, reads } = counted([stroke(1), stroke(2), stroke(3)]);
      const next = addStrokes(historyOf(list), [stroke(4), stroke(5)]).drawing.strokes;
      reads.count = 0;
      expect(extendsStrokes(list, next)).toBe(true);
      expect(reads.count).toBe(0);
      expect(extendsStrokes(list, list)).toBe(true);
      expect(reads.count).toBe(0);
    });

    it('answers exactly for lists the model did not append in one step', () => {
      const base = [stroke(1), stroke(2)];
      const once = addStroke(historyOf(base), stroke(3));
      const twice = addStroke(once, stroke(4));
      expect(extendsStrokes(base, twice.drawing.strokes)).toBe(true);
      const branched = addStroke(undoDrawing(once), stroke(5)).drawing.strokes;
      expect(extendsStrokes(once.drawing.strokes, branched)).toBe(false);
      expect(extendsStrokes(base, branched)).toBe(true);
      expect(extendsStrokes(once.drawing.strokes, base)).toBe(false);
      expect(extendsStrokes(base, [stroke(1), stroke(2)])).toBe(false);
      expect(extendsStrokes(base, [...base])).toBe(true);
    });

    // Negative control: keeping the earlier list's own record lets the newest list reach every
    // ancestor, and this check then skips its read.
    it('keeps no record for a list once it has been appended to', () => {
      const { list, reads } = counted([stroke(1)]);
      const once = addStroke(historyOf(list), stroke(2));
      addStroke(once, stroke(3));
      reads.count = 0;
      expect(extendsStrokes(list, once.drawing.strokes)).toBe(true);
      expect(reads.count).toBeGreaterThan(0);
    });
  });

  it('undoes clear and reopening without mutating an earlier save snapshot', () => {
    const original = addStroke(createHistory(legacyDrawing()), { ...firstStroke, width: 22 });
    const snapshot = JSON.stringify(original.drawing);
    const cleared = clearDrawing(original, false);
    expect(cleared.drawing.strokes).toEqual([]);
    expect(undoDrawing(cleared).drawing).toEqual({
      ...original.drawing,
      rainbow: cleared.drawing.rainbow,
    });
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
