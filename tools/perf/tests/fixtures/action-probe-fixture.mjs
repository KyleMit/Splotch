import { vi } from 'vitest';
import { actionProbeSource } from '../../lib/action-probe-source.mjs';

export const ACTION_PROBE = actionProbeSource();

// A vsync grid the test owns on both clocks: each tick hands the pending rAF
// callbacks the next scheduled stamp, and `performance.now()` inside them
// answers that stamp plus however late the callback is said to have run.
// `vsyncs` advances the stamp by more than one period, as a skipped frame does.
export function installVsyncClock({ intervalMs = 16.7 } = {}) {
  let callbacks = [];
  let vsync = 0;
  let now = 0;
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback) => callbacks.push(callback));
  return {
    nowSpy,
    tick(lateMs = 0, { vsyncs = 1 } = {}) {
      vsync += intervalMs * vsyncs;
      now = vsync + lateMs;
      const pending = callbacks;
      callbacks = [];
      nowSpy.mockClear();
      for (const callback of pending) callback(vsync);
      return nowSpy.mock.calls.length;
    },
    at(ms) {
      now = ms;
    },
  };
}
