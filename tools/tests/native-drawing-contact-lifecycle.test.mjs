// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const native = vi.hoisted(() => ({ handlers: null, layout: null }));

vi.mock('react-native', () => ({
  findNodeHandle: (target) => target,
  PanResponder: {
    create(handlers) {
      native.handlers ??= handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles },
  View({ children, onLayout }) {
    if (onLayout) native.layout = onLayout;
    return createElement('div', null, children);
  },
}));

vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children }, ref) => createElement('div', { ref }, children)),
  Rect: () => null,
  Circle: ({ cx, cy }) => createElement('span', { 'data-ink': `${cx},${cy}` }),
  Path: ({ d }) => createElement('span', { 'data-ink': d }),
}));

const PAPER_TARGET = 101;

function touch(identifier, x, y, timestamp = 100) {
  return {
    identifier,
    locationX: x,
    locationY: y,
    pageX: x + 40,
    pageY: y + 800,
    target: PAPER_TARGET,
    timestamp,
  };
}

function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const item of [...touches, ...changedTouches]) {
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
  }
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

function send(callback, input, followStart = true) {
  act(() => {
    native.handlers[callback](input);
    if (
      followStart &&
      callback === 'onPanResponderGrant' &&
      input.nativeEvent.changedTouches.some(
        (touch) =>
          input.touchHistory?.touchBank?.[touch.identifier]?.startTimeStamp === touch.timestamp
      )
    )
      native.handlers.onPanResponderStart(input);
  });
}

function layout(width = 1024, height = 768) {
  act(() => native.layout({ nativeEvent: { layout: { width, height } } }));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.handlers = null;
  native.layout = null;
  container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  root = createRoot(container);
  props = {
    drawing: emptyDrawing(),
    currentDrawing: () => props.drawing,
    color: 'Purple',
    brush: 'marker',
    disabled: false,
    onCohort: vi.fn(),
    onDrawingChange: vi.fn(),
    onError: vi.fn(),
  };
  act(() => root.render(createElement(DrawingSurface, props)));
  layout();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('mounted Fabric contact lifetimes and Android admission', () => {
  it('keeps one Undo entry and a continuous survivor through partial End, Release and regrant', () => {
    let history = createHistory();
    props.currentDrawing = () => history.drawing;
    props.onCohort.mockImplementation((strokes) => {
      history = addStrokes(history, strokes);
    });
    const a = touch(0, 10, 20);
    const b = touch(1, 80, 90, 200);
    send('onPanResponderGrant', event([a]));
    send('onPanResponderStart', event([touch(0, 10, 20, 200), b], [b], { 0: 100 }));
    const partial = event([touch(0, 30, 40, 300)], [touch(1, 100, 110, 300)], { 0: 100, 1: 200 });
    send('onPanResponderEnd', partial);
    send('onPanResponderRelease', partial);
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true);
    const regrant = event([touch(0, 50, 60, 400)], undefined, { 0: 100 });
    send('onPanResponderGrant', regrant);
    send('onPanResponderMove', regrant);
    send('onPanResponderMove', event([touch(0, 70, 80, 500)], undefined, { 0: 100 }));
    const final = event([], [touch(0, 90, 100, 600)], { 0: 100 });
    send('onPanResponderEnd', final);
    send('onPanResponderRelease', final);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(history.drawing.strokes.map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
        { x: 70, y: 80 },
        { x: 90, y: 100 },
      ],
      [
        { x: 80, y: 90 },
        { x: 100, y: 110 },
      ],
    ]);
    expect(history.undo).toHaveLength(1);
    expect(undoDrawing(history).drawing).toEqual(emptyDrawing());
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it.each(['Move', 'End'])(
    'retains a copied regrant point when PanResponder suppresses its Move until the next %s',
    (next) => {
      send('onPanResponderGrant', event([touch(0, 10, 20), touch(1, 80, 90)]));
      const partial = event([touch(0, 30, 40, 200)], [touch(1, 100, 110, 200)], { 0: 100, 1: 100 });
      send('onPanResponderEnd', partial);
      send('onPanResponderRelease', partial);
      const regrant = event([touch(0, 50, 60, 300)], undefined, { 0: 100 });
      send('onPanResponderGrant', regrant);
      regrant.nativeEvent.touches[0].locationX = 999;
      if (next === 'Move')
        send('onPanResponderMove', event([touch(0, 70, 80, 400)], undefined, { 0: 100 }));
      send('onPanResponderEnd', event([], [touch(0, 90, 100, 500)], { 0: 100 }));
      expect(props.onCohort).toHaveBeenCalledTimes(1);
      expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
        ...(next === 'Move' ? [{ x: 70, y: 80 }] : []),
        { x: 90, y: 100 },
      ]);
    }
  );

  it('rejects a shared-target Android control origin for its entire lifetime through entry and later starts', () => {
    const a = touch(0, 10, 20);
    const control = touch(1, -80, 900, 200);
    send('onPanResponderGrant', event([a]));
    send('onPanResponderStart', event([touch(0, 10, 20, 200), control], [control], { 0: 100 }));
    const entered = touch(1, 100, 200, 300);
    send(
      'onPanResponderMove',
      event([touch(0, 30, 40, 300), entered], undefined, { 0: 100, 1: 200 })
    );
    const c = touch(2, 50, 60, 400);
    send(
      'onPanResponderStart',
      event([touch(0, 30, 40, 400), touch(1, 100, 200, 400), c], [c], { 0: 100, 1: 200 })
    );
    send(
      'onPanResponderRelease',
      event([], [touch(0, 70, 80, 500), touch(1, 200, 300, 500), touch(2, 90, 100, 500)], {
        0: 100,
        1: 200,
        2: 400,
      })
    );
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 70, y: 80 },
      ],
      [
        { x: 50, y: 60 },
        { x: 90, y: 100 },
      ],
    ]);
    expect(props.onError).not.toHaveBeenCalled();
  });

  it('accepts paper bounds while rejecting a control-first contact with the same numeric target', () => {
    const control = touch(0, 200, -30);
    const paper = touch(1, 0, 768);
    send('onPanResponderGrant', event([control, paper], [paper]));
    send('onPanResponderRelease', event([], [control, paper]));
    expect(props.onCohort.mock.calls[0][0]).toEqual([
      { color: 'Purple', brush: 'marker', points: [{ x: 0, y: 768 }] },
    ]);
  });

  it('retains an ignored origin after all ink lifts and a fresh paper contact regrants', () => {
    const a = touch(0, 10, 20);
    const control = touch(1, 200, -30);
    send('onPanResponderGrant', event([a, control]));
    send(
      'onPanResponderEnd',
      event([touch(1, 100, 200, 200)], [touch(0, 30, 40, 200)], { 0: 100, 1: 100 })
    );
    send(
      'onPanResponderRelease',
      event([touch(1, 100, 200, 200)], [touch(0, 30, 40, 200)], { 0: 100, 1: 100 })
    );
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    const fresh = touch(2, 50, 60, 300);
    const regrant = event([touch(1, 100, 200, 300), fresh], [fresh], { 1: 100 });
    send('onPanResponderGrant', regrant);
    send('onPanResponderStart', regrant);
    send(
      'onPanResponderRelease',
      event([], [touch(1, 300, 400, 400), touch(2, 70, 80, 400)], { 1: 100, 2: 300 })
    );
    expect(props.onCohort).toHaveBeenCalledTimes(2);
    expect(props.onCohort.mock.calls.map(([strokes]) => strokes.length)).toEqual([1, 1]);
    expect(props.onCohort.mock.calls[1][0][0].points).toEqual([
      { x: 50, y: 60 },
      { x: 70, y: 80 },
    ]);
  });

  it.each([0, 1])(
    'closes a missed final lift before a fresh gesture with native ID %s',
    (identifier) => {
      send('onPanResponderGrant', event([touch(0, 10, 20)]));
      const fresh = touch(identifier, 100, 200, 300);
      send('onPanResponderGrant', event([fresh]));
      expect(props.onCohort).toHaveBeenCalledTimes(1);
      expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
      send(
        'onPanResponderRelease',
        event([], [touch(identifier, 110, 210, 400)], { [identifier]: 300 })
      );
      expect(props.onCohort).toHaveBeenCalledTimes(2);
      expect(props.onCohort.mock.calls[1][0][0].points).toEqual([
        { x: 100, y: 200 },
        { x: 110, y: 210 },
      ]);
    }
  );

  it('separates a reused ID whose lift was missed while another contact survives', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20), touch(1, 30, 40)]));
    send('onPanResponderRelease', event([touch(0, 50, 60, 200)], [], { 0: 100 }));
    expect(props.onCohort).not.toHaveBeenCalled();
    const reused = touch(1, 100, 200, 300);
    const regrant = event([touch(0, 70, 80, 300), reused], [reused], { 0: 100 });
    send('onPanResponderGrant', regrant);
    send('onPanResponderStart', regrant);
    send(
      'onPanResponderRelease',
      event([], [touch(0, 90, 100, 400), touch(1, 110, 210, 400)], { 0: 100, 1: 300 })
    );
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 50, y: 60 },
        { x: 70, y: 80 },
        { x: 90, y: 100 },
      ],
      [{ x: 30, y: 40 }],
      [
        { x: 100, y: 200 },
        { x: 110, y: 210 },
      ],
    ]);
  });

  it('separates a missed final lift and reused native ID even when the next START timestamp collides', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    const fresh = event([touch(0, 100, 200)]);
    send('onPanResponderGrant', fresh, false);
    expect(container.querySelector('[data-ink]').dataset.ink).toBe('10,20');
    send('onPanResponderStart', fresh);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
    send('onPanResponderRelease', event([], [touch(0, 110, 210, 200)], { 0: 100 }));
    expect(props.onCohort).toHaveBeenCalledTimes(2);
    expect(props.onCohort.mock.calls[1][0][0].points).toEqual([
      { x: 100, y: 200 },
      { x: 110, y: 210 },
    ]);
  });

  it('keeps a survivor while a real START reuses another active ID with the same timestamp', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20), touch(1, 30, 40)]));
    const fresh = event([touch(0, 50, 60), touch(1, 100, 200)], [touch(1, 100, 200)]);
    send('onPanResponderGrant', fresh);
    send('onPanResponderStart', fresh);
    expect(props.onCohort).not.toHaveBeenCalled();
    send(
      'onPanResponderRelease',
      event([], [touch(0, 70, 80, 200), touch(1, 110, 210, 200)], { 0: 100, 1: 100 })
    );
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 50, y: 60 },
        { x: 70, y: 80 },
      ],
      [{ x: 30, y: 40 }],
      [
        { x: 100, y: 200 },
        { x: 110, y: 210 },
      ],
    ]);
  });

  it.each([
    undefined,
    null,
    {},
    { touchBank: null },
    { touchBank: [{ startTimeStamp: 100 }] },
    { touchBank: [{ startTimeStamp: 100, touchActive: false }], mostRecentTimeStamp: 100 },
    { touchBank: [{ startTimeStamp: NaN, touchActive: true }], mostRecentTimeStamp: 100 },
    { touchBank: [{ startTimeStamp: Infinity, touchActive: true }], mostRecentTimeStamp: 100 },
    { touchBank: [{ startTimeStamp: -1, touchActive: true }], mostRecentTimeStamp: 100 },
    { touchBank: [{ startTimeStamp: '100', touchActive: true }], mostRecentTimeStamp: 100 },
    { touchBank: [{ startTimeStamp: 200, touchActive: true }], mostRecentTimeStamp: 100 },
    { touchBank: [{ startTimeStamp: 100, touchActive: true }], mostRecentTimeStamp: NaN },
  ])(
    'fails closed on malformed history %j without admitting it on a later valid regrant',
    (touchHistory) => {
      const first = event([touch(0, 10, 20)]);
      first.touchHistory = touchHistory;
      send('onPanResponderGrant', first);
      send('onPanResponderGrant', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }));
      send('onPanResponderRelease', event([], [touch(0, 50, 60, 300)], { 0: 100 }));
      expect(props.onCohort).not.toHaveBeenCalled();
      expect(container.querySelectorAll('[data-ink]')).toHaveLength(0);
      expect(props.onError).toHaveBeenCalledTimes(1);
      send('onPanResponderGrant', event([touch(0, 70, 80, 400)]));
      send('onPanResponderRelease', event([], [touch(0, 90, 100, 500)], { 0: 400 }));
      expect(props.onCohort).toHaveBeenCalledTimes(1);
      expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
        { x: 70, y: 80 },
        { x: 90, y: 100 },
      ]);
    }
  );

  it('drains accepted ink once when history becomes unavailable and refuses the ambiguous surviving lifetime', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    const malformed = event([touch(0, 30, 40, 200)]);
    malformed.touchHistory = null;
    send('onPanResponderMove', malformed);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
    send('onPanResponderGrant', event([touch(0, 50, 60, 300)], undefined, { 0: 100 }));
    send('onPanResponderRelease', event([], [touch(0, 70, 80, 400)], { 0: 100 }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onError).toHaveBeenCalledTimes(1);
  });

  it('does not infer an unseen contact origin from a later move or changed layout', () => {
    send('onPanResponderGrant', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }));
    send('onPanResponderRelease', event([], [touch(0, 50, 60, 300)], { 0: 100 }));
    expect(props.onCohort).not.toHaveBeenCalled();
    send('onPanResponderGrant', event([touch(1, 70, 80, 400)]));
    layout(512, 384);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    send('onPanResponderGrant', event([touch(1, 90, 100, 500)], undefined, { 1: 400 }));
    send('onPanResponderRelease', event([], [touch(1, 110, 120, 600)], { 1: 400 }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    send('onPanResponderGrant', event([touch(1, 100, 100, 700)]));
    send('onPanResponderRelease', event([], [touch(1, 110, 110, 800)], { 1: 700 }));
    expect(props.onCohort).toHaveBeenCalledTimes(2);
    expect(props.onCohort.mock.calls[1][0][0].points).toEqual([
      { x: 200, y: 200 },
      { x: 220, y: 220 },
    ]);
  });

  it('does not admit an unseen stationary older contact when a different contact starts', () => {
    const older = touch(0, 10, 20, 100);
    const fresh = touch(1, 30, 40, 200);
    send('onPanResponderGrant', event([older, fresh], [fresh]));
    send(
      'onPanResponderRelease',
      event([], [touch(0, 50, 60, 300), touch(1, 70, 80, 300)], { 0: 100, 1: 200 })
    );
    expect(props.onCohort.mock.calls[0][0]).toEqual([
      {
        color: 'Purple',
        brush: 'marker',
        points: [
          { x: 30, y: 40 },
          { x: 70, y: 80 },
        ],
      },
    ]);
  });

  it('deduplicates Grant plus Start and flushes true termination or unmount exactly once', () => {
    const first = event([touch(0, 10, 20)]);
    send('onPanResponderGrant', first);
    send('onPanResponderStart', first);
    send('onPanResponderTerminate');
    send('onPanResponderRelease', event([], [touch(0, 30, 40, 200)], { 0: 100 }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(1);
    send('onPanResponderGrant', event([touch(0, 50, 60, 300), touch(1, 70, 80, 300)]));
    const partial = event([touch(0, 90, 100, 400)], [touch(1, 110, 120, 400)], { 0: 300, 1: 300 });
    send('onPanResponderEnd', partial);
    send('onPanResponderRelease', partial);
    act(() => root.render(null));
    expect(props.onCohort).toHaveBeenCalledTimes(2);
    expect(props.onCohort.mock.calls[1][0]).toHaveLength(2);
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(2);
  });

  it('flushes the actual cancel End then Terminate sequence once', () => {
    const first = event([touch(0, 10, 20), touch(1, 30, 40)]);
    send('onPanResponderGrant', first);
    send('onPanResponderStart', first);
    send(
      'onPanResponderEnd',
      event([], [touch(0, 50, 60, 200), touch(1, 70, 80, 200)], { 0: 100, 1: 100 })
    );
    send('onPanResponderTerminate');
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 50, y: 60 },
      ],
      [
        { x: 30, y: 40 },
        { x: 70, y: 80 },
      ],
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it('does not append a terminal coordinate belonging to a different unobserved lifetime', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    send('onPanResponderMove', event([touch(0, 30, 40, 150)], undefined, { 0: 100 }));
    send('onPanResponderEnd', event([], [touch(0, 100, 200, 300)], { 0: 200 }));
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });
});
