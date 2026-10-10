import { describe, expect, it } from 'vitest';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import {
  addStrokes,
  createHistory,
  drawingCapacity,
  emptyDrawing,
  parseDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { MAX_CRAYON_SEED } from '../../experiments/native-architecture/src/drawing/brushes.ts';
import { planInk } from '../../experiments/native-architecture/src/drawing/checkpoints.ts';

const point = { x: 40, y: 60 };
const marker = { brush: 'marker', width: 22, color: 'Blue', points: [point] };

describe('joint contact cohort canonical ownership', () => {
  it.each(['marker', 'eraser', 'magic', 'crayon'])(
    'commits two %s contacts as one reversible v4 group',
    (brush) => {
      const drawing = { ...emptyDrawing(3, 'flower'), strokes: [marker] };
      const input = createContactCohort();
      input.start('a', 'Yellow', brush, point, drawing);
      input.start('b', 'Yellow', brush, { x: 80, y: 90 }, drawing);
      expect(input.finish('a')).toBeNull();
      input.sample('b', { x: 90, y: 110 }, true);
      const strokes = input.finish('b');
      expect(strokes).toHaveLength(2);
      const history = addStrokes(createHistory(drawing), strokes);
      expect(history.undo).toEqual([drawing]);
      expect(history.drawing).toMatchObject({ version: 4, pageId: 'flower', rainbow: 3 });
      expect(parseDrawing(JSON.parse(JSON.stringify(history.drawing)))).toEqual(history.drawing);
      expect(undoDrawing(history).drawing).toBe(drawing);
    }
  );

  it('reserves distinct rich metadata across active and already-ended cohort contacts', () => {
    const drawing = {
      ...emptyDrawing(4, 'turtle'),
      strokes: [{ brush: 'crayon', width: 34, color: 'Blue', seed: 17, points: [point] }],
    };
    const input = createContactCohort();
    input.start('a', 'Yellow', 'crayon', point, drawing);
    input.start('b', 'Yellow', 'crayon', point, drawing);
    input.finish('a');
    input.start('c', 'Purple', 'crayon', point, drawing);
    expect(input.drafts().map(({ seed }) => seed)).toEqual([18, 19, 20]);
    expect(input.finish('b')).toBeNull();
    expect(input.finish('c').map(({ seed }) => seed)).toEqual([18, 19, 20]);
  });

  it('uses the style owner seed wrap without adding color to Magic or eraser records', () => {
    const drawing = {
      ...emptyDrawing(5),
      strokes: [
        { brush: 'crayon', width: 34, color: 'Blue', seed: MAX_CRAYON_SEED - 1, points: [point] },
      ],
    };
    const input = createContactCohort();
    input.start('a', 'Red', 'crayon', point, drawing);
    input.start('a2', 'Red', 'crayon', point, drawing);
    input.start('a3', 'Red', 'crayon', point, drawing);
    expect(input.interrupt().map(({ seed }) => seed)).toEqual([MAX_CRAYON_SEED, 1, 2]);
    input.start('b', 'Red', 'magic', point, drawing);
    expect(input.finish('b')[0]).toEqual({
      brush: 'magic',
      width: 30,
      rainbow: 5,
      points: [point],
    });
    input.start('c', 'Red', 'eraser', point, drawing);
    expect(input.finish('c')[0]).toEqual({ brush: 'eraser', width: 44, points: [point] });
  });

  it('reserves the remaining legal stroke and point capacity before admitting another contact', () => {
    const drawing = { ...emptyDrawing(), strokes: Array.from({ length: 999 }, () => marker) };
    expect(drawingCapacity(drawing).strokes).toBe(1);
    const input = createContactCohort();
    input.start('a', 'Blue', 'marker', point, drawing);
    expect(() => input.start('b', 'Blue', 'marker', point, drawing)).toThrow('full');
    expect(input.finish('a')).toHaveLength(1);
    const full = createHistory({
      ...emptyDrawing(),
      strokes: [{ ...marker, points: Array.from({ length: 99999 }, () => point) }],
    });
    expect(() => addStrokes(full, [marker, marker])).toThrow('full');
    expect(full.undo).toEqual([]);
    expect(full.drawing.strokes[0].points).toHaveLength(99999);
  });

  it('keeps two-contact erase cohorts inside one bounded chronological mask stage', () => {
    const prefix = [marker];
    const input = createContactCohort();
    const drawing = { ...emptyDrawing(), strokes: prefix };
    input.start('a', 'Red', 'eraser', point, drawing);
    input.start('b', 'Yellow', 'eraser', { x: 80, y: 90 }, drawing);
    const erasers = input.interrupt();
    const strokes = [...prefix, ...erasers];
    const prepare = planInk(strokes, null, false);
    expect(prepare.prefix).toEqual(prefix);
    expect(prepare.needsCheckpoint).toBe(true);
    const checkpoint = { id: 1, strokes: prefix, base64: 'SDK fixture; no pixel claim' };
    const plan = planInk(strokes, checkpoint, false);
    expect(plan.strokes).toEqual(erasers);
    expect(plan.needsCheckpoint).toBe(false);
    expect(planInk([...strokes, marker, ...erasers], checkpoint, false).needsCheckpoint).toBe(true);
  });
});
