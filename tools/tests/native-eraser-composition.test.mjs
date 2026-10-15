import { legacyDrawing, LEGACY_PAPER } from './native-paper-fixtures.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  needsPreparation,
} from '../../experiments/native-architecture/src/drawing/checkpoints.ts';

import { checkpointFixtures } from '../migration/probes/native-eraser/checkpoint-fixtures.mjs';

const marker = { brush: 'marker', color: 'Blue', points: [{ x: 40, y: 40 }] };
const erase = { brush: 'eraser', points: [{ x: 40, y: 40 }] };
const crayon = { brush: 'crayon', color: 'Yellow', seed: 4294967295, points: [{ x: 50, y: 50 }] };
const magic = { brush: 'magic', rainbow: 3, points: [{ x: 60, y: 60 }] };

afterEach(() => vi.restoreAllMocks());

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
    expect(drawing).toEqual({
      version: 5,
      pageId,
      rainbow,
      strokes: input.strokes.map((stroke) => ({
        ...stroke,
        width: { marker: 22, eraser: 44, crayon: 34, magic: 30 }[stroke.brush],
      })),
    });
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

  it('retains rainbow across page changes and randomly repicks on each successful Clear', () => {
    const random = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.91)
      .mockReturnValueOnce(0.11)
      .mockReturnValueOnce(0.31);
    const initial = createHistory({ ...legacyDrawing(3, 'flower'), strokes: [crayon, magic] });
    const changed = changePage(initial, 'turtle');
    expect(changed.drawing.rainbow).toBe(3);
    expect(strokeStyle('magic', 'Blue', changed.drawing)).toEqual({
      brush: 'magic',
      width: 8,
      rainbow: 3,
    });
    const blankClear = clearDrawing(changed, true);
    expect(blankClear.undo).toBe(changed.undo);
    expect(blankClear.drawing).toEqual(emptyDrawing(9, 'turtle'));
    expect(clearDrawing(blankClear, true).drawing.rainbow).toBe(1);
    const visibleClear = clearDrawing(initial, false);
    expect(undoDrawing(visibleClear).drawing).toBe(initial.drawing);
    expect(random).toHaveBeenCalledTimes(3);
  });

  it('clears visually empty recorded operations without adding an undo state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.71);
    const history = addStroke(addStroke(createHistory(legacyDrawing()), marker), erase);
    const cleared = clearDrawing(history, true);
    expect(cleared.undo).toBe(history.undo);
    expect(cleared.drawing.strokes).toEqual([]);
    expect(cleared.drawing.rainbow).toBe(7);
  });

  it('accepts more than 1000 alternating operations and plans at most one erase run per stage', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      ...(index % 2 ? { ...erase, width: 44 } : { ...marker, width: 22 }),
      points: [{ x: index % 1024, y: 40 }],
    }));
    expect(parseDrawing({ ...legacyDrawing(), strokes }).strokes).toHaveLength(1000);
    expect(
      addStroke(createHistory({ ...legacyDrawing(), strokes }), marker).drawing.strokes
    ).toHaveLength(1001);
    let checkpoint = null;
    let captures = 0;
    for (;;) {
      const plan = planInk(strokes, checkpoint);
      const eraseRuns = plan.strokes.filter(
        (stroke, index) => stroke.brush === 'eraser' && plan.strokes[index - 1]?.brush !== 'eraser'
      );
      expect(eraseRuns.length).toBeLessThanOrEqual(1);
      if (!plan.needsCheckpoint) break;
      expect(plan.prefix.length).toBeGreaterThan(checkpoint?.strokes.length ?? 0);
      checkpoint = {
        id: ++captures,
        strokes: plan.prefix,
        paper: LEGACY_PAPER,
        base64: 'planner fixture; not raster evidence',
      };
    }
    expect(captures).toBe(500);
  });

  it('captures the original painted prefix before a first eraser and selected eraser', () => {
    const prefix = [crayon, magic];
    const loaded = planInk([...prefix, erase], null);
    expect(loaded.prefix).toEqual(prefix);
    expect(loaded.strokes).toEqual(prefix);
    expect(loaded.needsCheckpoint).toBe(true);
    expect(planInk(prefix, null).needsCheckpoint).toBe(false);
    expect(needsPreparation(prefix, 'eraser')).toBe(true);
    const checkpoint = { id: 1, strokes: prefix, paper: LEGACY_PAPER, base64: 'planner fixture' };
    const ready = planInk([...prefix, erase], checkpoint);
    expect(ready.strokes).toEqual([erase]);
    expect(ready.needsCheckpoint).toBe(false);
    expect(planInk([erase], null).needsCheckpoint).toBe(false);
  });

  it('prepares before a new eraser gesture and refuses a stale checkpoint after replacement', () => {
    const strokes = [marker, erase, { ...marker, color: 'Red' }];
    expect(planInk(strokes, null).prefix).toEqual([marker]);
    expect(planInk(strokes, null).needsCheckpoint).toBe(true);
    expect(planInk(strokes, null).needsCheckpoint).toBe(true);
    const checkpoint = {
      id: 1,
      strokes,
      paper: LEGACY_PAPER,
      base64: 'planner fixture; not raster evidence',
    };
    expect(checkpointMatches([...strokes, erase], checkpoint)).toBe(true);
    expect(checkpointMatches([marker], checkpoint)).toBe(false);
    expect(planInk([{ ...marker }], checkpoint).checkpoint).toBeNull();
  });
});

const { causal, ...browserFixtures } = checkpointFixtures();
describe('actual browser checkpoint fixture hash contract', () => {
  it.each([
    ...Object.entries(browserFixtures),
    ...causal.map(({ name, drawing }) => [name, drawing]),
  ])(
    'normalizes only the version of consumed v4 fixture %s and preserves stroke JSON bytes',
    (_name, fixture) => {
      const stored = JSON.parse(JSON.stringify(fixture));
      const parsed = parseDrawing(stored);
      expect(parsed).toEqual({ ...fixture, version: 5 });
      expect(JSON.stringify(parsed.strokes)).toBe(JSON.stringify(fixture.strokes));
      expect(parseDrawing(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    }
  );
});
