// @vitest-environment happy-dom
import { legacyDrawing } from './native-paper-fixtures.mjs';
import { expect, it } from 'vitest';
import {
  owner,
  touch,
  event,
  send,
  open,
  twoContacts,
} from './native-contacts-mounted-harness.mjs';

const marker = { brush: 'marker', width: 22, color: 'Blue', points: [{ x: 40, y: 60 }] };

it('counts a stroke group once toward the settled-in strokes', async () => {
  await open({ ...legacyDrawing(3, 'flower'), strokes: [marker] });
  expect(owner.committedStrokes).toBe(0);
  await twoContacts();
  await send('start', event([touch(0, 70, 80, 400)], undefined, { 0: 100 }), false);
  await send('end', event([], [touch(0, 90, 100, 500)], { 0: 100 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(3);
  expect(owner.committedStrokes).toBe(1);
  await send('start', event([touch(2, 300, 300, 600)]));
  await send('end', event([], [touch(2, 320, 320, 700)], { 2: 600 }));
  expect(owner.history.drawing.strokes).toHaveLength(4);
  expect(owner.committedStrokes).toBe(2);
});
