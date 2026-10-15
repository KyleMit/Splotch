// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it } from 'vitest';
import { owner, sdk, touch, event, send, settle } from './native-contacts-mounted-harness.mjs';

const call = (action) => act(async () => action());

// Shipping keeps its chrome live through a stroke, so the screen's disabled flag stays clear while
// a contact holds the paper. A keyboard or assistive press can still reach the chrome then, so
// every screen action that opens a surface or runs a command refuses until the lift; closing a
// surface never waits. Paint, brush and width choices stay live for the next contact, which
// native-canonical-contacts-mounted.test.mjs holds.
it('leaves the chrome enabled while a stroke holds the paper and holds every opening and command until the lift', async () => {
  await settle();
  expect(owner.disabled).toBe(false);
  await call(() => owner.setPagePickerOpen(true));
  expect(owner.pagePickerOpen).toBe(true);

  await send('onPanResponderGrant', event([touch(0, 10, 20)]));
  expect(owner.drawing).toBe(true);

  await call(() => owner.setPagePickerOpen(false));
  expect(owner.pagePickerOpen).toBe(false);
  expect(owner.disabled).toBe(false);
  await call(() => owner.setPagePickerOpen(true));
  expect(owner.pagePickerOpen).toBe(false);
  await call(() => owner.openColorPicker());
  expect(owner.colorPickerOpen).toBe(false);
  await call(() => owner.openSettings());
  expect(owner.settingsOpen).toBe(false);
  const held = owner.history;
  await call(() => owner.undo());
  await call(() => owner.clear(false));
  await call(() => owner.save());
  expect(owner.history).toBe(held);
  expect(sdk.captures).toHaveLength(0);

  await send('onPanResponderEnd', event([], [touch(0, 30, 40, 200)]), false);
  await settle();
  expect(owner.drawing).toBe(false);
  expect(owner.disabled).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(1);

  await call(() => owner.setPagePickerOpen(true));
  expect(owner.pagePickerOpen).toBe(true);
  await call(() => owner.setPagePickerOpen(false));
  await call(() => owner.openSettings());
  expect(owner.settingsOpen).toBe(true);
});

// What the chrome reads from the screen owner, which rsd-native-stroke-chrome-commits.test.mjs
// mounts the real chrome over.
const chromeProps = () => ({
  disabled: owner.disabled,
  dialogOpen: owner.dialogOpen,
  busy: owner.busy,
});
const MOVES = 8;
const FRAME_MS = 16;

// The paper keeps a stroke's live draft to itself, so a move renders the paper alone: the screen
// owner renders at the start and the lift, when its stroke flag changes, and hands the chrome the
// same props throughout. Negative control: restoring `drawing ||` to `disabled` changes them at
// the start and the lift.
it('renders the screen owner for the stroke flag only, with the chrome props unchanged', async () => {
  await settle();
  const resting = chromeProps();
  await send('onPanResponderGrant', event([touch(0, 10, 20)]));
  expect(owner.drawing).toBe(true);
  expect(chromeProps()).toEqual(resting);

  const started = sdk.screenRenders;
  for (let move = 1; move <= MOVES; move += 1)
    await send(
      'onPanResponderMove',
      event([touch(0, 10 + move * 5, 20 + move * 5, 100 + move * FRAME_MS)], undefined, { 0: 100 }),
      false
    );
  // React may render the owner once more to find the flag unchanged, never once per move.
  expect(sdk.screenRenders - started).toBeLessThanOrEqual(1);
  expect(chromeProps()).toEqual(resting);

  await send('onPanResponderEnd', event([], [touch(0, 60, 70, 300)], { 0: 100 }), false);
  await settle();
  expect(owner.drawing).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(chromeProps()).toEqual(resting);

  await call(() => owner.undo());
  expect(owner.history.drawing.strokes).toHaveLength(0);
  expect(chromeProps()).toEqual(resting);
});
