// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it } from 'vitest';
import { owner, touch, event, send, settle } from './native-contacts-mounted-harness.mjs';

// Shipping keeps its chrome live through a stroke, so the screen's disabled flag stays clear while
// a contact holds the paper; the commands themselves still refuse to start until the lift.
it('leaves the chrome enabled while a stroke holds the paper and refuses commands until the lift', async () => {
  await settle();
  expect(owner.disabled).toBe(false);

  await send('onPanResponderGrant', event([touch(0, 10, 20)]));
  expect(owner.drawing).toBe(true);
  expect(owner.disabled).toBe(false);

  await act(async () => owner.openSettings());
  expect(owner.settingsOpen).toBe(false);
  const held = owner.history;
  await act(async () => owner.undo());
  expect(owner.history).toBe(held);

  await send('onPanResponderEnd', event([], [touch(0, 30, 40, 200)]), false);
  await settle();
  expect(owner.drawing).toBe(false);
  expect(owner.disabled).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(1);

  await act(async () => owner.openSettings());
  expect(owner.settingsOpen).toBe(true);
});
