import { describe, expect, it } from 'vitest';
import {
  checkpointMatches,
  needsPreparation,
  planInk,
  preparationMatches,
  preparationWitnessed,
} from '../../experiments/native-architecture/src/drawing/checkpoints.ts';

function fixture() {
  const marker = { brush: 'marker', width: 22, color: 'Purple', points: [{ x: 200, y: 120 }] };
  const crayon = {
    brush: 'crayon',
    width: 34,
    color: 'Yellow',
    seed: 20,
    points: [{ x: 500, y: 550 }],
  };
  const erase = { brush: 'eraser', width: 44, points: [{ x: 500, y: 550 }] };
  return { marker, crayon, erase };
}

describe('canonical boundaries and provisional selection ownership', () => {
  it('captures Marker before a Crayon run and preserves adjacent Crayon strokes as one run', () => {
    const { marker, crayon } = fixture();
    const second = { ...crayon, seed: 21 };
    const strokes = [marker, crayon, second];
    const first = planInk(strokes, null);
    expect(first.prefix).toEqual([marker]);
    expect(first.needsCheckpoint).toBe(true);
    const checkpoint = { id: 1, strokes: first.prefix, base64: 'model-only fixture' };
    const ready = planInk(strokes, checkpoint);
    expect(ready.strokes).toEqual([crayon, second]);
    expect(ready.needsCheckpoint).toBe(false);
  });

  it('rejects an identity-matching cache inside a contiguous Crayon run and after witness-removing Undo', () => {
    const { marker, crayon } = fixture();
    const second = { ...crayon, seed: 21 };
    const cache = { id: 1, strokes: [marker, crayon], base64: 'noncanonical fixture' };
    expect(checkpointMatches([marker, crayon, second], cache)).toBe(false);
    expect(planInk([marker, crayon, second], cache).checkpoint).toBeNull();
    const valid = { ...cache, strokes: [marker] };
    expect(checkpointMatches([marker, crayon], valid)).toBe(true);
    expect(checkpointMatches([marker], valid)).toBe(false);
  });

  it('requires the exact canonical predecessor as well as actual next-boundary witness', () => {
    const { marker, crayon, erase } = fixture();
    const predecessor = { id: 1, strokes: [marker], base64: 'canonical predecessor' };
    const preparation = {
      checkpoint: { id: 2, strokes: [marker, crayon], base64: 'prepared' },
      predecessor,
      brush: 'eraser',
    };
    expect(preparationMatches([marker, crayon], preparation, predecessor)).toBe(true);
    expect(preparationWitnessed([marker, crayon], preparation, predecessor)).toBe(false);
    expect(preparationWitnessed([marker, crayon, erase], preparation, predecessor)).toBe(true);
    expect(preparationWitnessed([marker, crayon, erase], preparation, { ...predecessor })).toBe(
      false
    );
    expect(
      preparationWitnessed([marker, crayon, { ...crayon, seed: 21 }], preparation, predecessor)
    ).toBe(false);
  });

  it('makes selection-only excursions irrelevant to the committed replay route', () => {
    const { marker, crayon, erase } = fixture();
    expect(needsPreparation([crayon], 'eraser')).toBe(true);
    const speculative = { id: 1, strokes: [crayon], base64: 'unused eraser selection' };
    expect(planInk([crayon, { ...crayon, seed: 21 }], speculative).checkpoint).toBeNull();
    const unusedCrayon = { id: 2, strokes: [marker], base64: 'unused crayon selection' };
    const secondMarker = { ...marker, color: 'Blue' };
    const replay = planInk([marker, secondMarker, crayon, erase], unusedCrayon);
    expect(replay.checkpoint).toBeNull();
    expect(replay.prefix).toEqual([marker, secondMarker]);
  });

  it('advances through every Crayon and eraser boundary without skipping or empty captures', () => {
    const { marker, crayon, erase } = fixture();
    const strokes = [marker, crayon, erase, marker, erase, crayon];
    let cached = null;
    const captured = [];
    for (let index = 0; index < strokes.length; index += 1) {
      const plan = planInk(strokes, cached);
      if (!plan.needsCheckpoint) break;
      captured.push(plan.prefix.length);
      cached = { id: index + 1, strokes: plan.prefix, base64: 'planner fixture' };
    }
    expect(captured).toEqual([1, 2, 4, 5]);
    expect(planInk(strokes, cached).strokes).toEqual([crayon]);
  });
});
