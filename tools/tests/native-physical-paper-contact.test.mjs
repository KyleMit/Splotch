import { describe, expect, it, vi } from 'vitest';
import { createContactResponder } from '../../experiments/native-architecture/src/drawing/contactResponder.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { semanticWidth } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  createSecondTouchPress,
  createSecondTouchRoutes,
  nativePressFrame,
} from '../../experiments/native-architecture/src/rsdDrawing/secondTouchPress.ts';
vi.mock('react-native', () => ({ findNodeHandle: (target) => target }));
const TARGET = {};
function touch(identifier, x, y, timestamp) {
  return { identifier, pageX: x, pageY: y, timestamp, target: TARGET };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const item of [...touches, ...changedTouches])
    touchBank[item.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === item.identifier),
      startTimeStamp: starts[item.identifier] ?? item.timestamp,
    };
  return {
    persist() {},
    currentTarget: TARGET,
    nativeEvent: { touches, changedTouches, target: TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(0, ...[...touches, ...changedTouches].map((t) => t.timestamp)),
    },
  };
}
function fixture(overrides = {}) {
  let history = createHistory();
  let frame = { width: 342, height: 256.5, pageX: 0, pageY: 0 };
  let ratio = 3;
  const pixelRatio = vi.fn(() => ratio);
  const drafts = vi.fn();
  const failure = vi.fn();
  const commit = vi.fn((strokes, paper) => {
    history = addStrokes(history, strokes, paper);
  });
  const input = createContactResponder(
    () => ({
      currentDrawing: () => history.drawing,
      color: 'Red',
      brush: 'crayon',
      strokeWidth: 'extraThick',
      eraserWidth: 'extraThick',
      disabled: false,
      onCohort: commit,
      onDrawingChange: vi.fn(),
      onError: failure,
      ...overrides,
    }),
    () => frame,
    drafts,
    pixelRatio
  );
  function start(item) {
    const next = event([item]);
    input.grant(next);
    input.start(next);
  }
  return {
    input,
    drafts,
    failure,
    commit,
    pixelRatio,
    start,
    history: () => history,
    resize: () => {
      frame = { ...frame, width: 760, height: 570 };
      ratio = 1;
    },
  };
}

describe('normal contact adoption owner', () => {
  it('rejects nonfinite and disconnected native chrome bounds before paper admission', () => {
    expect(nativePressFrame(null)).toBeNull();
    for (const frame of [
      { x: 0, y: 0, width: Infinity, height: 20 },
      { x: NaN, y: 0, width: 20, height: 20 },
      { x: 0, y: 0, width: 0, height: 20 },
    ])
      expect(nativePressFrame({ getBoundingClientRect: () => frame })).toBeNull();
    const frame = { x: 10, y: 20, width: 30, height: 40 };
    expect(nativePressFrame({ getBoundingClientRect: () => frame })).toEqual(frame);
  });

  it('routes a secondary chrome contact outside paper admission even when Android targets the paper', () => {
    const routes = createSecondTouchRoutes();
    const press = vi.fn();
    const frame = { x: 40, y: 40, width: 20, height: 20 };
    const secondary = createSecondTouchPress({
      enabled: () => true,
      measure: (done) => done(frame),
      pressIn() {},
      pressOut() {},
      press,
    });
    routes.register({ ...secondary, bounds: () => frame, priority: 'control' });
    const f = fixture({ isChromeTouch: routes.contains });
    const first = touch('paper', 10, 20, 100);
    f.start(first);
    const chrome = touch('chrome', 50, 50, 200);
    const down = event([first, chrome], [chrome], { paper: 100, chrome: 200 });
    routes.start(down);
    f.input.start(down);
    expect(f.drafts.mock.calls.at(-1)[0]).toHaveLength(1);
    expect(f.input.hasActive()).toBe(true);
    const lift = event([first], [touch('chrome', 50, 50, 300)], { paper: 100, chrome: 200 });
    f.input.end(lift);
    routes.end(lift);
    expect(press).toHaveBeenCalledTimes(1);
    f.input.release(event([], [touch('paper', 30, 40, 400)], { paper: 100 }));
    expect(f.history().drawing.strokes).toHaveLength(1);
    expect(f.commit).toHaveBeenCalledTimes(1);
  });

  it('adopts measured content and capped actual PixelRatio before live ink and commits them atomically', () => {
    const f = fixture();
    f.start(touch('a', 171, 128.25, 1));
    const [strokes, paper] = f.drafts.mock.calls.at(-1);
    expect(strokes[0].points).toEqual([{ x: 512, y: 384 }]);
    expect(paper).toEqual({ kind: 'adopted', cssWidth: 342, cssHeight: 256.5, backingScale: 2 });
    expect((semanticWidth(strokes[0].width, paper) * 342) / 1024).toBeCloseTo(22, 12);
    expect(f.history().drawing).toEqual(emptyDrawing());
    f.input.release(event([], [touch('a', 200, 128.25, 2)], { a: 1 }));
    expect(f.history().drawing.paper).toBe(paper);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.pixelRatio).toHaveBeenCalledTimes(1);
    expect(f.failure).not.toHaveBeenCalled();
  });

  it('retains live adoption through reflow and later locked-picture contacts', () => {
    const f = fixture();
    f.start(touch('a', 171, 128.25, 1));
    const paper = f.drafts.mock.calls.at(-1)[1];
    f.resize();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.history().drawing).toEqual(emptyDrawing());
    expect(f.drafts.mock.calls.at(-1)[1]).toBe(paper);
    f.input.release(event([], [touch('a', 380, 285, 2)], { a: 1 }));
    expect(f.history().drawing.paper).toBe(paper);
    f.start(touch('b', 380, 285, 3));
    expect(f.drafts.mock.calls.at(-1)[1]).toBe(paper);
    f.input.release(event([], [touch('b', 400, 285, 4)], { b: 3 }));
    expect(f.pixelRatio).toHaveBeenCalledTimes(1);
    expect(f.history().drawing.strokes).toHaveLength(2);
    expect(f.history().undo).toHaveLength(2);
  });

  it('ignores a touch outside the actual content owner without adopting or committing', () => {
    const f = fixture();
    f.start(touch('outside', 343, 128, 1));
    f.input.interrupt();
    expect(f.pixelRatio).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.history().drawing.paper).toEqual({ kind: 'unadopted' });
  });
});
