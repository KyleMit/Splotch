import { describe, expect, it } from 'vitest';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import { adoptPaper } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { legacyDrawing } from './native-paper-fixtures.mjs';

function contactedDrawing(frame) {
  const initial = emptyDrawing(3, 'flower');
  const input = createContactCohort();
  const paper = adoptPaper(frame.width, frame.height, frame.pixelRatio);
  input.start('first', 'Red', 'crayon', { x: 200, y: 300 }, initial, 'extraThick', () => paper);
  input.start('second', 'Blue', 'pen', { x: 600, y: 300 }, initial, 'thin');
  expect(input.finish('first')).toBeNull();
  const history = addStrokes(createHistory(initial), input.finish('second'), input.paper());
  expect(history.drawing.paper).toBe(paper);
  expect(history.undo).toEqual([initial]);
  return history.drawing;
}

describe('physical paper drawing format', () => {
  it.each([
    { width: 342, height: 256.5, pixelRatio: 1 },
    { width: 760, height: 570, pixelRatio: 3 },
  ])('round-trips adopted v7 contact paper and exact widths at %j', async (frame) => {
    const drawing = contactedDrawing(frame);
    const before = JSON.stringify(drawing);
    const reopened = parseDrawing(JSON.parse(JSON.stringify(drawing)));
    expect(reopened).toEqual(drawing);
    expect(reopened.version).toBe(7);
    expect(reopened.paper).toEqual({
      kind: 'adopted',
      cssWidth: frame.width,
      cssHeight: frame.height,
      backingScale: Math.min(frame.pixelRatio, 2),
    });
    expect(reopened.strokes.map(({ width }) => width)).toEqual([22, 4]);
    expect(JSON.stringify(drawing)).toBe(before);
  });

  it.each(['unadopted-ink', 'foreign-paper-key'])(
    'rejects malformed current paper %s',
    async (fault) => {
      const drawing = contactedDrawing({ width: 342, height: 256.5, pixelRatio: 1 });
      const paper =
        fault === 'unadopted-ink' ? { kind: 'unadopted' } : { ...drawing.paper, extra: true };
      expect(() => parseDrawing({ ...drawing, paper })).toThrow();
    }
  );

  it('rejects a different paper adoption', () => {
    const drawing = contactedDrawing({ width: 342, height: 256.5, pixelRatio: 1 });
    expect(() =>
      addStrokes(createHistory(drawing), [drawing.strokes[0]], adoptPaper(760, 570, 1))
    ).toThrow();
  });

  it('reopens legacy v5 without adding paper or rewriting canonical width and seed', async () => {
    const drawing = {
      ...legacyDrawing(),
      strokes: [
        { brush: 'crayon', width: 34, color: 'Blue', seed: 17, points: [{ x: 200, y: 300 }] },
      ],
    };
    const before = JSON.stringify(drawing);
    expect(parseDrawing(JSON.parse(before))).toEqual(drawing);
    expect(JSON.stringify(drawing)).toBe(before);
    expect(Object.hasOwn(parseDrawing(drawing), 'paper')).toBe(false);
  });
});
