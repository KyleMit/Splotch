// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleIdle } from './idle';

describe('scheduleIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('with requestIdleCallback available', () => {
    let idleCallbacks: Map<number, () => void>;
    let nextHandle: number;

    beforeEach(() => {
      idleCallbacks = new Map();
      nextHandle = 1;
      vi.stubGlobal('requestIdleCallback', (fn: () => void) => {
        const handle = nextHandle++;
        idleCallbacks.set(handle, fn);
        return handle;
      });
      vi.stubGlobal('cancelIdleCallback', (handle: number) => {
        idleCallbacks.delete(handle);
      });
    });

    it('schedules the callback via requestIdleCallback', () => {
      const fn = vi.fn();
      scheduleIdle(fn);
      expect(idleCallbacks.size).toBe(1);
      idleCallbacks.forEach((cb) => cb());
      expect(fn).toHaveBeenCalledOnce();
    });

    it('cancel prevents the callback from running', () => {
      const fn = vi.fn();
      const cancel = scheduleIdle(fn);
      cancel();
      idleCallbacks.forEach((cb) => cb());
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('without requestIdleCallback (Safari/iOS fallback)', () => {
    beforeEach(() => {
      vi.stubGlobal('requestIdleCallback', undefined);
    });

    it('falls back to a timeout', () => {
      const fn = vi.fn();
      scheduleIdle(fn);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('cancel clears the pending timeout', () => {
      const fn = vi.fn();
      const cancel = scheduleIdle(fn);
      cancel();
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
