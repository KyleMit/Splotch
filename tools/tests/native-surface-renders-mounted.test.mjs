// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { event, owner, send, settle, touch } from './native-contacts-mounted-harness.mjs';

const renders = vi.hoisted(() => ({ surface: 0 }));

// DrawingSurface runs its commit probe once per render.
vi.mock('../../src/drawing/perfProbe.ts', async (original) => ({
  ...(await original()),
  useSurfaceCommitProbe: () => {
    renders.surface += 1;
  },
}));

const MOVES = 12;

// ADR-0178: the live cohort does not go through React state. Negative control: publishing each
// packet's drafts as surface state renders the drawing surface once per move packet.
it('renders the drawing surface only when a cohort starts and ends, not per packet', async () => {
  await settle();
  const before = renders.surface;
  await send('start', event([touch(0, 100, 100, 100)]));
  const started = renders.surface;
  expect(started - before).toBeLessThanOrEqual(1);
  for (let move = 1; move <= MOVES; move += 1)
    await send('move', event([touch(0, 100 + move * 10, 100, 100 + move)], undefined, { 0: 100 }));
  expect(renders.surface).toBe(started);
  await send('end', event([], [touch(0, 300, 100, 200)], { 0: 100 }));
  await settle();
  expect(renders.surface - started).toBeLessThanOrEqual(2);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points.length).toBe(MOVES + 2);
});
