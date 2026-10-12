import type { PngResumeSource } from '../export/pngReadDiagnostic';

export function resumePngTask(check: (source: PngResumeSource) => void, _deadline: number) {
  return new Promise<void>((resolve, reject) => {
    const request = globalThis.requestIdleCallback;
    const cancel = globalThis.cancelIdleCallback;
    let idle: ReturnType<typeof requestIdleCallback> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    function settle(source: PngResumeSource | { error: unknown }) {
      if (settled) return;
      settled = true;
      try {
        if (timer !== undefined) clearTimeout(timer);
        if (idle !== undefined) cancel(idle);
        if (typeof source !== 'string') {
          reject(source.error);
          return;
        }
        check(source);
        resolve();
      } catch (error) {
        reject(error);
      }
    }
    try {
      // Native zero timers wait for a frame; idle callbacks yield to another runtime task.
      const idleAvailable = typeof request === 'function' && typeof cancel === 'function';
      if (idleAvailable) idle = request(() => settle('idle'));
      timer = setTimeout(() => settle(idleAvailable ? 'timer-with-idle' : 'timer-without-idle'), 0);
    } catch (error) {
      settle({ error });
    }
  });
}
