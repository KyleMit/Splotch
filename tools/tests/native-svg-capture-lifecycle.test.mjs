// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSvgCapture,
  PNG_TIMEOUT_MS,
} from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
const SIZE = { width: 1024, height: 768 };
let nextFrame = 0;
const pendingFrames = new Map();
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  pendingFrames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++nextFrame;
    pendingFrames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => pendingFrames.delete(id));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function frames() {
  for (let index = 0; index < 2; index += 1)
    await act(async () => {
      const current = [...pendingFrames.values()];
      pendingFrames.clear();
      for (const callback of current) callback(0);
    });
}

describe('SVG job cancellation identity', () => {
  it('cancels only the superseded job and refuses its old and duplicate callbacks', async () => {
    const callbacks = [];
    const capture = createSvgCapture();
    const svg = { toDataURL: (callback) => callbacks.push(callback) };
    const first = capture.capture(svg, SIZE);
    const refused = first.promise.catch((failure) => failure.message);
    await frames();
    first.cancel();
    await expect(refused).resolves.toContain('superseded');
    const second = capture.capture(svg, SIZE);
    await frames();
    first.cancel();
    callbacks[0]('old');
    callbacks[1]('new');
    callbacks[1]('duplicate');
    await expect(second.promise).resolves.toBe('new');
    capture.dispose();
  });
});

describe('consumed SVG raster disposal', () => {
  it.each(['success', 'empty', 'cancel', 'timeout', 'dispose'])(
    'disposes the actual request once on %s and refuses duplicate settlement',
    async (outcome) => {
      const callbacks = [],
        released = vi.fn(),
        capture = createSvgCapture();
      const job = capture.capture(
        {
          toDataURL(callback) {
            callbacks.push(callback);
            return released;
          },
        },
        SIZE
      );
      const result = job.promise.then(
        (value) => ({ value }),
        (failure) => ({ failure })
      );
      await frames();
      if (outcome === 'success') callbacks[0]('current');
      else if (outcome === 'empty') callbacks[0]('');
      else if (outcome === 'cancel') job.cancel();
      else if (outcome === 'dispose') capture.dispose();
      else await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
      const terminal = await result;
      expect(outcome === 'success' ? terminal.value : terminal.failure).toBeTruthy();
      expect(released).toHaveBeenCalledOnce();
      callbacks[0]('late');
      job.cancel();
      capture.dispose();
      expect(released).toHaveBeenCalledOnce();
    }
  );

  it('registers synchronous cleanup before resolving and preserves the first callback', async () => {
    const released = vi.fn(),
      capture = createSvgCapture();
    const job = capture.capture(
      {
        toDataURL(callback) {
          callback('first');
          callback('duplicate');
          return released;
        },
      },
      SIZE
    );
    await frames();
    await expect(job.promise).resolves.toBe('first');
    expect(released).toHaveBeenCalledOnce();
  });

  it('disposes a cleanup returned after its request was cancelled during native dispatch', async () => {
    const released = vi.fn(),
      capture = createSvgCapture();
    const job = capture.capture(
      {
        toDataURL(callback) {
          capture.dispose();
          callback('late-sync');
          return released;
        },
      },
      SIZE
    );
    const refused = job.promise.catch((failure) => failure.message);
    await frames();
    await expect(refused).resolves.toContain('cancelled');
    expect(released).toHaveBeenCalledOnce();
  });

  it('retains terminal cleanup failure without resolving a PNG or accepting another job', async () => {
    const capture = createSvgCapture();
    const job = capture.capture(
      {
        toDataURL(callback) {
          callback('pixels');
          return () => {
            throw new Error('Resource disposal failed');
          };
        },
      },
      SIZE
    );
    const refused = job.promise.catch((failure) => failure.message);
    await frames();
    await expect(refused).resolves.toContain('cleanup failed');
    await expect(capture.capture({ toDataURL() {} }, SIZE).promise).rejects.toThrow('unavailable');
  });

  it('accepts the unchanged native void-return contract without claiming native resource cancellation', async () => {
    const callbacks = [],
      capture = createSvgCapture();
    const job = capture.capture(
      {
        toDataURL(callback) {
          callbacks.push(callback);
        },
      },
      SIZE
    );
    await frames();
    callbacks[0]('native-result');
    await expect(job.promise).resolves.toBe('native-result');
    capture.dispose();
  });
});
