// @vitest-environment happy-dom
import { act, createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import {
  addStrokes,
  createHistory,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createPaperScroll } from '../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { measurePaper as measureWebPaper } from '../../experiments/native-architecture/src/drawing/measurePaper.web.ts';

const native = vi.hoisted(() => ({
  handlers: null,
  layout: null,
  frame: [],
  autoMeasure: true,
  measurements: [],
  scroll: null,
}));
vi.mock('react-native', () => ({
  ActivityIndicator: () => null,
  Modal: () => null,
  Pressable: ({ children }) => createElement('div', null, children),
  Text: ({ children }) => createElement('span', null, children),
  SafeAreaView: ({ children }) => createElement('div', null, children),
  ScrollView: ({ children, onScroll }) => {
    if (onScroll) native.scroll = onScroll;
    return createElement('div', null, children);
  },
  findNodeHandle: (target) => target,
  PanResponder: {
    create(handlers) {
      native.handlers ??= handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: forwardRef(({ children, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        native.measurements.push(callback);
        if (native.autoMeasure) callback(...native.frame);
      },
    }));
    if (onLayout) native.layout = onLayout;
    return createElement('div', null, children);
  }),
}));
vi.mock('../../experiments/native-architecture/src/useDrawingScreen.ts', () => ({
  useDrawingScreen: () => ({
    history,
    setHistory: vi.fn(),
    color: props.color,
    setColor: vi.fn(),
    brush: props.brush,
    setBrush: vi.fn(),
    drawing: false,
    setDrawing: props.onDrawingChange,
    busy: false,
    notice: '',
    pictures: null,
    setPictures: vi.fn(),
    surface,
    disabled: false,
    report: props.onError,
    currentDrawing: props.currentDrawing,
    finishCohort: props.onCohort,
    save: vi.fn(),
    exportPicture: vi.fn(),
    showPictures: vi.fn(),
    openPicture: vi.fn(),
  }),
}));
vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children }, ref) => createElement('div', { ref }, children)),
  Rect: () => null,
  Circle: ({ cx, cy }) => createElement('span', { 'data-ink': `${cx},${cy}` }),
  Path: ({ d }) => createElement('span', { 'data-ink': d }),
}));
const PAPER_TARGET = 101;
const DENSITY = 2.75;
const BASELINE = {
  version: 1,
  strokes: [
    {
      color: 'Purple',
      brush: 'marker',
      points: [
        { x: 470.71, y: 192 },
        { x: 553.29, y: 192 },
      ],
    },
  ],
};
function touch(identifier, x, y, timestamp, shiftX = 0, shiftY = 0) {
  return {
    identifier,
    locationX: (x - 44 - shiftX) / DENSITY,
    locationY: (y - 814 - shiftY) / DENSITY,
    pageX: x / DENSITY,
    pageY: y / DENSITY,
    target: PAPER_TARGET,
    timestamp,
  };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const item of [...touches, ...changedTouches])
    touchBank[item.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === item.identifier),
      startTimeStamp: starts[item.identifier] ?? item.timestamp,
      startPageX: item.pageX,
      startPageY: item.pageY,
      currentPageX: item.pageX,
      currentPageY: item.pageY,
      currentTimeStamp: item.timestamp,
      previousPageX: item.pageX,
      previousPageY: item.pageY,
      previousTimeStamp: item.timestamp,
    };
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank,
      numberActiveTouches: touches.length,
      indexOfSingleActiveTouch: touches[0]?.identifier ?? -1,
      mostRecentTimeStamp: Math.max(
        0,
        ...[...touches, ...changedTouches].map(({ timestamp }) => timestamp)
      ),
    },
  };
}
let root;
let container;
let props;
let history;
let surface;
function send(callback, input) {
  act(() => {
    native.handlers[callback](input);
    if (
      callback === 'onPanResponderGrant' &&
      input.nativeEvent.changedTouches.some(
        (touch) =>
          input.touchHistory?.touchBank?.[touch.identifier]?.startTimeStamp === touch.timestamp
      )
    )
      native.handlers.onPanResponderStart(input);
  });
}
function layout() {
  act(() =>
    native.layout({
      nativeEvent: { layout: { x: 0, y: 0, width: native.frame[2], height: native.frame[3] } },
    })
  );
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(native, {
    handlers: null,
    layout: null,
    frame: [0, 0, 992 / DENSITY, 744 / DENSITY, 44 / DENSITY, 814 / DENSITY],
    autoMeasure: true,
    measurements: [],
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  history = addStrokes(createHistory(), BASELINE.strokes);
  props = {
    drawing: history.drawing,
    currentDrawing: () => history.drawing,
    color: 'Purple',
    brush: 'marker',
    disabled: false,
    onCohort: vi.fn((strokes) => {
      history = addStrokes(history, strokes);
    }),
    onDrawingChange: vi.fn(),
    onError: vi.fn(),
  };
  surface = createRef();
  act(() => root.render(createElement(DrawingSurface, { ...props, ref: surface })));
  layout();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

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

function pageTouch(identifier, pageX, pageY, timestamp, locationX = 1, locationY = 1) {
  return { identifier, locationX, locationY, pageX, pageY, target: PAPER_TARGET, timestamp };
}

function refresh() {
  act(() => surface.current.refreshGeometry());
}

describe('measured paper readiness and invalidation', () => {
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

  it('invalidates the real screen paper through its actual ScrollView callback', () => {
    native.frame = [0, 0, 1024, 768, 40, 800];
    native.handlers = null;
    act(() => root.render(createElement(DrawingScreen)));
    layout();
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
