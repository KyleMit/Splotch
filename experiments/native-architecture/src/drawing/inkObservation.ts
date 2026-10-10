import type { PngGrid } from './pngLimits';

type ObservationContext = { grid: PngGrid | null; current: () => boolean; dispose: () => void };
type ObservationDecode = (
  base64: string,
  grid: PngGrid | null,
  isCurrent: () => boolean
) => Promise<boolean>;
type ObservationTask = {
  cancelled: boolean;
  started: boolean;
  released: boolean;
  context: ObservationContext;
};

export function createInkObservationController(
  prepare: () => ObservationContext,
  decode: ObservationDecode
) {
  let active: ObservationTask | null = null;
  let disposed = false;
  function release(task: ObservationTask) {
    if (task.released) return;
    task.released = true;
    task.context.dispose();
  }
  function cancel(task: ObservationTask) {
    task.cancelled = true;
    if (!task.started && active === task) {
      release(task);
      active = null;
    }
  }
  return {
    begin(isCurrent: () => boolean) {
      if (disposed || active || !isCurrent()) throw new Error('Picture observation is not ready.');
      const task: ObservationTask = {
        cancelled: false,
        started: false,
        released: false,
        context: prepare(),
      };
      active = task;
      function current() {
        return (
          !disposed && active === task && !task.cancelled && isCurrent() && task.context.current()
        );
      }
      return {
        async observe(base64: string) {
          if (task.started) throw new Error('Picture observation was already started.');
          task.started = true;
          try {
            if (!current()) throw new Error('The picture changed before observation finished.');
            const empty = await decode(base64, task.context.grid, current);
            if (!current()) throw new Error('The picture changed before observation finished.');
            return empty;
          } finally {
            release(task);
            if (active === task) active = null;
          }
        },
        cancel: () => cancel(task),
      };
    },
    dispose() {
      disposed = true;
      if (active) cancel(active);
    },
  };
}
