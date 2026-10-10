import { createHistory, type History } from './model';

export function createDrawingSession() {
  let history = createHistory();
  const listeners = new Set<() => void>();
  let active: object | null = null;
  return {
    current: () => history,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach() {
      const identity = {};
      active = identity;
      return {
        current: () => active === identity,
        revoke() {
          if (active === identity) active = null;
        },
        update(next: History | ((current: History) => History)) {
          if (active !== identity) return;
          history = typeof next === 'function' ? next(history) : next;
          for (const listener of listeners) listener();
        },
      };
    },
  };
}
export type DrawingSession = ReturnType<typeof createDrawingSession>;
