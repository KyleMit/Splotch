import { describe, expect, it, vi } from 'vitest';
import { createContactResponder } from '../../experiments/native-architecture/src/drawing/contactResponder.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { semanticWidth } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
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
    currentTarget: TARGET,
    nativeEvent: { touches, changedTouches, target: TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(0, ...[...touches, ...changedTouches].map((t) => t.timestamp)),
    },
  };
}
function fixture() {
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
      input.resize();
      frame = { ...frame, width: 760, height: 570 };
      ratio = 1;
    },
  };
}

describe('normal contact adoption owner', () => {
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

  it('interrupts on resize and retains the same adoption for later locked-picture contacts', () => {
    const f = fixture();
    f.start(touch('a', 171, 128.25, 1));
    const paper = f.drafts.mock.calls.at(-1)[1];
    f.resize();
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
