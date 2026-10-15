// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { expect, it } from 'vitest';
import {
  sdk,
  owner,
  historyOwner,
  root,
  touch,
  event,
  send,
  settle,
  Consumer,
} from './native-contacts-mounted-harness.mjs';
import { DrawingSessionProvider } from '../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { createHistory } from '../../experiments/native-architecture/src/drawing/model.ts';
import { adoptedDrawing } from './native-paper-fixtures.mjs';

// The real drawing surface and screen owner under React StrictMode, which runs every effect's
// cleanup and setup once more as they mount, as development builds do. The paper's responder,
// frame loop and sound must come back whole: a stroke drawn, sounded and taken back on the same
// session history as on the plain root. rsd-native-strict-root.test.mjs holds the canonical
// root's services the same way.
const FRAME_MS = 16;
const MOVES = 4;

async function launch(strict) {
  const drawing = {
    ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }),
    strokes: [{ brush: 'pen', width: 8, color: 'Purple', points: [{ x: 1, y: 1 }] }],
  };
  sdk.soundStart.mockClear();
  sdk.soundStop.mockClear();
  const session = createElement(DrawingSessionProvider, null, createElement(Consumer));
  await act(async () => root.render(strict ? createElement(StrictMode, null, session) : session));
  await settle();
  await act(async () => historyOwner.setHistory(createHistory(drawing)));
  await settle();
  const restored = {
    strokes: owner.history.drawing.strokes.length,
    undo: owner.history.undo.length,
  };
  await send('onPanResponderGrant', event([touch(0, 10, 20)]));
  for (let move = 1; move <= MOVES; move += 1)
    await send(
      'onPanResponderMove',
      event([touch(0, 10 + move * 9, 20 + move * 9, 100 + move * FRAME_MS)], undefined, { 0: 100 }),
      false
    );
  await send('onPanResponderEnd', event([], [touch(0, 60, 70, 300)], { 0: 100 }), false);
  await settle();
  const drawn = {
    strokes: owner.history.drawing.strokes.length,
    points: owner.history.drawing.strokes.at(-1).points.length,
    drawing: owner.drawing,
    soundStarts: sdk.soundStart.mock.calls.length,
    soundStops: sdk.soundStop.mock.calls.length,
  };
  await act(async () => owner.undo());
  return { restored, drawn, undone: owner.history.drawing.strokes.length };
}

it('draws on the real surface under StrictMode as it does without it', async () => {
  const plain = await launch(false);
  expect(plain.restored).toEqual({ strokes: 1, undo: 0 });
  expect(plain.drawn).toMatchObject({ strokes: 2, drawing: false, soundStarts: 1, soundStops: 1 });
  expect(plain.undone).toBe(1);
  await act(async () => root.render(null));
  expect(await launch(true)).toEqual(plain);
});
