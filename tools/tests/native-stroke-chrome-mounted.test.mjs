// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  owner,
  sdk,
  historyOwner,
  root,
  host,
  touch,
  event,
  send,
  settle,
  Consumer,
} from './native-contacts-mounted-harness.mjs';
import { Animated } from '../../experiments/native-architecture/src/platform/animated.ts';
import { UndoInkMotion } from '../../experiments/native-architecture/src/drawing/UndoInkMotion.tsx';
import { SvgUndoGhostLayer } from '../../experiments/native-architecture/src/drawing/SvgUndoGhost.tsx';
import * as tileOwner from '../../experiments/native-architecture/src/drawing/useCrayonTileReadiness.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import {
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { DrawingSessionProvider } from '../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { DrawingKeyboardScope } from '../../experiments/native-architecture/src/platform/KeyboardScope.tsx';
import { ReduceMotionPreferenceProvider } from '../../experiments/native-architecture/src/drawing/useReduceMotion.ts';

vi.mock('../../experiments/native-architecture/src/platform/animated.ts', async () => {
  const { animatedPort, easingPort } =
    await import('../migration/tests/rsd-native-animated-host.mjs');
  const { createElement: element } = await import('react');
  const View = ({ children, testID }) => element('div', { 'data-testid': testID }, children);
  return { Animated: animatedPort(View, View), Easing: easingPort };
});
afterEach(() => vi.restoreAllMocks());

const call = (action) => act(async () => action());
it('takes back committed ink while preserving a different live contact through its lift', async () => {
  await send('start', event([touch(0, 10, 20, 100)]));
  await send('end', event([], [touch(0, 30, 40, 200)], { 0: 100 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  await send('start', event([touch(1, 50, 60, 300)]));
  await call(() => owner.undo());
  expect(owner.history.drawing.strokes).toHaveLength(0);
  expect(owner.drawing).toBe(true);
  await send('move', event([touch(1, 70, 80, 400)], undefined, { 1: 300 }), false);
  await send('end', event([], [touch(1, 90, 100, 500)], { 1: 300 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points).toEqual([
    { x: 50, y: 60 },
    { x: 70, y: 80 },
    { x: 90, y: 100 },
  ]);
});

it('finishes held ink before a palette choice and ignores that finger until a fresh start', async () => {
  await send('start', event([touch(0, 10, 20, 100)]));
  await call(() => owner.selectInkBrush());
  expect(owner.drawing).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  await send('move', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }), false);
  await send('end', event([], [touch(0, 50, 60, 300)], { 0: 100 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points).toEqual([{ x: 10, y: 20 }]);
  await send('start', event([touch(1, 70, 80, 400)]));
  await send('end', event([], [touch(1, 90, 100, 500)], { 1: 400 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(2);
});

it('finishes held ink before Clear and ignores that finger until a fresh start', async () => {
  await send('start', event([touch(0, 10, 20, 100)]));
  await call(() => owner.clear(false));
  expect(owner.drawing).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(0);
  await send('move', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }), false);
  await send('end', event([], [touch(0, 50, 60, 300)], { 0: 100 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(0);
  await call(() => owner.undo());
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(owner.history.drawing.strokes[0].points).toEqual([{ x: 10, y: 20 }]);
});

it('captures the finished live cohort before Auto-Save Clear and preserves it for Undo', async () => {
  await send('start', event([touch(0, 10, 20, 100)]));
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
  await send('start', event([touch(0, 10, 20, 100)]));
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
  await send('start', event([touch(1, 50, 60, 300)]));
  await send('end', event([], [touch(1, 70, 80, 400)], { 1: 300 }), false);
  expect(owner.history.drawing.strokes).toHaveLength(2);
  expect(sdk.captures).toHaveLength(0);
});

it('leaves chrome enabled while dialogs and capture wait for the live contact to lift', async () => {
  await settle();
  expect(owner.disabled).toBe(false);
  await call(() => owner.setPagePickerOpen(true));
  expect(owner.pagePickerOpen).toBe(true);

  await send('start', event([touch(0, 10, 20)]));
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

  await send('end', event([], [touch(0, 30, 40, 200)]), false);
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
  await send('start', event([touch(0, 10, 20)]));
  expect(owner.drawing).toBe(true);
  expect(chromeProps()).toEqual(resting);

  const started = sdk.screenRenders;
  for (let move = 1; move <= MOVES; move += 1)
    await send(
      'move',
      event([touch(0, 10 + move * 5, 20 + move * 5, 100 + move * FRAME_MS)], undefined, { 0: 100 }),
      false
    );
  // React may render the owner once more to find the flag unchanged, never once per move.
  expect(sdk.screenRenders - started).toBeLessThanOrEqual(1);
  expect(chromeProps()).toEqual(resting);

  await send('end', event([], [touch(0, 60, 70, 300)], { 0: 100 }), false);
  await settle();
  expect(owner.drawing).toBe(false);
  expect(owner.history.drawing.strokes).toHaveLength(1);
  expect(chromeProps()).toEqual(resting);

  await call(() => owner.undo());
  expect(owner.history.drawing.strokes).toHaveLength(0);
  expect(chromeProps()).toEqual(resting);
});

it('publishes one stamped cue for each accepted Undo and none for empty or held history', async () => {
  await settle();
  await call(() => owner.undo(false, { x: 200, y: 300 }));
  expect(owner.undoFeedback).toBeNull();
  await send('start', event([touch(0, 10, 20)]));
  await call(() => owner.undo(false, { x: 200, y: 300 }));
  expect(owner.undoFeedback).toBeNull();
  await send('end', event([], [touch(0, 30, 40, 200)]), false);
  await settle();
  const before = owner.history.drawing;
  await call(() => owner.undo(false, { x: 200, y: 300 }));
  expect(owner.undoFeedback).toMatchObject({
    id: 1,
    reduced: false,
    startedAt: expect.any(Number),
  });
  expect(owner.undoGhost).toMatchObject({
    id: 1,
    before,
    after: owner.history.drawing,
    towards: { x: 200, y: 300 },
  });
  await call(() => owner.undoGhost.onFinished());
  expect(owner.undoGhost).toBeNull();
  const accepted = owner.undoFeedback;
  await call(() => owner.undo(true, null));
  expect(owner.undoFeedback).toBe(accepted);
  await send('start', event([touch(0, 10, 20)]));
  await send('end', event([], [touch(0, 30, 40, 400)]), false);
  await settle();
  await call(() => owner.undo(true, null));
  expect(owner.undoFeedback).toMatchObject({ id: 2, reduced: true });
  expect(owner.undoGhost).toBeNull();
});

it.each(['stroke', 'live stroke', 'settings', 'unmount'])(
  'rejects a button measurement that outlives %s admission',
  async (change) => {
    await settle();
    await send('start', event([touch(0, 10, 20)]));
    await send('end', event([], [touch(0, 30, 40, 200)]), false);
    await settle();
    const held = historyOwner.historyRef.current;
    let measured;
    owner.undoTile.current = {
      measure: (complete) => {
        measured = complete;
      },
    };
    await call(() => owner.undoFromButton(false));
    expect(measured).toBeTypeOf('function');
    if (change === 'stroke' || change === 'live stroke') {
      await send('start', event([touch(0, 50, 60)]));
      if (change === 'stroke') {
        await send('end', event([], [touch(0, 50, 60, 400)]), false);
        await settle();
      }
    } else if (change === 'settings') {
      await call(() => owner.openSettings());
      await call(() => owner.closeSettings());
    } else await call(() => root.unmount());
    const latest = historyOwner.historyRef.current;
    await call(() => measured(0, 0, 60, 60, 200, 300));
    expect(historyOwner.historyRef.current).toBe(latest);
    expect(owner.undoFeedback).toBeNull();
    expect(historyOwner.historyRef.current === held).toBe(change !== 'stroke');
  }
);

it('measures the current button centre before its accepted Undo and records that target once', async () => {
  await settle();
  await send('start', event([touch(0, 10, 20)]));
  await send('end', event([], [touch(0, 30, 40, 200)]), false);
  await settle();
  const before = owner.history;
  let measured;
  owner.undoTile.current = {
    measure: (complete) => {
      measured = complete;
    },
  };
  await call(() => owner.undoFromButton(false));
  expect(owner.history).toBe(before);
  await call(() => measured(0, 0, 60, 60, 200, 300));
  expect(owner.history.drawing.strokes).toHaveLength(0);
  expect(owner.undoGhost).toMatchObject({ towards: { x: 230, y: 330 }, id: 1 });
  const accepted = owner.history;
  await call(() => measured(0, 0, 60, 60, 200, 300));
  expect(owner.history).toBe(accepted);
  expect(owner.undoFeedback.id).toBe(1);
});

async function mountUndoKeyboard() {
  await call(() =>
    root.render(
      createElement(
        DrawingSessionProvider,
        null,
        createElement(
          ReduceMotionPreferenceProvider,
          { preference: 'full' },
          createElement(DrawingKeyboardScope, { enabled: true }, createElement(Consumer))
        )
      )
    )
  );
  await settle();
  expect(sdk.shortcut).toBeTypeOf('function');
}

async function requestUndo(kind) {
  if (kind === 'keyboard') {
    await call(() => sdk.shortcut({ nativeEvent: { key: 'undo' } }));
    return;
  }
  let measured;
  owner.undoTile.current = {
    measure: (complete) => {
      measured = complete;
    },
  };
  await call(() => owner.undoFromButton(false));
  expect(measured).toBeTypeOf('function');
  await call(() => measured(0, 0, 60, 60, 200, 300));
}

it.each(['keyboard', 'button'])(
  'takes committed ink back through fresh %s Undo while preserving the live contact without motion',
  async (kind) => {
    await mountUndoKeyboard();
    await send('start', event([touch(0, 10, 20, 100)]));
    await send('end', event([], [touch(0, 30, 40, 200)], { 0: 100 }));
    expect(owner.history.drawing.strokes).toHaveLength(1);
    await send('start', event([touch(1, 50, 60, 300)]));
    await requestUndo(kind);
    expect(owner.history.drawing.strokes).toHaveLength(0);
    expect(owner.drawing).toBe(true);
    expect(owner.undoFeedback).toBeNull();
    expect(owner.undoGhost).toBeNull();
    await send('move', event([touch(1, 70, 80, 400)], undefined, { 1: 300 }));
    await send('end', event([], [touch(1, 90, 100, 500)], { 1: 300 }));
    expect(owner.history.drawing.strokes).toHaveLength(1);
    expect(owner.history.drawing.strokes[0].points).toEqual([
      { x: 50, y: 60 },
      { x: 70, y: 80 },
      { x: 90, y: 100 },
    ]);
    await requestUndo(kind);
    expect(owner.history.drawing.strokes).toHaveLength(0);
    expect(owner.undoFeedback.id).toBe(1);
    expect(owner.undoGhost).not.toBeNull();
  }
);

it.each(['keyboard', 'button'])(
  'leaves an uncommitted first contact intact when fresh %s Undo has no committed history',
  async (kind) => {
    await mountUndoKeyboard();
    const empty = historyOwner.historyRef.current;
    await send('start', event([touch(0, 10, 20, 100)]));
    await requestUndo(kind);
    expect(historyOwner.historyRef.current).toBe(empty);
    expect(owner.drawing).toBe(true);
    expect(owner.undoFeedback).toBeNull();
    expect(owner.undoGhost).toBeNull();
    await send('move', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }));
    await send('end', event([], [touch(0, 50, 60, 300)], { 0: 100 }));
    expect(owner.history.drawing.strokes).toHaveLength(1);
    expect(owner.history.drawing.strokes[0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ]);
  }
);

it('releases an unmounted ghost when a new stroke begins and ignores its late completion', async () => {
  await settle();
  await send('start', event([touch(0, 10, 20, 100)]));
  await send('end', event([], [touch(0, 30, 40, 200)], { 0: 100 }));
  await call(() => owner.undo(false, null));
  const expired = owner.undoGhost;
  const feedback = owner.undoFeedback;
  expect(expired).not.toBeNull();
  await send('start', event([touch(1, 50, 60, 300)]));
  expect(owner.undoGhost).toBeNull();
  expect(owner.undoFeedback).toBe(feedback);
  await send('end', event([], [touch(1, 70, 80, 400)], { 1: 300 }));
  await call(() => owner.undo(false, null));
  const active = owner.undoGhost;
  expect(active.id).toBe(2);
  await call(() => expired.onFinished());
  expect(owner.undoGhost).toBe(active);
});

it.each([210, 420, 600])(
  'admits a mounted ghost only for the remaining action time at %sms',
  async (elapsed) => {
    vi.spyOn(performance, 'now').mockReturnValue(elapsed);
    const timing = vi.spyOn(Animated, 'timing');
    const onFinished = vi.fn();
    const feedback = {
      id: 1,
      startedAt: 0,
      reduced: false,
      before: emptyDrawing(),
      after: emptyDrawing(),
      towards: null,
      onFinished,
    };
    await act(async () =>
      root.render(
        createElement(
          ReduceMotionPreferenceProvider,
          { preference: 'full' },
          createElement(
            UndoInkMotion,
            { feedback, bounds: { left: 0, top: 0, width: 40, height: 40 }, frame: null },
            'ink'
          )
        )
      )
    );
    await act(async () => {
      const first = [...sdk.frames.values()];
      sdk.frames.clear();
      for (const frame of first) frame();
      const second = [...sdk.frames.values()];
      sdk.frames.clear();
      for (const frame of second) frame();
    });
    const durations = timing.mock.calls.map(([, config]) => config.duration);
    expect(durations).toEqual(elapsed < 420 ? [420 - elapsed] : []);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
  }
);

it('discards an expired decoded SVG ghost before requesting its scene pigments', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(420);
  const resources = vi.spyOn(tileOwner, 'useCrayonTileResources');
  const before = {
    ...emptyDrawing(),
    strokes: [{ brush: 'crayon', color: 'Green', width: 34, seed: 1, points: [{ x: 30, y: 30 }] }],
  };
  const onFinished = vi.fn();
  await act(async () =>
    root.render(
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme: 'light' } },
        createElement(SvgUndoGhostLayer, {
          feedback: {
            id: 1,
            startedAt: 0,
            reduced: false,
            before,
            after: emptyDrawing(),
            towards: null,
            onFinished,
          },
          checkpoint: null,
          frame: { width: 400, height: 300, pageX: 0, pageY: 0 },
        })
      )
    )
  );
  expect(resources).toHaveBeenCalled();
  expect(resources.mock.calls.flatMap(([strokes]) => strokes)).toEqual([]);
  expect(onFinished).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
});

it.each(['eraser', 'page'])(
  'finishes an unsupported %s SVG candidate before scene work',
  async (kind) => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const before = {
      ...adoptedDrawing({ width: 400, height: 300, pixelRatio: 1 }),
      strokes: [
        {
          ...strokeStyle(kind === 'eraser' ? 'eraser' : 'pen', 'Green', emptyDrawing()),
          points: [{ x: 30, y: 30 }],
        },
      ],
    };
    const after = { ...before, pageId: kind === 'page' ? 'butterfly' : before.pageId, strokes: [] };
    const feedback = { id: 1, startedAt: 0, reduced: false, before, after, towards: null };
    const finished = vi.fn();
    const resources = vi.spyOn(tileOwner, 'useCrayonTileResources');
    await act(async () =>
      root.render(
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId: after.pageId, theme: 'light' } },
          createElement(SvgUndoGhostLayer, {
            feedback: { ...feedback, onFinished: finished },
            checkpoint: null,
            frame: { width: 400, height: 300, pageX: 0, pageY: 0 },
          })
        )
      )
    );
    expect(resources.mock.calls.flatMap(([strokes]) => strokes)).toEqual([]);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
  }
);
