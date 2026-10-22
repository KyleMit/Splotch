import { LEGACY_PAPER } from './native-paper-fixtures.mjs';
import { adoptPaper, paperProjection } from '../../src/drawing/paperSpace.ts';
import { describe, expect, it } from 'vitest';
import {
  checkpointMatches,
  needsPreparation,
  planInk,
  preparationMatches,
  preparationWitnessed,
} from '../../src/drawing/checkpoints.ts';

function canonicalPlan(strokes, cached) {
  return planInk(strokes, cached, LEGACY_PAPER, paperProjection(LEGACY_PAPER));
}

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
    const first = canonicalPlan(strokes, null);
    expect(first.prefix).toEqual([marker]);
    expect(first.needsCheckpoint).toBe(true);
    const checkpoint = {
      id: 1,
      strokes: first.prefix,
      paper: LEGACY_PAPER,
      projection: paperProjection(LEGACY_PAPER),
      base64: 'model-only fixture',
    };
    const ready = canonicalPlan(strokes, checkpoint);
    expect(ready.strokes).toEqual([crayon, second]);
    expect(ready.needsCheckpoint).toBe(false);
  });

  it('rejects an identity-matching cache inside a contiguous Crayon run and after witness-removing Undo', () => {
    const { marker, crayon } = fixture();
    const second = { ...crayon, seed: 21 };
    const cache = {
      id: 1,
      strokes: [marker, crayon],
      paper: LEGACY_PAPER,
      projection: paperProjection(LEGACY_PAPER),
      base64: 'noncanonical fixture',
    };
    expect(checkpointMatches([marker, crayon, second], cache)).toBe(false);
    expect(canonicalPlan([marker, crayon, second], cache).checkpoint).toBeNull();
    const valid = { ...cache, strokes: [marker] };
    expect(checkpointMatches([marker, crayon], valid)).toBe(true);
    expect(checkpointMatches([marker], valid)).toBe(false);
  });

  it('requires the exact canonical predecessor as well as actual next-boundary witness', () => {
    const { marker, crayon, erase } = fixture();
    const predecessor = {
      id: 1,
      strokes: [marker],
      paper: LEGACY_PAPER,
      projection: paperProjection(LEGACY_PAPER),
      base64: 'canonical predecessor',
    };
    const preparation = {
      checkpoint: {
        id: 2,
        strokes: [marker, crayon],
        paper: LEGACY_PAPER,
        projection: paperProjection(LEGACY_PAPER),
        base64: 'prepared',
      },
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
    const speculative = {
      id: 1,
      strokes: [crayon],
      paper: LEGACY_PAPER,
      projection: paperProjection(LEGACY_PAPER),
      base64: 'unused eraser selection',
    };
    expect(canonicalPlan([crayon, { ...crayon, seed: 21 }], speculative).checkpoint).toBeNull();
    const unusedCrayon = {
      id: 2,
      strokes: [marker],
      paper: LEGACY_PAPER,
      projection: paperProjection(LEGACY_PAPER),
      base64: 'unused crayon selection',
    };
    const secondMarker = { ...marker, color: 'Blue' };
    const replay = canonicalPlan([marker, secondMarker, crayon, erase], unusedCrayon);
    expect(replay.checkpoint).toBeNull();
    expect(replay.prefix).toEqual([marker, secondMarker]);
  });

  it('advances through every Crayon and eraser boundary without skipping or empty captures', () => {
    const { marker, crayon, erase } = fixture();
    const strokes = [marker, crayon, erase, marker, erase, crayon];
    let cached = null;
    const captured = [];
    for (let index = 0; index < strokes.length; index += 1) {
      const plan = canonicalPlan(strokes, cached);
      if (!plan.needsCheckpoint) break;
      captured.push(plan.prefix.length);
      cached = {
        id: index + 1,
        strokes: plan.prefix,
        paper: LEGACY_PAPER,
        projection: paperProjection(LEGACY_PAPER),
        base64: 'planner fixture',
      };
    }
    expect(captured).toEqual([1, 2, 4, 5]);
    expect(canonicalPlan(strokes, cached).strokes).toEqual([crayon]);
  });
});

it('rejects a checkpoint from an earlier extent without changing the semantic strokes', () => {
  const paper = adoptPaper(400, 800, 2);
  const { marker, crayon } = fixture();
  const strokes = [marker, crayon];
  const original = paperProjection(paper);
  const resized = paperProjection(paper, { width: 800, height: 1000 });
  const checkpoint = {
    id: 1,
    paper,
    projection: original,
    strokes: [marker],
    base64: 'original extent',
  };
  expect(planInk(strokes, checkpoint, paper, original).checkpoint).toBe(checkpoint);
  const replay = planInk(strokes, checkpoint, paper, resized);
  expect(replay.checkpoint).toBeNull();
  expect(replay.prefix[0]).toBe(marker);
  expect(replay.projection).toBe(resized);
});
