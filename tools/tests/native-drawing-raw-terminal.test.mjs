import { paperProjection, drawingPaper } from '../../src/drawing/paperSpace.ts';
// @vitest-environment happy-dom
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import { legacyDrawing, createPaperInputView, paperInputPacket } from './native-paper-fixtures.mjs';
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../src/drawing/DrawingSurface.tsx';
import { addStrokes, createHistory, emptyDrawing, undoDrawing } from '../../src/drawing/model.ts';

const native = vi.hoisted(() => ({ input: null, sequence: 0, layout: null }));

vi.mock('react-native', () => {
  const View = forwardRef(({ children, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        callback(0, 0, 1024, 768, 40, 800);
      },
    }));
    if (onLayout) {
      native.layout = onLayout;
    }
    return createElement('div', null, children);
  });
  return {
    PixelRatio: { get: () => 1 },
    AccessibilityInfo: createAccessibilityInfoFixture(),
    useColorScheme: () => 'light',
    findNodeHandle: (target) => target,
    StyleSheet: { create: (styles) => styles },
    View,
    requireNativeComponent: (name) =>
      name === 'SplotchPaperInput'
        ? createPaperInputView(View, (emit) => {
            native.input = emit;
          })
        : View,
  };
});

vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: forwardRef(({ children, testID }, ref) =>
      createElement('div', { ref, 'data-testid': testID }, children)
    ),
    G: ({ children, transform }) => createElement('div', { 'data-transform': transform }, children),
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

function send(phase, value) {
  const previous = native.lastEvent;
  const input = value ?? {
    ...previous,
    nativeEvent: { ...previous.nativeEvent, changedTouches: previous.nativeEvent.touches },
  };
  const packet = paperInputPacket(phase, input, native.sequence++, {
    width: 1104,
    height: 1608,
    bottomInset: 0,
  });
  native.lastEvent = input;
  if (packet) act(() => native.input({ nativeEvent: packet }));
}

function terminal(phase, touches, changedTouches = touches) {
  const starts = Object.fromEntries(
    Object.entries(native.lastEvent?.touchHistory?.touchBank ?? {}).map(([id, entry]) => [
      id,
      entry.startTimeStamp,
    ])
  );
  send(phase, event(touches, changedTouches, starts));
}

function partialRelease() {
  send('start', event([touch(0, 10, 20), touch(1, 80, 90)]));
  const partial = event([touch(1, 80, 90, 200)], [touch(0, 30, 40, 200)], { 0: 100, 1: 100 });
  send('end', partial);
  send('end', partial);
}

let root;
let container;
let props;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.input = null;
  native.sequence = 0;
  native.lastEvent = null;
  native.layout = null;
  container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  root = createRoot(container);
  props = {
    drawing: emptyDrawing(),
    projection: paperProjection(drawingPaper(emptyDrawing())),
    currentDrawing: () => props.drawing,
    color: 'Purple',
    brush: 'pen',
    strokeWidth: 'medium',
    eraserWidth: 'medium',
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

function haloTransforms() {
  return [...container.querySelectorAll('[data-testid="pointer-halos"] > [data-transform]')].map(
    (halo) => halo.dataset.transform
  );
}

describe('native paper terminal packets', () => {
  it('drops the halo of a ended contact while a still contact keeps its own', () => {
    send('start', event([touch(0, 10, 20), touch(1, 30, 40), touch(2, 50, 60)]));
    expect(haloTransforms()).toHaveLength(3);
    const partial = event([touch(1, 30, 40, 200), touch(2, 50, 60, 200)], [touch(0, 10, 20, 200)], {
      0: 100,
      1: 100,
      2: 100,
    });
    send('end', partial);
    send('end', partial);
    expect(haloTransforms()).toHaveLength(2);
    terminal('end', [touch(2, 50, 60, 300)], [touch(1, 30, 40, 300)]);
    expect(haloTransforms()).toEqual(['translate(50 60) scale(1)']);
    terminal('end', [], [touch(2, 50, 60, 400)]);
    expect(haloTransforms()).toEqual([]);
  });

  it('commits the stationary survivor without another move or any responder callback', () => {
    const baseline = {
      ...legacyDrawing(),
      strokes: [{ color: 'Blue', brush: 'pencil', width: 7, points: [{ x: 1, y: 2 }] }],
    };
    let history = createHistory(baseline);
    props = {
      ...props,
      drawing: history.drawing,
      projection: paperProjection(drawingPaper(history.drawing)),
      currentDrawing: () => history.drawing,
    };
    act(() => root.render(createElement(DrawingSurface, props)));
    props.onCohort.mockImplementation((strokes, paper) => {
      history = addStrokes(history, strokes, paper);
    });
    partialRelease();
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true, expect.any(Object));
    terminal('end', [], [touch(1, 80, 90, 300)]);
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
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
    expect(props.onError).not.toHaveBeenCalled();
  });

  it('waits through partial native lifts until every remaining touch has lifted', () => {
    send('start', event([touch(0, 10, 20), touch(1, 30, 40), touch(2, 50, 60)]));
    const partial = event([touch(1, 30, 40, 200), touch(2, 50, 60, 200)], [touch(0, 10, 20, 200)], {
      0: 100,
      1: 100,
      2: 100,
    });
    send('end', partial);
    send('end', partial);
    terminal('end', [touch(1, 30, 40, 200), touch(2, 50, 60, 200)], [touch(0, 10, 20, 200)]);
    terminal('end', [touch(2, 50, 60, 300)], [touch(1, 30, 40, 300)]);
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true, expect.any(Object));
    terminal('end', [], [touch(2, 50, 60, 400)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(3);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
  });

  it('flushes a native cancellation after a partial lift without appending its coordinates', () => {
    partialRelease();
    terminal('cancel', [touch(1, 500, 600, 300)], [touch(1, 500, 600, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][1].points).toEqual([{ x: 80, y: 90 }]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
    terminal('end', [], [touch(1, 500, 600, 300)]);
    send('cancel');
    act(() => root.render(null));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('ends accepted ink when only an ignored control-origin contact remains', () => {
    const control = touch(2, -80, 900);
    send('start', event([touch(0, 10, 20), touch(1, 80, 90), control]));
    const partial = event(
      [touch(1, 80, 90, 200), touch(2, -80, 900, 200)],
      [touch(0, 30, 40, 200)],
      { 0: 100, 1: 100, 2: 100 }
    );
    send('end', partial);
    send('end', partial);
    terminal('end', [touch(2, -80, 900, 300)], [touch(1, 80, 90, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
    terminal('end', [], [touch(2, 700, 710, 400)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a cohort commit when a final packet repeats', () => {
    send('start', event([touch(0, 10, 20)]));
    const final = event([], [touch(0, 30, 40, 200)], { 0: 100 });
    send('end', final);
    send('end', final);
    terminal('end', [], final.nativeEvent.changedTouches);
    terminal('cancel', [], final.nativeEvent.changedTouches);
    act(() => root.render(null));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
  });

  it('accepts a final packet without waiting for a responder callback and preserves its endpoint', () => {
    send('start', event([touch(0, 10, 20)]));
    const final = event([], [touch(0, 30, 40, 200)], { 0: 100 });
    terminal('end', [], final.nativeEvent.changedTouches);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
    send('end', final);
    send('end', final);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
  });

  it('keeps a known contact endpoint and refuses an ended contact with no start', () => {
    partialRelease();
    terminal('end', [], [touch(1, 500, 600, 300), touch(2, 700, 710, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      [
        { x: 80, y: 90 },
        { x: 500, y: 600 },
      ],
    ]);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
  });

  it('retains the remaining contact through layout and commits its terminal packet only once', () => {
    partialRelease();
    act(() => native.layout({ nativeEvent: { layout: { width: 1024, height: 768 } } }));
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(true, expect.any(Object));
    terminal('end', [], [touch(1, 80, 90, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
    terminal('end', [], [touch(1, 80, 90, 300)]);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onDrawingChange).toHaveBeenLastCalledWith(false, null);
  });
});
