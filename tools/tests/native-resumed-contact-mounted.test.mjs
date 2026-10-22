// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import {
  POINTER_RESUME_GAP_MS,
  POINTER_RESUME_JUMP_RATIO,
} from '../../src/lib/drawing/strokeMath.ts';
import { owner, touch, event, send } from './native-contacts-mounted-harness.mjs';

// The harness paper frame is 1024x768 CSS px, so a blank picture adopts the canonical sheet and a
// frame pixel is one paper unit.
const PAPER_MIN_SIDE = 768;
const FAR = POINTER_RESUME_JUMP_RATIO * PAPER_MIN_SIDE + 1;
const PAST_GAP_MS = POINTER_RESUME_GAP_MS + 1;
const DOWN_AT = 100;
const SAMPLE_MS = 16;

async function stroke(samples) {
  const [[x, y]] = samples;
  await send('start', event([touch(0, x, y, DOWN_AT)]));
  for (const [x, y, at] of samples.slice(1, -1))
    await send('move', event([touch(0, x, y, at)], undefined, { 0: DOWN_AT }), false);
  const [lastX, lastY, lastAt] = samples.at(-1);
  await send('end', event([], [touch(0, lastX, lastY, lastAt)], { 0: DOWN_AT }), false);
}

const firstPoints = ({ points }) => [points[0], points.at(-1)];

describe('a contact whose stream resumes far away after an idle gap', () => {
  it('starts a new stroke at the resumed point, with no connecting line, in one Undo', async () => {
    const before = owner.history;
    const resumedAt = DOWN_AT + 2 * SAMPLE_MS + PAST_GAP_MS;
    await stroke([
      [100, 100],
      [120, 110, DOWN_AT + SAMPLE_MS],
      [140, 120, DOWN_AT + 2 * SAMPLE_MS],
      [140 + FAR, 120, resumedAt],
      [150 + FAR, 125, resumedAt + SAMPLE_MS],
    ]);
    expect(owner.history.drawing.strokes.map(firstPoints)).toEqual([
      [
        { x: 100, y: 100 },
        { x: 140, y: 120 },
      ],
      [
        { x: 140 + FAR, y: 120 },
        { x: 150 + FAR, y: 125 },
      ],
    ]);
    expect(owner.history.undo).toHaveLength(before.undo.length + 1);
  });

  it('gives a resumed crayon pass the next grain seed', async () => {
    await act(async () => owner.setBrush('crayon'));
    await stroke([
      [100, 100],
      [140, 120, DOWN_AT + SAMPLE_MS],
      [140 + FAR, 120, DOWN_AT + SAMPLE_MS + PAST_GAP_MS],
    ]);
    const [first, resumed] = owner.history.drawing.strokes;
    expect(resumed.seed).toBe(first.seed + 1);
  });

  it.each([
    ['a far sample with no idle gap', FAR, SAMPLE_MS],
    ['a near sample after an idle gap', FAR - 2, PAST_GAP_MS],
    ['a far sample exactly at the gap', FAR, POINTER_RESUME_GAP_MS],
  ])('keeps one stroke for %s', async (_case, jump, gap) => {
    await stroke([
      [100, 100],
      [140, 120, DOWN_AT + SAMPLE_MS],
      [140 + jump, 120, DOWN_AT + SAMPLE_MS + gap],
    ]);
    expect(owner.history.drawing.strokes).toHaveLength(1);
    expect(owner.history.drawing.strokes[0].points).toHaveLength(3);
  });
});
