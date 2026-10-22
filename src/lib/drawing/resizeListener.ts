export const RESIZE_SETTLE_MS = 150;

// Window and layout resizes share one settle; it reports whether anything but
// the canvas box moved while it waited.
export function createResizeListener(refresh: () => void, settle: (layoutOnly: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let viewportChanged = false;
  const dispose = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    viewportChanged = false;
  };
  const schedule = () => {
    refresh();
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const layoutOnly = !viewportChanged;
      viewportChanged = false;
      settle(layoutOnly);
    }, RESIZE_SETTLE_MS);
  };
  return {
    handleResize() {
      viewportChanged = true;
      schedule();
    },
    handleLayoutResize: schedule,
    dispose,
  };
}
