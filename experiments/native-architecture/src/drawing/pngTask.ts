export function resumePngTask(check: () => void, _deadline: number) {
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
