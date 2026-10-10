// @vitest-environment happy-dom
import {
  native,
  root,
  container,
  props,
  history,
  BASELINE,
  touch,
  event,
  send,
  layout,
  pageTouch,
  refresh,
} from './native-drawing-coordinates-harness.mjs';
import { ProbeApp as DrawingScreen } from '../../experiments/native-architecture/src/ProbeApp.tsx';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { undoDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { createPaperScroll } from '../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { measurePaper as measureWebPaper } from '../../experiments/native-architecture/src/drawing/measurePaper.web.ts';

describe('measured paper coordinate regression', () => {
  it('retains the prescribed partial-lift endpoint and survivor corridor with stale Android target coordinates', () => {
    send('onPanResponderGrant', event([touch(0, 400, 1150, 100)]));
    send(
      'onPanResponderStart',
      event([touch(0, 400, 1150, 300), touch(1, 650, 1250, 300)], [touch(1, 650, 1250, 300)], {
        0: 100,
      })
    );
    send(
      'onPanResponderMove',
      event([touch(0, 450, 1175, 500), touch(1, 675, 1300, 500)], undefined, { 0: 100, 1: 300 })
    );
    const partial = event([touch(1, 675, 1300, 700, 50, 25)], [touch(0, 500, 1200, 700, 50, 25)], {
      0: 100,
      1: 300,
    });
    send('onPanResponderEnd', partial);
    send('onPanResponderRelease', partial);
    expect(props.onCohort).not.toHaveBeenCalled();
    const survivor = event([touch(1, 700, 1350, 900)], undefined, { 1: 300 });
    send('onPanResponderGrant', survivor);
    send('onPanResponderMove', survivor);
    const final = event([], [touch(1, 700, 1350, 1100)], { 1: 300 });
    send('onPanResponderEnd', final);
    send('onPanResponderRelease', final);
    expect(history.drawing.strokes.slice(1).map(({ points }) => points)).toEqual([
      [
        { x: 367.48, y: 346.84 },
        { x: 419.1, y: 372.65 },
        { x: 470.71, y: 398.45 },
      ],
      [
        { x: 625.55, y: 450.06 },
        { x: 651.35, y: 501.68 },
        { x: 677.16, y: 553.29 },
      ],
    ]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(undoDrawing(history).drawing).toEqual(BASELINE);
  });

  it('uses measured paper coordinates when pointer zero moves at a partial start', () => {
    send('onPanResponderGrant', event([touch(0, 400, 1150, 100)]));
    const a = touch(0, 420, 1160, 300, 20, 10);
    const b = touch(1, 650, 1250, 300, 20, 10);
    send('onPanResponderStart', event([a, b], [b], { 0: 100 }));
    send(
      'onPanResponderEnd',
      event([], [touch(0, 500, 1200, 500), touch(1, 700, 1350, 500)], { 0: 100, 1: 300 })
    );
    expect(history.drawing.strokes[2].points[0]).toEqual({ x: 625.55, y: 450.06 });
    expect(history.drawing.strokes[1].points).toContainEqual({ x: 388.13, y: 357.16 });
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(undoDrawing(history).drawing).toEqual(BASELINE);
  });
});

describe('measured paper readiness and invalidation', () => {
  it.each([
    ['', 'Drawing sound is unavailable. You can keep drawing. Try another stroke.'],
    ['Drawing sound is unavailable. You can keep drawing. Try another stroke.', ''],
  ])('keeps notice layout stable through an active cohort (%s → %s)', async (initial, next) => {
    native.notice = initial;
    native.frame = [0, 0, 1024, 768, 40, 800];
    native.handlers = null;
    await act(async () => root.render(createElement(DrawingScreen)));
    layout();
    expect(native.handlers.onStartShouldSetPanResponder()).toBe(true);
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    send('onPanResponderMove', event([pageTouch(0, 70, 840, 200)], undefined, { 0: 100 }));
    act(() => native.setNotice(next));
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe(initial);
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(native.contentChanges).toBe(0);
    send('onPanResponderMove', event([pageTouch(0, 240, 1000, 300)], undefined, { 0: 100 }));
    send('onPanResponderEnd', event([], [pageTouch(0, 440, 1200, 400)], { 0: 100 }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 200, y: 200 },
      { x: 400, y: 400 },
    ]);
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe(next);
    expect(native.contentChanges).toBe(1);
  });

  it.each([
    [0, 768, 40, 800],
    [1024, -1, 40, 800],
    [NaN, 768, 40, 800],
    [1024, Infinity, 40, 800],
    [1024, 768, NaN, 800],
    [1024, 768, 40, Infinity],
    [true, 768, 40, 800],
    [1024, 768, '40', 800],
  ])('refuses malformed measured geometry %j', (width, height, x, y) => {
    native.frame = [0, 0, width, height, x, y];
    refresh();
    expect(native.handlers.onStartShouldSetPanResponder()).toBe(false);
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    send('onPanResponderEnd', event([], [pageTouch(0, 60, 830, 200)], { 0: 100 }));
    expect(props.onCohort).not.toHaveBeenCalled();
  });

  it('rejects a stale measurement callback after the latest layout and consumes each measurement once', () => {
    native.autoMeasure = false;
    refresh();
    const stale = native.measurements.at(-1);
    refresh();
    const current = native.measurements.at(-1);
    act(() => current(0, 0, 1024, 768, 40, 800));
    act(() => stale(0, 0, 1024, 768, 0, 0));
    act(() => current(0, 0, 1024, 768, 0, 0));
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    send('onPanResponderEnd', event([], [pageTouch(0, 70, 840, 200)], { 0: 100 }));
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('keeps a contact that began before measurement ignored after readiness returns', () => {
    native.autoMeasure = false;
    refresh();
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    act(() => native.measurements.at(-1)(0, 0, 1024, 768, 40, 800));
    expect(native.handlers.onStartShouldSetPanResponder()).toBe(true);
    send('onPanResponderMove', event([pageTouch(0, 70, 840, 200)], undefined, { 0: 100 }));
    send('onPanResponderEnd', event([], [pageTouch(0, 90, 860, 300)], { 0: 100 }));
    expect(props.onCohort).not.toHaveBeenCalled();
    send('onPanResponderGrant', event([pageTouch(0, 100, 880, 400)]));
    send('onPanResponderEnd', event([], [pageTouch(0, 120, 900, 500)], { 0: 400 }));
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 60, y: 80 },
      { x: 80, y: 100 },
    ]);
  });

  it('flushes a proven copied point before scroll invalidation and never joins the continuing contact to the new frame', () => {
    native.frame = [0, 0, 1024, 768, 40, 800];
    refresh();
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    send('onPanResponderMove', event([pageTouch(0, 70, 840, 200)], undefined, { 0: 100 }));
    const regrant = event([pageTouch(0, 90, 860, 300)], undefined, { 0: 100 });
    act(() => native.handlers.onPanResponderGrant(regrant));
    regrant.nativeEvent.touches[0].pageX = 999;
    native.autoMeasure = false;
    refresh();
    expect(native.handlers.onStartShouldSetPanResponder()).toBe(false);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ]);
    act(() => native.measurements.at(-1)(0, 0, 1024, 768, 40, 700));
    send('onPanResponderMove', event([pageTouch(0, 110, 780, 400)], undefined, { 0: 100 }));
    send('onPanResponderEnd', event([], [pageTouch(0, 130, 800, 500)], { 0: 100 }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    send('onPanResponderGrant', event([pageTouch(1, 150, 820, 600)]));
    send('onPanResponderEnd', event([], [pageTouch(1, 170, 840, 700)], { 1: 600 }));
    expect(props.onCohort.mock.calls[1][0][0].points).toEqual([
      { x: 110, y: 120 },
      { x: 130, y: 140 },
    ]);
  });

  it('rejects shared-target off-paper page origins despite plausible local coordinates, including later entry', () => {
    native.frame = [0, 0, 1024, 768, 40, 800];
    refresh();
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    const control = pageTouch(1, 50, 790, 200);
    send(
      'onPanResponderStart',
      event([pageTouch(0, 50, 820, 200), control], [control], { 0: 100 })
    );
    send(
      'onPanResponderMove',
      event([pageTouch(0, 70, 840, 300), pageTouch(1, 90, 860, 300)], undefined, { 0: 100, 1: 200 })
    );
    send(
      'onPanResponderEnd',
      event([], [pageTouch(0, 110, 880, 400), pageTouch(1, 130, 900, 400)], { 0: 100, 1: 200 })
    );
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 70, y: 80 },
    ]);
  });

  it('does not restore geometry or commit twice from a measurement delivered after unmount', () => {
    native.frame = [0, 0, 1024, 768, 40, 800];
    refresh();
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    native.autoMeasure = false;
    refresh();
    const late = native.measurements.at(-1);
    act(() => root.render(null));
    act(() => late(0, 0, 1024, 768, 40, 800));
    expect(native.handlers.onStartShouldSetPanResponder()).toBe(false);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('invalidates changed scroll offsets while retaining an active contact through stationary scroll-end delivery', () => {
    native.frame = [0, 0, 1024, 768, 40, 800];
    refresh();
    const scroll = createPaperScroll(refresh);
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    scroll({ x: 0, y: 0 });
    expect(props.onCohort).not.toHaveBeenCalled();
    native.frame = [0, 0, 1024, 768, 40, 700];
    scroll({ x: 0, y: 100 });
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    send('onPanResponderEnd', event([], [pageTouch(0, 70, 840, 200)], { 0: 100 }));
    send('onPanResponderGrant', event([pageTouch(1, 90, 860, 300)]));
    scroll({ x: 0, y: 100 });
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    send('onPanResponderEnd', event([], [pageTouch(1, 110, 880, 400)], { 1: 300 }));
    expect(props.onCohort.mock.calls[1][0][0].points).toEqual([
      { x: 50, y: 160 },
      { x: 70, y: 180 },
    ]);
  });

  it('invalidates the real screen paper through its actual ScrollView callback', async () => {
    native.frame = [0, 0, 1024, 768, 40, 800];
    native.handlers = null;
    await act(async () => root.render(createElement(DrawingScreen)));
    layout();
    expect(native.handlers.onStartShouldSetPanResponder()).toBe(true);
    send('onPanResponderGrant', event([pageTouch(0, 50, 820, 100)]));
    expect(props.onCohort).not.toHaveBeenCalled();
    native.frame = [0, 0, 1024, 768, 40, 700];
    act(() => native.scroll({ nativeEvent: { contentOffset: { x: 0, y: 100 } } }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
    send('onPanResponderEnd', event([], [pageTouch(0, 70, 840, 200)], { 0: 100 }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('converts the web viewport rectangle to the document coordinate space used by DOM page coordinates', () => {
    const complete = vi.fn();
    measureWebPaper(
      {
        getBoundingClientRect: () => ({ width: 1024, height: 768, left: 20, top: 30 }),
        ownerDocument: { defaultView: { scrollX: 40, scrollY: 500 } },
      },
      complete
    );
    expect(complete).toHaveBeenCalledExactlyOnceWith({
      width: 1024,
      height: 768,
      pageX: 60,
      pageY: 530,
    });
  });

  it.each([
    null,
    {},
    {
      getBoundingClientRect() {
        throw new Error('detached');
      },
      ownerDocument: {},
    },
    {
      getBoundingClientRect: () => ({ width: 1024, height: 768, left: 0, top: 0 }),
      ownerDocument: { defaultView: { scrollX: NaN, scrollY: 0 } },
    },
  ])('fails closed at an invalid web measurement boundary', (host) => {
    const complete = vi.fn();
    measureWebPaper(host, complete);
    expect(complete).toHaveBeenCalledExactlyOnceWith(null);
  });
});
