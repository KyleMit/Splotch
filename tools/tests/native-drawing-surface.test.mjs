// @vitest-environment happy-dom
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import {
  emptyDrawing,
  MAX_POINTS,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const native = vi.hoisted(() => ({ handlers: null, layout: null, width: 1024, height: 768 }));

vi.mock('react-native', () => ({
  findNodeHandle: (target) => target,
  PanResponder: {
    create(handlers) {
      native.handlers ??= handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: forwardRef(({ children, onLayout, pointerEvents }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        callback(0, 0, native.width, native.height, 40, 800);
      },
    }));
    if (onLayout) native.layout = onLayout;
    return createElement('div', { 'data-pointer-events': pointerEvents }, children);
  }),
}));

vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children, viewBox }, ref) =>
    createElement('div', { ref, 'data-viewbox': viewBox }, children)
  ),
  Rect: () => null,
  Circle: ({ cx, cy, fill, r }) =>
    createElement('span', {
      'data-ink': 'dot',
      'data-point': `${cx},${cy}`,
      'data-color': fill,
      'data-width': r * 2,
    }),
  Path: ({ d, stroke, strokeWidth }) =>
    createElement('span', {
      'data-ink': 'path',
      'data-path': d,
      'data-color': stroke,
      'data-width': strokeWidth,
    }),
}));

const PAPER_TARGET = {};

function touch(identifier, x, y) {
  return {
    identifier,
    locationX: x,
    locationY: y,
    pageX: x + 40,
    pageY: y + 800,
    target: PAPER_TARGET,
    timestamp: 100,
  };
}

function event(touches, changedTouches = touches) {
  const touchBank = Object.fromEntries(
    [...touches, ...changedTouches].map(({ identifier }) => [
      identifier,
      {
        startTimeStamp: 100,
        touchActive: touches.some((touch) => touch.identifier === identifier),
      },
    ])
  );
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: { touchBank, mostRecentTimeStamp: 100 },
  };
}

let root;
let container;
let props;

function render() {
  act(() => root.render(createElement(DrawingSurface, props)));
}

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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.width = 1024;
  native.height = 768;
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
  render();
  act(() => native.layout({ nativeEvent: { layout: { width: 1024, height: 768 } } }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('independent native contact responder wiring', () => {
  it('keeps both paths visible across interleaved lifts and commits one cohort at the final lift', () => {
    const a = touch('A', 10, 20);
    const b = touch('B', 80, 90);
    send('onPanResponderGrant', event([a], [a]));
    props = { ...props, color: 'Blue', brush: 'pencil' };
    render();
    send('onPanResponderStart', event([a, b], [b]));
    const movedA = touch('A', 30, 40);
    const movedB = touch('B', 100, 110);
    send('onPanResponderMove', event([movedA, movedB]));
    expect([...container.querySelectorAll('[data-path]')].map((ink) => ink.dataset.path)).toEqual([
      'M10 20 L30 40',
      'M80 90 L100 110',
    ]);
    send('onPanResponderEnd', event([movedA], [touch('B', 100.25, 110.25)]));
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true);
    expect(container.querySelectorAll('[data-ink]')).toHaveLength(2);
    send('onPanResponderMove', event([touch('A', 50, 60)]));
    send('onPanResponderEnd', event([], [touch('A', 50.25, 60.25)]));
    send('onPanResponderRelease', event([], [touch('A', 50.25, 60.25)]));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toEqual([
      {
        color: 'Purple',
        brush: 'marker',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 },
          { x: 50.25, y: 60.25 },
        ],
      },
      {
        color: 'Blue',
        brush: 'pencil',
        points: [
          { x: 80, y: 90 },
          { x: 100, y: 110 },
          { x: 100.25, y: 110.25 },
        ],
      },
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
    expect(props.onError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-viewbox]').dataset.viewbox).toBe('0 0 1024 768');
  });

  it('admits only the changed START contact while an older unknown contact is present at grant', () => {
    const a = touch('A', 10, 20);
    const b = touch('B', 30, 40);
    send('onPanResponderGrant', event([a, b], [a]));
    send('onPanResponderRelease', event([], [a, b]));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
  });

  it('reads admission capacity from current history instead of a stale rendered drawing', () => {
    const full = {
      version: 1,
      strokes: [
        {
          color: 'Purple',
          brush: 'marker',
          points: Array.from({ length: MAX_POINTS }, () => ({ x: 10, y: 20 })),
        },
      ],
    };
    props = { ...props, currentDrawing: () => full };
    render();
    send('onPanResponderGrant', event([touch('A', 30, 40)]));
    send('onPanResponderRelease', event([], [touch('A', 50, 60)]));
    expect(props.onError).toHaveBeenCalledTimes(1);
    expect(props.onError.mock.calls[0][0].message).toContain('picture is full');
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.drawing.strokes).toEqual([]);
  });

  it('commits every accepted contact on termination once and accepts a fresh gesture', () => {
    const touches = [touch('A', 10, 20), touch('B', 30, 40)];
    send('onPanResponderGrant', event(touches));
    send('onPanResponderTerminate');
    send('onPanResponderEnd', event([], touches));
    send('onPanResponderRelease', event([], touches));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
    send('onPanResponderGrant', event([touch('A', 100, 200)]));
    send('onPanResponderRelease', event([], [touch('A', 110, 210)]));
    expect(props.onCohort).toHaveBeenCalledTimes(2);
    expect(props.onCohort.mock.calls[1][0][0].points).toEqual([
      { x: 100, y: 200 },
      { x: 110, y: 210 },
    ]);
  });

  it('preserves active and already lifted ink on teardown without a duplicate terminal commit', () => {
    const touches = [touch('A', 10, 20), touch('B', 30, 40)];
    send('onPanResponderGrant', event(touches));
    send('onPanResponderEnd', event([touches[1]], [touches[0]]));
    act(() => root.render(null));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('keeps paper as the hit boundary over existing SVG ink while excluding control origins', () => {
    props = {
      ...props,
      drawing: {
        version: 1,
        strokes: [
          {
            color: 'Blue',
            brush: 'pencil',
            points: [
              { x: 10, y: 20 },
              { x: 30, y: 40 },
            ],
          },
        ],
      },
    };
    render();
    const paper = container.querySelector('[data-pointer-events="box-only"]');
    expect(paper).not.toBeNull();
    expect(paper.querySelector('[data-ink="path"]')).not.toBeNull();
    const a = touch('A', 10, 20);
    const b = touch('B', 30, 40);
    const control = { ...touch('UI', 50, 60), target: 'control' };
    send('onPanResponderGrant', event([a]));
    send('onPanResponderStart', event([a, b, control], [b, control]));
    send('onPanResponderRelease', event([], [a, b, control]));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points[0])).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('keeps an additional control-origin contact out of ink while paper contacts continue', () => {
    const a = touch('A', 10, 20);
    const control = { ...touch('UI', 30, 40), target: 'control' };
    send('onPanResponderGrant', event([a]));
    send('onPanResponderStart', event([a, control], [control]));
    send(
      'onPanResponderMove',
      event([touch('A', 50, 60), { ...control, locationX: 100, locationY: 200 }])
    );
    send('onPanResponderEnd', event([touch('A', 50, 60)], [control]));
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true);
    send('onPanResponderRelease', event([], [touch('A', 70, 80)]));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toEqual([
      {
        color: 'Purple',
        brush: 'marker',
        points: [
          { x: 10, y: 20 },
          { x: 50, y: 60 },
          { x: 70, y: 80 },
        ],
      },
    ]);
  });

  it('ignores empty-touch hover and keeps pressure out of captured ink width', () => {
    send('onPanResponderMove', event([]));
    expect(container.querySelectorAll('[data-ink]')).toHaveLength(0);
    const a = { ...touch('A', 10, 20), force: 0.1 };
    send('onPanResponderGrant', event([a]));
    send('onPanResponderMove', event([{ ...touch('A', 30, 40), force: 1 }]));
    expect(container.querySelector('[data-ink]').dataset.width).toBe('22');
    send('onPanResponderRelease', event([], [{ ...touch('A', 50, 60), force: 0.5 }]));
    expect(props.onCohort.mock.calls[0][0]).toEqual([
      {
        color: 'Purple',
        brush: 'marker',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 },
        ],
      },
    ]);
  });

  it('drains accepted ink when release has an empty terminal contact list', () => {
    send('onPanResponderGrant', event([touch('A', 10, 20), touch('B', 30, 40)]));
    send('onPanResponderRelease', event([], []));
    send('onPanResponderRelease', event([], []));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it('ends a paper cohort even when a foreign control contact remains on screen', () => {
    const a = touch('A', 10, 20);
    const control = { ...touch('UI', 30, 40), target: 'control' };
    send('onPanResponderGrant', event([a]));
    send('onPanResponderStart', event([a, control], [control]));
    send('onPanResponderEnd', event([control], [a]));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(1);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
    send('onPanResponderRelease', event([], [control]));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('bounds delivered outside and re-entry samples without claiming gap segmentation', () => {
    send('onPanResponderGrant', event([touch('A', 10, 20)]));
    send('onPanResponderMove', event([touch('A', -100, 900)]));
    send('onPanResponderRelease', event([], [touch('A', 30, 40)]));
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 0, y: 768 },
      { x: 30, y: 40 },
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false);
  });

  it('refuses new contacts while disabled', () => {
    props = { ...props, disabled: true };
    render();
    expect(native.handlers.onStartShouldSetPanResponder()).toBe(false);
    send('onPanResponderGrant', event([touch('A', 10, 20), touch('B', 30, 40)]));
    send('onPanResponderRelease', event([]));
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-ink]')).toHaveLength(0);
  });
});
