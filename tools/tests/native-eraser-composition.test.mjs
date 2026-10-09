import { describe, expect, it } from 'vitest';
import {
  addStroke,
  changePage,
  clearDrawing,
  createHistory,
  emptyDrawing,
  parseDrawing,
  strokeStyle,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  planInk,
  checkpointMatches,
} from '../../experiments/native-architecture/src/drawing/checkpoints.ts';

const marker = { brush: 'marker', color: 'Blue', points: [{ x: 40, y: 40 }] };
const erase = { brush: 'eraser', points: [{ x: 40, y: 40 }] };
const crayon = { brush: 'crayon', color: 'Yellow', seed: 4294967295, points: [{ x: 50, y: 50 }] };
const magic = { brush: 'magic', rainbow: 3, points: [{ x: 60, y: 60 }] };

describe('joint native drawing and eraser ownership', () => {
  it.each([
    [{ version: 1, strokes: [marker] }, 'blank', 0],
    [{ version: 2, pageId: 'flower', strokes: [marker] }, 'flower', 0],
    [{ version: 2, rainbow: 3, strokes: [crayon, magic] }, 'blank', 3],
    [
      { version: 3, pageId: 'turtle', rainbow: 3, strokes: [marker, crayon, magic, erase] },
      'turtle',
      3,
    ],
  ])('preserves all accepted saved variants %#', (input, pageId, rainbow) => {
    const drawing = parseDrawing(input);
    expect(drawing).toEqual({ version: 3, pageId, rainbow, strokes: input.strokes });
    expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
  });

  it.each([
    { version: 2, pageId: 'blank', rainbow: 0, strokes: [] },
    { version: 2, pageId: 'blank', strokes: [crayon] },
    { version: 2, rainbow: 0, strokes: [erase] },
    { version: 3, pageId: 'blank', rainbow: 3, strokes: [{ ...erase, color: 'Blue' }] },
    { version: 3, pageId: 'blank', rainbow: 3, strokes: [{ ...magic, seed: 7 }] },
    { version: 3, pageId: 'blank', rainbow: 0, strokes: [magic] },
  ])('rejects mixed or ignored saved metadata %#', (input) => {
    expect(() => parseDrawing(input)).toThrow();
  });

  it('retains rainbow across page changes and advances once per successful Clear', () => {
    const initial = createHistory({ ...emptyDrawing(3, 'flower'), strokes: [crayon, magic] });
    const changed = changePage(initial, 'turtle');
    expect(changed.drawing.rainbow).toBe(3);
    expect(strokeStyle('magic', 'Blue', changed.drawing)).toEqual({ brush: 'magic', rainbow: 3 });
    const blankClear = clearDrawing(changed, true);
    expect(blankClear.undo).toBe(changed.undo);
    expect(blankClear.drawing).toEqual(emptyDrawing(4, 'turtle'));
    expect(clearDrawing(blankClear, true).drawing.rainbow).toBe(5);
    const visibleClear = clearDrawing(initial, false);
    expect(undoDrawing(visibleClear).drawing).toBe(initial.drawing);
  });

  it('clears visually empty recorded operations without adding an undo state', () => {
    const history = addStroke(addStroke(createHistory(), marker), erase);
    const cleared = clearDrawing(history, true);
    expect(cleared.undo).toBe(history.undo);
    expect(cleared.drawing.strokes).toEqual([]);
    expect(cleared.drawing.rainbow).toBe(1);
  });

  it('plans all 1000 legal alternating operations with at most one erase run per stage', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      ...(index % 2 ? erase : marker),
      points: [{ x: index % 1024, y: 40 }],
    }));
    expect(parseDrawing({ ...emptyDrawing(), strokes }).strokes).toHaveLength(1000);
    expect(() => addStroke(createHistory({ ...emptyDrawing(), strokes }), marker)).toThrow('full');
    let checkpoint = null;
    let captures = 0;
    for (;;) {
      const plan = planInk(strokes, checkpoint, false);
      const eraseRuns = plan.strokes.filter(
        (stroke, index) => stroke.brush === 'eraser' && plan.strokes[index - 1]?.brush !== 'eraser'
      );
      expect(eraseRuns.length).toBeLessThanOrEqual(1);
      if (!plan.needsCheckpoint) break;
      expect(plan.prefix.length).toBeGreaterThan(checkpoint?.strokes.length ?? 0);
      checkpoint = {
        id: ++captures,
        strokes: plan.prefix,
        base64: 'planner fixture; not raster evidence',
      };
    }
    expect(captures).toBe(500);
  });

  it('captures the original painted prefix before a first eraser and selected eraser', () => {
    const prefix = [crayon, magic];
    const loaded = planInk([...prefix, erase], null, false);
    expect(loaded.prefix).toEqual(prefix);
    expect(loaded.strokes).toEqual(prefix);
    expect(loaded.needsCheckpoint).toBe(true);
    expect(planInk(prefix, null, true).needsCheckpoint).toBe(true);
    const checkpoint = { id: 1, strokes: prefix, base64: 'planner fixture' };
    const ready = planInk([...prefix, erase], checkpoint, false);
    expect(ready.strokes).toEqual([erase]);
    expect(ready.needsCheckpoint).toBe(false);
    expect(planInk([erase], null, false).needsCheckpoint).toBe(false);
  });

  it('prepares before a new eraser gesture and refuses a stale checkpoint after replacement', () => {
    const strokes = [marker, erase, { ...marker, color: 'Red' }];
    expect(planInk(strokes, null, false).prefix).toEqual([marker]);
    expect(planInk(strokes, null, false).needsCheckpoint).toBe(true);
    expect(planInk(strokes, null, true).needsCheckpoint).toBe(true);
    const checkpoint = { id: 1, strokes, base64: 'planner fixture; not raster evidence' };
    expect(checkpointMatches([...strokes, erase], checkpoint)).toBe(true);
    expect(checkpointMatches([marker], checkpoint)).toBe(false);
    expect(planInk([{ ...marker }], checkpoint, false).checkpoint).toBeNull();
  });
});
