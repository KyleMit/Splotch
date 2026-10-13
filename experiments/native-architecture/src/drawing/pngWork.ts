import { PNG_TIMEOUT_MS } from './svgCapture';
import { MAX_PNG_BASE64_CHARACTERS, MAX_PNG_PIXELS } from './pngLimits';

const WORK_SLICE_UNITS = 4096;
const MAX_SYNCHRONOUS_WORK_UNITS = WORK_SLICE_UNITS * 2;
const MAX_WORK_UNITS = MAX_PNG_BASE64_CHARACTERS * 12 + MAX_PNG_PIXELS * 32;

function resumeTask(check: () => void) {
  return new Promise<void>((resolve, reject) => {
    const request = globalThis.requestIdleCallback;
    const cancel = globalThis.cancelIdleCallback;
    let idle: ReturnType<typeof requestIdleCallback> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    function settle(failure?: { error: unknown }) {
      if (settled) return;
      settled = true;
      try {
        if (timer !== undefined) clearTimeout(timer);
        if (idle !== undefined) cancel(idle);
        if (failure) {
          reject(failure.error);
          return;
        }
        check();
        resolve();
      } catch (error) {
        reject(error);
      }
    }
    try {
      // Native zero timers wait for a frame; idle callbacks yield to another runtime task.
      if (typeof request === 'function' && typeof cancel === 'function')
        idle = request(() => settle());
      timer = setTimeout(() => settle(), 0);
    } catch (error) {
      settle({ error });
    }
  });
}

export function createPngWork(isCurrent: () => boolean) {
  const deadline = performance.now() + PNG_TIMEOUT_MS;
  let total = 0;
  let slice = 0;
  function check() {
    if (!isCurrent())
      throw new Error('Picture observation was cancelled. Your drawing is still here.');
    if (performance.now() >= deadline)
      throw new Error('Picture observation did not finish. Your drawing is still here.');
  }
  return {
    charge(units = 1) {
      total += units;
      slice += units;
      if (slice > MAX_SYNCHRONOUS_WORK_UNITS)
        throw new Error('Picture observation exceeded its synchronous work limit.');
      if (total > MAX_WORK_UNITS) throw new Error('Picture observation exceeded its work limit.');
      if (slice >= WORK_SLICE_UNITS) check();
    },
    due: () => slice >= WORK_SLICE_UNITS,
    check,
    async pause() {
      check();
      slice = 0;
      await resumeTask(check);
      check();
    },
  };
}
export type PngWork = ReturnType<typeof createPngWork>;
