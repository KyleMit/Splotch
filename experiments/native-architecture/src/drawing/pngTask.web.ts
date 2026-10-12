export function resumePngTask(check: () => void, deadline: number) {
  return new Promise<void>((resolve, reject) => {
    let channel: MessageChannel | undefined;
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    function release() {
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
        watchdog = undefined;
      }
      if (!channel) return;
      const current = channel;
      channel = undefined;
      current.port1.onmessage = null;
      current.port1.onmessageerror = null;
      try {
        current.port1.close();
      } finally {
        current.port2.close();
      }
    }
    function settle(failure?: { error: unknown }) {
      if (settled) return;
      settled = true;
      try {
        release();
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
      // Posted messages yield a browser task without nesting the decoder's zero timers.
      channel = new MessageChannel();
      channel.port1.onmessage = () => settle();
      channel.port1.onmessageerror = (error) => settle({ error });
      watchdog = setTimeout(() => settle(), Math.max(0, Math.ceil(deadline - performance.now())));
      channel.port2.postMessage(null);
    } catch (error) {
      settle({ error });
    }
  });
}
