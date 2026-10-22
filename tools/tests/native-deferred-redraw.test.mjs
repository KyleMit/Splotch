import { describe, expect, it } from 'vitest';
import { createDeferredRedraw } from '../../src/drawing/deferredRedraw.ts';

function fakeFrames() {
  const frames = new Map();
  let next = 0;
  return {
    clock: {
      requestFrame: (callback) => {
        next += 1;
        frames.set(next, callback);
        return next;
      },
      cancelFrame: (handle) => frames.delete(handle),
    },
    pending: () => [...frames.values()],
    runFrame() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
    },
  };
}

function counted(frames) {
  const counter = { redraws: 0 };
  counter.redraw = createDeferredRedraw(frames.clock, () => (counter.redraws += 1));
  return counter;
}

// Negative control: SETTLE_FRAMES = 1 redraws on the first frame.
describe('deferred ink redraw', () => {
  it('redraws once, two display frames after a request', () => {
    const frames = fakeFrames();
    const counter = counted(frames);
    counter.redraw.request();
    frames.runFrame();
    expect(counter.redraws).toBe(0);
    frames.runFrame();
    expect(counter.redraws).toBe(1);
    expect(frames.pending()).toHaveLength(0);
  });

  it('restarts for a request that supersedes a waiting one, and the superseded frame stays inert', () => {
    const frames = fakeFrames();
    const counter = counted(frames);
    counter.redraw.request();
    frames.runFrame();
    const [superseded] = frames.pending();
    counter.redraw.request();
    expect(frames.pending()).toHaveLength(1);
    superseded();
    expect(counter.redraws).toBe(0);
    frames.runFrame();
    expect(counter.redraws).toBe(0);
    frames.runFrame();
    expect(counter.redraws).toBe(1);
    expect(frames.pending()).toHaveLength(0);
  });

  it('drops a waiting redraw on dispose and accepts a request after it', () => {
    const frames = fakeFrames();
    const counter = counted(frames);
    counter.redraw.request();
    const [disposed] = frames.pending();
    counter.redraw.dispose();
    expect(frames.pending()).toHaveLength(0);
    disposed();
    expect(counter.redraws).toBe(0);
    counter.redraw.request();
    frames.runFrame();
    frames.runFrame();
    expect(counter.redraws).toBe(1);
  });
});
