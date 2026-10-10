// @vitest-environment happy-dom
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const native = vi.hoisted(() => ({ handlers: null, paper: null, layout: null }));

vi.mock('react-native', () => ({
  findNodeHandle: (target) => target,
  PanResponder: {
    create(handlers) {
      native.handlers ??= handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: forwardRef(({ children, onLayout, onTouchEnd, onTouchCancel }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        callback(0, 0, 1024, 768, 40, 800);
      },
    }));
    if (onLayout) {
      native.layout = onLayout;
      native.paper = { onTouchEnd, onTouchCancel };
    }
    return createElement('div', null, children);
  }),
}));

vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: forwardRef(({ children }, ref) => createElement('div', { ref }, children)),
    G: group,
    Defs: group,
    Mask: group,
    Pattern: group,
    Filter: group,
    LinearGradient: group,
    Rect: () => null,
    Circle: () => null,
    Path: () => null,
    Stop: () => null,
    Use: () => null,
    FeBlend: () => null,
    FeComposite: () => null,
  };
});

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
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank: Object.fromEntries(
        [...touches, ...changedTouches].map((item) => [
          item.identifier,
          {
            startTimeStamp: starts[item.identifier] ?? item.timestamp,
            touchActive: touches.some(({ identifier }) => identifier === item.identifier),
          },
        ])
      ),
      mostRecentTimeStamp: Math.max(
        0,
        ...[...touches, ...changedTouches].map(({ timestamp }) => timestamp)
      ),
    },
  };
}

function send(callback, input) {
  act(() => {
    native.handlers[callback](input);
    if (callback === 'onPanResponderGrant') native.handlers.onPanResponderStart(input);
  });
}

function raw(callback, touches, changedTouches = touches) {
  act(() =>
    native.paper[callback]?.({
      currentTarget: PAPER_TARGET,
      nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    })
  );
}

function partialRelease() {
  send('onPanResponderGrant', event([touch(0, 10, 20), touch(1, 80, 90)]));
  const partial = event([touch(1, 80, 90, 200)], [touch(0, 30, 40, 200)], { 0: 100, 1: 100 });
  send('onPanResponderEnd', partial);
  send('onPanResponderRelease', partial);
}

let root;
let container;
let props;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.handlers = null;
  native.paper = null;
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
    onPreparingChange: vi.fn(),
    onRendererFault: vi.fn(),
  };
  act(() => root.render(createElement(DrawingSurface, props)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('raw terminal events after Fabric releases its responder', () => {
  it('commits the stationary survivor without a move, regrant or responder terminal callback', () => {
    const baseline = {
      ...emptyDrawing(),
      strokes: [{ color: 'Blue', brush: 'pencil', points: [{ x: 1, y: 2 }] }],
    };
    let history = createHistory(baseline);
    props.currentDrawing = () => history.drawing;
    props.onCohort.mockImplementation((strokes) => {
      history = addStrokes(history, strokes);
    });
    partialRelease();
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true);
    raw('onTouchEnd', [], [touch(1, 80, 90, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(history.drawing.strokes.slice(1).map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      [{ x: 80, y: 90 }],
    ]);
    expect(history.undo).toHaveLength(1);
    expect(undoDrawing(history).drawing).toEqual(baseline);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
    expect(props.onError).not.toHaveBeenCalled();
  });

  it('waits through partial raw lifts until every remaining touch has lifted', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20), touch(1, 30, 40), touch(2, 50, 60)]));
    const partial = event([touch(1, 30, 40, 200), touch(2, 50, 60, 200)], [touch(0, 10, 20, 200)], {
      0: 100,
      1: 100,
      2: 100,
    });
    send('onPanResponderEnd', partial);
    send('onPanResponderRelease', partial);
    raw('onTouchEnd', [touch(1, 30, 40, 200), touch(2, 50, 60, 200)], [touch(0, 10, 20, 200)]);
    raw('onTouchEnd', [touch(2, 50, 60, 300)], [touch(1, 30, 40, 300)]);
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true);
    raw('onTouchEnd', [], [touch(2, 50, 60, 400)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(3);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it('flushes a raw cancellation after partial release without adopting its unproven coordinates', () => {
    partialRelease();
    raw('onTouchCancel', [touch(1, 500, 600, 300)], [touch(1, 500, 600, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][1].points).toEqual([{ x: 80, y: 90 }]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
    raw('onTouchEnd', [], [touch(1, 500, 600, 300)]);
    send('onPanResponderTerminate');
    act(() => root.render(null));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('ends accepted ink when only an ignored control-origin contact remains', () => {
    const control = touch(2, -80, 900);
    send('onPanResponderGrant', event([touch(0, 10, 20), touch(1, 80, 90), control]));
    const partial = event(
      [touch(1, 80, 90, 200), touch(2, -80, 900, 200)],
      [touch(0, 30, 40, 200)],
      { 0: 100, 1: 100, 2: 100 }
    );
    send('onPanResponderEnd', partial);
    send('onPanResponderRelease', partial);
    raw('onTouchEnd', [touch(2, -80, 900, 300)], [touch(1, 80, 90, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
    raw('onTouchEnd', [], [touch(2, 700, 710, 400)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a responder commit when the same final end bubbles afterward', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    const final = event([], [touch(0, 30, 40, 200)], { 0: 100 });
    send('onPanResponderEnd', final);
    send('onPanResponderRelease', final);
    raw('onTouchEnd', [], final.nativeEvent.changedTouches);
    raw('onTouchCancel', [], final.nativeEvent.changedTouches);
    act(() => root.render(null));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it('leaves a raw-first web terminal event to its held responder so the endpoint is retained', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    const final = event([], [touch(0, 30, 40, 200)], { 0: 100 });
    raw('onTouchEnd', [], final.nativeEvent.changedTouches);
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true);
    send('onPanResponderEnd', final);
    send('onPanResponderRelease', final);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it('closes only proven ink at a raw final lift and never admits a raw changed contact', () => {
    partialRelease();
    raw('onTouchEnd', [], [touch(1, 500, 600, 300), touch(2, 700, 710, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      [{ x: 80, y: 90 }],
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it('does not duplicate geometry invalidation when a raw final end arrives afterward', () => {
    partialRelease();
    act(() => native.layout({ nativeEvent: { layout: { width: 1024, height: 768 } } }));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    raw('onTouchEnd', [], [touch(1, 80, 90, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });
});
