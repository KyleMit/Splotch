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

    describe('with animation frames available (cooperative idleness)', () => {
      let frameCallbacks: Map<number, (time: number) => void>;
      let nextFrame: number;
      let frameTime: number;
      // How far apart the two probe frames land; each test sets the gap it
      // needs before pumping the frames.
      let frameGapMs: number;

      const pumpFrames = (count: number) => {
        for (let i = 0; i < count; i += 1) {
          const pending = [...frameCallbacks.entries()];
          frameCallbacks.clear();
          frameTime += frameGapMs;
          pending.forEach(([, cb]) => cb(frameTime));
        }
      };

      beforeEach(() => {
        frameCallbacks = new Map();
        nextFrame = 1;
        frameTime = 0;
        frameGapMs = 16;
        vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
          const handle = nextFrame++;
          frameCallbacks.set(handle, cb);
          return handle;
        });
        vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
          frameCallbacks.delete(handle);
        });
      });

      it('runs after quiet frames on budget', () => {
        const fn = vi.fn();
        scheduleIdle(fn);
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
        pumpFrames(2);
        expect(fn).toHaveBeenCalledOnce();
      });

      it('requeues instead of running when the frame gap runs long', () => {
        const fn = vi.fn();
        scheduleIdle(fn);
        vi.advanceTimersByTime(200);
        frameGapMs = 40;
        pumpFrames(2);
        expect(fn).not.toHaveBeenCalled();
        // The retry timer re-arms the probe; frames back on budget let it run.
        frameGapMs = 16;
        vi.advanceTimersByTime(250);
        pumpFrames(2);
        expect(fn).toHaveBeenCalledOnce();
      });

      it('cancel during the frame probe prevents the run', () => {
        const fn = vi.fn();
        const cancel = scheduleIdle(fn);
        vi.advanceTimersByTime(200);
        pumpFrames(1);
        cancel();
        pumpFrames(1);
        expect(fn).not.toHaveBeenCalled();
      });
    });
  });
});
