export interface ReduceMotionDevice {
  isReduceMotionEnabled(): Promise<boolean>;
  addEventListener(
    event: 'reduceMotionChanged',
    listener: (enabled: boolean) => void
  ): { remove(): void };
}

export function observeReduceMotion(
  device: ReduceMotionDevice,
  publish: (reduced: boolean) => void
) {
  let disposed = false;
  let changed = false;
  publish(true);
  let subscription: { remove(): void };
  try {
    subscription = device.addEventListener('reduceMotionChanged', (enabled) => {
      if (disposed) return;
      changed = true;
      publish(enabled !== false);
    });
  } catch {
    return () => {
      disposed = true;
    };
  }
  void Promise.resolve()
    .then(() => device.isReduceMotionEnabled())
    .then((enabled) => {
      if (!disposed && !changed) publish(enabled !== false);
    })
    .catch(() => {
      if (!disposed && !changed) publish(true);
    });
  return () => {
    disposed = true;
    subscription.remove();
  };
}
