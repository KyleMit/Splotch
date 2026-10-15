// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it } from 'vitest';
import { owner, sdk, touch, event, send, settle } from './native-contacts-mounted-harness.mjs';

const call = (action) => act(async () => action());
it('takes back committed ink while preserving a different live contact through its lift', async () => {
  await send('onPanResponderGrant', event([touch(0, 10, 20, 100)]));
  await send('onPanResponderEnd', event([], [touch(0, 30, 40, 200)], { 0: 100 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  await send('onPanResponderGrant', event([touch(1, 50, 60, 300)]));
  await call(() => owner.undo());
  expect(owner.history.drawing.strokes).toHaveLength(0);
  expect(owner.drawing).toBe(true);
  await send('onPanResponderMove', event([touch(1, 70, 80, 400)], undefined, { 1: 300 }), false);
  await send('onPanResponderEnd', event([], [touch(1, 90, 100, 500)], { 1: 300 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points).toEqual([
    { x: 50, y: 60 },
    { x: 70, y: 80 },
    { x: 90, y: 100 },
  ]);
});

it('finishes held ink before a palette choice and ignores that finger until a fresh start', async () => {
  await send('onPanResponderGrant', event([touch(0, 10, 20, 100)]));
  await call(() => owner.selectInkBrush());
  expect(owner.drawing).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  await send('onPanResponderMove', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }), false);
  await send('onPanResponderEnd', event([], [touch(0, 50, 60, 300)], { 0: 100 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points).toEqual([{ x: 10, y: 20 }]);
  await send('onPanResponderGrant', event([touch(1, 70, 80, 400)]));
  await send('onPanResponderEnd', event([], [touch(1, 90, 100, 500)], { 1: 400 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(2);
});

it('finishes held ink before Clear and ignores that finger until a fresh start', async () => {
  await send('onPanResponderGrant', event([touch(0, 10, 20, 100)]));
  await call(() => owner.clear(false));
  expect(owner.drawing).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(0);
  await send('onPanResponderMove', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }), false);
  await send('onPanResponderEnd', event([], [touch(0, 50, 60, 300)], { 0: 100 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(0);
  await call(() => owner.undo());
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points).toEqual([{ x: 10, y: 20 }]);
});

it('captures the finished live cohort before Auto-Save Clear and preserves it for Undo', async () => {
  await send('onPanResponderGrant', event([touch(0, 10, 20, 100)]));
  let clearing;
  await act(async () => {
    clearing = owner.clear(true);
  });
  await settle();
  await clearing;
  expect(sdk.save).toHaveBeenCalledTimes(1);
  expect(owner.history.drawing.strokes).toHaveLength(0);
  await call(() => owner.undo());
  expect(owner.history.drawing.strokes[0].points).toEqual([{ x: 10, y: 20 }]);
});

it('cancels a same-event capture before its committed render when the command lease ends', async () => {
  await send('onPanResponderGrant', event([touch(0, 10, 20, 100)]));
  let failure;
  await act(async () => {
    const surface = owner.surface.current;
    surface.finishInput();
    const release = surface.lockInput();
    failure = surface.exportPng(owner.currentDrawing()).catch((error) => error.message);
    release();
  });
  expect(await failure).toContain('changed');
  await settle();
  expect(sdk.captures).toHaveLength(0);
  await send('onPanResponderGrant', event([touch(1, 50, 60, 300)]));
  await send('onPanResponderEnd', event([], [touch(1, 70, 80, 400)], { 1: 300 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(2);
  expect(sdk.captures).toHaveLength(0);
});

it('leaves chrome enabled while dialogs and capture wait for the live contact to lift', async () => {
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
