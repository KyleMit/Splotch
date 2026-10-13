import { useEffect, useSyncExternalStore } from 'react';

// The shipping iconRegistry.svelte.ts contract: a module no startup surface renders loads in its
// own chunk on first use, a failed load is logged and forgotten so the next consumer to mount
// retries, and every mounted consumer waiting on the chunk paints when any load succeeds.
export function createLazyExport<T>(load: () => Promise<T>) {
  let loaded: T | undefined;
  let pending: Promise<T> | undefined;
  const listeners = new Set<() => void>();
  return {
    current: () => loaded,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load(): Promise<T> {
      pending ??= load().then(
        (value) => {
          loaded = value;
          for (const listener of listeners) listener();
          return value;
        },
        (error: unknown) => {
          pending = undefined;
          throw error;
        }
      );
      return pending;
    },
  };
}

export type LazyExport<T> = ReturnType<typeof createLazyExport<T>>;

const NO_SUBSCRIPTION = () => () => {};

// The snapshot is the selected value, not the whole export, so a load re-renders only the
// consumers whose own value it resolved; a consumer with no export or no selector never loads.
export function useLazyValue<T, V>(
  lazy: LazyExport<T> | null,
  select: ((loaded: T) => V) | undefined,
  description: string
): V | undefined {
  const value = useSyncExternalStore(lazy?.subscribe ?? NO_SUBSCRIPTION, () => {
    const loaded = lazy?.current();
    return select && loaded !== undefined ? select(loaded) : undefined;
  });
  const needed = lazy !== null && select !== undefined && value === undefined;
  useEffect(() => {
    if (!needed || !lazy) return;
    lazy.load().catch((error: unknown) => console.error(`${description} failed to load:`, error));
  }, [lazy, needed, description]);
  return value;
}
