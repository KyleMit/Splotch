import { useEffect, useSyncExternalStore } from 'react';
import {
  NATIVE_ICONS,
  type NativeDeferredIconName,
  type NativeIconMarkup,
  type NativeIconName,
  type NativeStartupIconName,
} from './icons.generated';

// The shipping iconRegistry.svelte.ts contract: icons no startup surface renders load in their own
// chunk on first use, a failed load is logged and forgotten so the next icon to mount retries, and
// every mounted icon waiting on the chunk paints when any load succeeds.
function createLazyExport<T>(load: () => Promise<T>) {
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

type LazyExport<T> = ReturnType<typeof createLazyExport<T>>;

const deferredIcons = createLazyExport<Record<NativeDeferredIconName, NativeIconMarkup>>(() =>
  import('./icons.deferred.generated').then((module) => module.NATIVE_DEFERRED_ICONS)
);
const splotchy = createLazyExport<string>(() =>
  import('./splotchy.generated').then((module) => module.NATIVE_SPLOTCHY)
);

// The snapshot is the selected value, not the whole export, so a load re-renders only the
// consumers whose own value it resolved; a consumer that selects nothing never loads.
function useLazyValue<T, V>(
  lazy: LazyExport<T>,
  select: ((loaded: T) => V) | undefined
): V | undefined {
  const value = useSyncExternalStore(lazy.subscribe, () => {
    const loaded = lazy.current();
    return select && loaded !== undefined ? select(loaded) : undefined;
  });
  const needed = select !== undefined && value === undefined;
  useEffect(() => {
    if (!needed) return;
    lazy
      .load()
      .catch((error: unknown) => console.error('Deferred icon chunk failed to load:', error));
  }, [lazy, needed]);
  return value;
}

function isStartupIcon(name: NativeIconName): name is NativeStartupIconName {
  return Object.hasOwn(NATIVE_ICONS, name);
}

export function useNativeIconMarkup(name: NativeIconName): NativeIconMarkup | undefined {
  const deferred = useLazyValue(
    deferredIcons,
    isStartupIcon(name) ? undefined : (icons) => icons[name]
  );
  return isStartupIcon(name) ? NATIVE_ICONS[name] : deferred;
}

export function useSplotchyMarkup(): string | undefined {
  return useLazyValue(splotchy, (markup) => markup);
}
