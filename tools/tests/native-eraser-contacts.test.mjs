import { legacyDrawing, LEGACY_PAPER } from './native-paper-fixtures.mjs';
import { describe, expect, it } from 'vitest';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import {
  addStrokes,
  createHistory,
  parseDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { MAX_CRAYON_SEED } from '../../experiments/native-architecture/src/drawing/brushes.ts';
import { planInk } from '../../experiments/native-architecture/src/drawing/checkpoints.ts';

const point = { x: 40, y: 60 };
const marker = { brush: 'marker', width: 22, color: 'Blue', points: [point] };

describe('joint contact cohort canonical ownership', () => {
  it.each(['pen', 'eraser', 'magic', 'crayon'])(
    'commits two %s contacts as one reversible legacy canonical group',
    (brush) => {
      const drawing = { ...legacyDrawing(3, 'flower'), strokes: [marker] };
      const input = createContactCohort();
      input.start('a', 'Yellow', brush, point, drawing);
      input.start('b', 'Yellow', brush, { x: 80, y: 90 }, drawing);
      expect(input.finish('a')).toBeNull();
      input.sample('b', { x: 90, y: 110 }, true);
      const strokes = input.finish('b');
      expect(strokes).toHaveLength(2);
      const history = addStrokes(createHistory(drawing), strokes);
      expect(history.undo).toEqual([drawing]);
      expect(history.drawing).toMatchObject({ version: 5, pageId: 'flower', rainbow: 3 });
      expect(parseDrawing(JSON.parse(JSON.stringify(history.drawing)))).toEqual(history.drawing);
      expect(undoDrawing(history).drawing).toBe(drawing);
    }
  );

  it('reserves distinct rich metadata across active and already-ended cohort contacts', () => {
    const drawing = {
      ...legacyDrawing(4, 'turtle'),
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
      ...legacyDrawing(5),
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
      width: 8,
      rainbow: 5,
      points: [point],
    });
    input.start('c', 'Red', 'eraser', point, drawing);
    expect(input.finish('c')[0]).toEqual({ brush: 'eraser', width: 16, points: [point] });
  });

  it('admits simultaneous contacts beyond the former picture limits', () => {
    const drawing = { ...legacyDrawing(), strokes: Array.from({ length: 999 }, () => marker) };
    const input = createContactCohort();
    input.start('a', 'Blue', 'pen', point, drawing);
    input.start('b', 'Blue', 'pen', point, drawing);
    expect(input.finish('a')).toBeNull();
    expect(input.finish('b')).toHaveLength(2);
    const full = createHistory({
      ...legacyDrawing(),
      strokes: [{ ...marker, points: Array.from({ length: 99999 }, () => point) }],
    });
    expect(addStrokes(full, [marker, marker]).drawing.strokes).toHaveLength(3);
    expect(full.undo).toEqual([]);
    expect(full.drawing.strokes[0].points).toHaveLength(99999);
  });

  it('keeps two-contact erase cohorts inside one bounded chronological mask stage', () => {
    const prefix = [marker];
    const input = createContactCohort();
    const drawing = { ...legacyDrawing(), strokes: prefix };
    input.start('a', 'Red', 'eraser', point, drawing);
    input.start('b', 'Yellow', 'eraser', { x: 80, y: 90 }, drawing);
    const erasers = input.interrupt();
    const strokes = [...prefix, ...erasers];
    const prepare = planInk(strokes, null);
    expect(prepare.prefix).toEqual(prefix);
    expect(prepare.needsCheckpoint).toBe(true);
    const checkpoint = {
      id: 1,
      strokes: prefix,
      paper: LEGACY_PAPER,
      base64: 'SDK fixture; no pixel claim',
    };
    const plan = planInk(strokes, checkpoint);
    expect(plan.strokes).toEqual(erasers);
    expect(plan.needsCheckpoint).toBe(false);
    expect(planInk([...strokes, marker, ...erasers], checkpoint).needsCheckpoint).toBe(true);
  });
});
