import { describe, expect, it, vi } from 'vitest';
import { observeReduceMotion } from '../../experiments/native-architecture/src/drawing/reduceMotion.ts';
function pending() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(read = Promise.resolve(false)) {
  let listener;
  const values = [];
  const remove = vi.fn();
  const device = {
    isReduceMotionEnabled: vi.fn(() => read),
    addEventListener: vi.fn((event, callback) => {
      listener = callback;
      return { remove };
    }),
  };
  const dispose = observeReduceMotion(device, (value) => values.push(value));
  return { values, device, remove, dispose, event: (value) => listener(value) };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
describe('device Reduce Motion owner', () => {
  it.each([true, false])('starts reduced and reads the actual device state %s', async (enabled) => {
    const f = fixture(Promise.resolve(enabled));
    expect(f.values).toEqual([true]);
    expect(f.device.addEventListener).toHaveBeenCalledWith(
      'reduceMotionChanged',
      expect.any(Function)
    );
    await settle();
    expect(f.device.isReduceMotionEnabled).toHaveBeenCalledOnce();
    expect(f.values.at(-1)).toBe(enabled);
    f.dispose();
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it('keeps reduced motion on a failed read and follows subsequent live changes', async () => {
    const f = fixture(Promise.reject(new Error('native query unavailable')));
    await settle();
    expect(f.values.at(-1)).toBe(true);
    f.event(false);
    f.event(true);
    f.event(false);
    expect(f.values.slice(-3)).toEqual([false, true, false]);
    f.dispose();
  });
  it.each([true, false])(
    'does not let a delayed initial read overwrite a newer %s event',
    async (enabled) => {
      const read = pending(),
        f = fixture(read.promise);
      await settle();
      f.event(enabled);
      read.resolve(!enabled);
      await settle();
      expect(f.values).toEqual([true, enabled]);
      f.dispose();
    }
  );
  it('does not overwrite a live preference when the initial read later rejects', async () => {
    const read = pending(),
      f = fixture(read.promise);
    await settle();
    f.event(false);
    read.reject(new Error('read failed'));
    await settle();
    expect(f.values).toEqual([true, false]);
    f.dispose();
  });
  it.each(['resolve', 'reject'])(
    'ignores a delayed query %s and queued events after disposal',
    async (method) => {
      const read = pending(),
        f = fixture(read.promise);
      await settle();
      f.dispose();
      f.event(false);
      read[method](method === 'resolve' ? false : new Error('late'));
      await settle();
      expect(f.values).toEqual([true]);
      expect(f.remove).toHaveBeenCalledOnce();
    }
  );
  it('retains conservative motion if listener installation fails', async () => {
    const publish = vi.fn(),
      read = vi.fn(async () => false);
    const dispose = observeReduceMotion(
      {
        isReduceMotionEnabled: read,
        addEventListener() {
          throw new Error('native listener unavailable');
        },
      },
      publish
    );
    await settle();
    dispose();
    expect(publish.mock.calls).toEqual([[true]]);
    expect(read).not.toHaveBeenCalled();
  });
  it('contains a synchronous query failure', async () => {
    const f = fixture();
    f.device.isReduceMotionEnabled.mockImplementation(() => {
      throw new Error('native query missing');
    });
    await settle();
    expect(f.values.at(-1)).toBe(true);
    f.dispose();
  });
});
