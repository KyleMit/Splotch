import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrawingAudio } from '../../experiments/native-architecture/src/audio/drawingAudio.ts';
import { createContactSound } from '../../experiments/native-architecture/src/audio/contactSound.ts';
import { createContactResponder } from '../../experiments/native-architecture/src/drawing/contactResponder.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

vi.mock('react-native', () => ({ findNodeHandle: (owner) => owner }));
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
async function fixture(brush = 'marker') {
  vi.useFakeTimers();
  const loop = { start: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
  const failure = vi.fn();
  const audio = createDrawingAudio(vi.fn().mockResolvedValue(loop), failure, vi.fn());
  audio.setEnabled(true);
  const sound = createContactSound(audio);
  let history = createHistory(emptyDrawing(3, 'flower'));
  let disabled = false;
  const cohort = vi.fn((strokes) => {
    history = addStrokes(history, strokes);
  });
  const input = createContactResponder(
    () => ({
      currentDrawing: () => history.drawing,
      brush,
      color: 'Blue',
      disabled,
      onCohort: cohort,
      onDrawingChange: vi.fn(),
      onError: failure,
      sound,
    }),
    () => ({ width: 1024, height: 768, pageX: 0, pageY: 0 }),
    vi.fn()
  );
  function start(touches, changed = touches, starts = {}) {
    const next = event(touches, changed, starts);
    input.grant(next);
    input.start(next);
  }
  function finish() {
    sound.dispose();
    audio.dispose();
  }
  return {
    loop,
    failure,
    audio,
    sound,
    input,
    start,
    finish,
    cohort,
    history: () => history,
    disable: () => {
      disabled = true;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('joint admitted contact sound lifecycle', () => {
  it.each(['marker', 'eraser', 'crayon', 'magic'])(
    'keeps two %s contacts in one audio lifetime and one history group',
    async (brush) => {
      const f = await fixture(brush);
      const original = f.history().drawing;
      f.start([touch(0, 10, 20, 100)]);
      await Promise.resolve();
      f.start([touch(0, 10, 20, 200), touch(1, 900, 700, 200)], [touch(1, 900, 700, 200)], {
        0: 100,
      });
      f.input.move(
        event([touch(0, 10, 20, 300), touch(1, 909, 700, 300)], undefined, { 0: 100, 1: 200 })
      );
      expect(f.loop.setVolume.mock.calls.at(-1)[0]).toBeCloseTo(0.04);
      expect(f.loop.start).toHaveBeenCalledOnce();
      f.input.end(event([touch(1, 909, 700, 400)], [touch(0, 10, 20, 400)], { 0: 100, 1: 200 }));
      expect(f.loop.stop).not.toHaveBeenCalled();
      expect(f.cohort).not.toHaveBeenCalled();
      f.input.end(event([], [touch(1, 909, 700, 500)], { 1: 200 }));
      expect(f.loop.stop).toHaveBeenCalledOnce();
      expect(f.cohort).toHaveBeenCalledOnce();
      expect(f.history().drawing).toMatchObject({ version: 5, pageId: 'flower', rainbow: 3 });
      expect(f.history().drawing.strokes).toHaveLength(2);
      expect(undoDrawing(f.history()).drawing).toBe(original);
      f.finish();
    }
  );
  it.each([false, true])(
    'stops the stationary survivor sound after responder release with control survivor=%s',
    async (controlSurvives) => {
      const f = await fixture();
      const original = f.history().drawing;
      const control = touch(2, -80, 900, 200);
      f.start([touch(0, 10, 20, 100)]);
      await Promise.resolve();
      const held = [touch(1, 900, 700, 200), ...(controlSurvives ? [control] : [])];
      f.start([touch(0, 10, 20, 200), ...held], held, { 0: 100 });
      const partial = event(held, [touch(0, 30, 40, 300)], { 0: 100, 1: 200, 2: 200 });
      f.input.end(partial);
      f.input.release(partial);
      expect(f.loop.stop).not.toHaveBeenCalled();
      expect(f.cohort).not.toHaveBeenCalled();
      f.input.endRaw({
        nativeEvent: {
          touches: controlSurvives ? [control] : [],
          changedTouches: [touch(1, 5000, 6000, 400)],
        },
      });
      expect(f.loop.stop).toHaveBeenCalledOnce();
      expect(f.cohort).toHaveBeenCalledOnce();
      expect(f.history().drawing.strokes).toHaveLength(2);
      expect(f.history().drawing.strokes[1].points).toEqual([{ x: 900, y: 700 }]);
      expect(f.input.hasActive()).toBe(false);
      expect(f.history().undo).toHaveLength(1);
      expect(undoDrawing(f.history()).drawing).toBe(original);
      f.input.endRaw({ nativeEvent: { touches: [], changedTouches: [control] } });
      expect(f.loop.stop).toHaveBeenCalledOnce();
      expect(f.cohort).toHaveBeenCalledOnce();
      f.finish();
    }
  );
  it.each(['resize', 'interrupt', 'detach'])(
    'ends sound once on %s and refuses samples from the old lease',
    async (method) => {
      const f = await fixture();
      f.start([touch(0, 10, 20, 100)]);
      await Promise.resolve();
      f.input[method]();
      const calls = f.loop.setVolume.mock.calls.length;
      f.input.move(event([touch(0, 200, 20, 300)], undefined, { 0: 100 }));
      expect(f.loop.stop).toHaveBeenCalledOnce();
      expect(f.loop.setVolume).toHaveBeenCalledTimes(calls);
      f.finish();
    }
  );
  it('does not admit sound while a capture or command disables new contacts', async () => {
    const f = await fixture();
    f.disable();
    f.start([touch(0, 10, 20, 100)]);
    await Promise.resolve();
    expect(f.loop.start).not.toHaveBeenCalled();
    expect(f.input.hasActive()).toBe(false);
    expect(f.history().undo).toEqual([]);
    f.finish();
  });
  it('isolates old generation teardown from a later contact with the same touch identifier', async () => {
    const f = await fixture();
    const old = f.sound.begin({ x: 10, y: 20 }, 100);
    await Promise.resolve();
    f.sound.interrupt();
    const current = f.sound.begin({ x: 800, y: 700 }, 200);
    const stopped = f.loop.stop.mock.calls.length;
    const samples = f.loop.setVolume.mock.calls.length;
    old.end();
    old.sample({ x: 900, y: 700 }, 300);
    expect(f.loop.stop).toHaveBeenCalledTimes(stopped);
    expect(f.loop.setVolume).toHaveBeenCalledTimes(samples);
    current.sample({ x: 809, y: 700 }, 300);
    expect(f.loop.setVolume.mock.calls.at(-1)[0]).toBeCloseTo(0.04);
    current.end();
    expect(f.loop.stop).toHaveBeenCalledTimes(stopped + 1);
    f.finish();
  });
  it('rejects backward and nonfinite samples and lets stillness quiet all stationary contacts', async () => {
    const f = await fixture();
    const a = f.sound.begin({ x: 10, y: 20 }, 100);
    const b = f.sound.begin({ x: 900, y: 700 }, 100);
    await Promise.resolve();
    a.sample({ x: 55, y: 20 }, 200);
    const calls = f.loop.setVolume.mock.calls.length;
    b.sample({ x: 900, y: 700 }, 200);
    a.sample({ x: 1000, y: 20 }, 199);
    b.sample({ x: NaN, y: 700 }, 300);
    expect(f.loop.setVolume).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.loop.setVolume).toHaveBeenLastCalledWith(0);
    a.end();
    b.end();
    expect(f.loop.stop).toHaveBeenCalledOnce();
    expect(f.failure).not.toHaveBeenCalled();
    f.finish();
  });
});
