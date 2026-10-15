// @vitest-environment happy-dom
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { expect, it, vi } from 'vitest';
import { owner, touch, event, send, settle } from './native-contacts-mounted-harness.mjs';

const renderer = vi.hoisted(() => ({ fault: null }));
vi.mock('../../experiments/native-architecture/src/drawing/InkLayer.web.tsx', () => ({
  InkLayer: forwardRef(({ onError, onBusy }, ref) => {
    renderer.fault = onError;
    useImperativeHandle(ref, () => ({ canStart: () => true }));
    useEffect(() => onBusy(false), [onBusy]);
    return createElement('div');
  }),
}));

it('commits the live contact before restoring a failed renderer, without losing ink or leaving drawing active', async () => {
  await send('start', event([touch(0, 10, 20)]));
  await send('move', event([touch(0, 80, 90, 200)], undefined, { 0: 100 }), false);
  await settle();
  expect(owner.drawing).toBe(true);
  expect(owner.history.drawing.strokes).toHaveLength(0);
  await act(async () => renderer.fault(new Error('Lost renderer.')));
  await settle();
  expect(owner.recovery.generation).toBe(1);
  expect(owner.recovery.failed).toBe(false);
  expect(owner.drawing).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points.length).toBeGreaterThan(1);
  expect(owner.history.undo).toHaveLength(1);
  await act(async () => owner.undo());
  expect(owner.history.drawing.strokes).toHaveLength(0);
});
