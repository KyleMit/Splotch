// @vitest-environment happy-dom
import { legacyDrawing } from './native-paper-fixtures.mjs';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import {
  sdk,
  owner,
  host,
  touch,
  event,
  send,
  settle,
  open,
} from './native-contacts-mounted-harness.mjs';

describe('canonical raster contact admission and mixed chronology', () => {
  it('does not prepare a nonempty prefix or silence accepted contacts when a later contact changes mode', async () => {
    const marker = { brush: 'marker', width: 22, color: 'Blue', points: [{ x: 40, y: 60 }] };
    const initial = await open({ ...legacyDrawing(), strokes: [marker] });
    const before = owner.history;
    sdk.soundStop.mockClear();
    await send('onPanResponderGrant', event([touch(0, 10, 20)]));
    await act(async () => owner.setBrush('eraser'));
    await send(
      'onPanResponderStart',
      event([touch(0, 30, 40, 200), touch(1, 80, 90, 200)], [touch(1, 80, 90, 200)], { 0: 100 }),
      false
    );
    await settle();
    expect(sdk.captures).toHaveLength(0);
    expect(sdk.soundStop).not.toHaveBeenCalled();
    expect(owner.currentDrawing()).toBe(initial);
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
    await send(
      'onPanResponderEnd',
      event([touch(0, 50, 60, 300)], [touch(1, 100, 110, 300)], { 0: 100, 1: 200 }),
      false
    );
    await settle();
    expect(sdk.captures).toHaveLength(0);
    expect(sdk.soundStop).not.toHaveBeenCalled();
    expect(owner.currentDrawing()).toBe(initial);
    await send('onPanResponderEnd', event([], [touch(0, 70, 80, 400)], { 0: 100 }), false);
    expect(owner.history.drawing.strokes.map(({ brush }) => brush)).toEqual([
      'marker',
      'pen',
      'eraser',
    ]);
    expect(owner.history.undo).toEqual([...before.undo, initial]);
    expect(sdk.soundStop).toHaveBeenCalledOnce();
  });

  it('keeps mixed overlapping contact styles and complete erase chronology in one actual Undo unit', async () => {
    const initial = owner.currentDrawing();
    await send('onPanResponderGrant', event([touch(0, 10, 20)]));
    await act(async () => owner.setBrush('eraser'));
    await send(
      'onPanResponderStart',
      event([touch(0, 30, 40, 200), touch(1, 80, 90, 200)], [touch(1, 80, 90, 200)], { 0: 100 }),
      false
    );
    await act(async () => owner.setBrush('pen'));
    await send(
      'onPanResponderStart',
      event(
        [touch(0, 40, 50, 300), touch(1, 90, 100, 300), touch(2, 100, 120, 300)],
        [touch(2, 100, 120, 300)],
        { 0: 100, 1: 200 }
      ),
      false
    );
    await act(async () => owner.setBrush('eraser'));
    await send(
      'onPanResponderStart',
      event(
        [
          touch(0, 50, 60, 400),
          touch(1, 100, 110, 400),
          touch(2, 120, 140, 400),
          touch(3, 140, 160, 400),
        ],
        [touch(3, 140, 160, 400)],
        { 0: 100, 1: 200, 2: 300 }
      ),
      false
    );
    await settle();
    expect(sdk.captures).toHaveLength(0);
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
    expect(sdk.soundStop).not.toHaveBeenCalled();
    expect(host.querySelectorAll('[data-mask="true"]')).toHaveLength(2);
    expect(owner.currentDrawing()).toBe(initial);
    await send(
      'onPanResponderEnd',
      event(
        [touch(0, 60, 70, 500)],
        [touch(1, 110, 120, 500), touch(2, 140, 160, 500), touch(3, 160, 180, 500)],
        { 0: 100, 1: 200, 2: 300, 3: 400 }
      ),
      false
    );
    expect(owner.currentDrawing()).toBe(initial);
    expect(sdk.soundStop).not.toHaveBeenCalled();
    await send('onPanResponderEnd', event([], [touch(0, 70, 80, 600)], { 0: 100 }), false);
    expect(owner.history.drawing.strokes.map(({ brush }) => brush)).toEqual([
      'pen',
      'eraser',
      'pen',
      'eraser',
    ]);
    expect(owner.history.undo).toEqual([initial]);
    expect(sdk.soundStop).toHaveBeenCalledOnce();
    await settle();
    await act(async () => owner.undo());
    expect(owner.currentDrawing()).toBe(initial);
  });

  it('rejects next contact against synchronously published history before parent rerender', async () => {
    const before = owner.history.drawing;
    await send('onPanResponderGrant', event([touch(0, 10, 20)]));
    await act(async () => {
      sdk.handlers.onPanResponderEnd(event([], [touch(0, 30, 40, 200)], { 0: 100 }));
      expect(owner.currentDrawing()).not.toBe(before);
      expect(owner.history.drawing).toBe(before);
      expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(false);
      const next = event([touch(1, 50, 60, 300)]);
      sdk.handlers.onPanResponderGrant(next);
      sdk.handlers.onPanResponderStart(next);
    });
    expect(owner.history.drawing.strokes).toHaveLength(1);
    await send('onPanResponderEnd', event([], [touch(1, 70, 80, 400)], { 1: 300 }), false);
    expect(owner.history.drawing.strokes).toHaveLength(1);
    await settle();
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
  });
});
