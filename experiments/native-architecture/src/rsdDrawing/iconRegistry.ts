import { useEffect, useState } from 'react';
import {
  NATIVE_ICONS,
  type NativeDeferredIconName,
  type NativeIconMarkup,
  type NativeIconName,
  type NativeStartupIconName,
} from './icons.generated';

// The shipping iconRegistry.svelte.ts contract: icons no startup surface renders load in their own
// chunk on first use, and a failed load is logged and forgotten so the next icon to mount retries.
function createLazyExport<T>(load: () => Promise<T>) {
  let loaded: T | undefined;
  let pending: Promise<T> | undefined;
  return {
    current: () => loaded,
    load(): Promise<T> {
      pending ??= load().then(
        (value) => (loaded = value),
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

function useLazyExport<T>(lazy: LazyExport<T>, needed: boolean): T | undefined {
  const [value, setValue] = useState(lazy.current);
  useEffect(() => {
    if (!needed || value !== undefined) return;
    let mounted = true;
    lazy.load().then(
      (loaded) => {
        if (mounted) setValue(() => loaded);
      },
      (error: unknown) => console.error('Deferred icon chunk failed to load:', error)
    );
    return () => {
      mounted = false;
    };
  }, [lazy, needed, value]);
  return value;
}

function isStartupIcon(name: NativeIconName): name is NativeStartupIconName {
  return Object.hasOwn(NATIVE_ICONS, name);
}

export function useNativeIconMarkup(name: NativeIconName): NativeIconMarkup | undefined {
  const startup = isStartupIcon(name);
  const deferred = useLazyExport(deferredIcons, !startup);
  return startup ? NATIVE_ICONS[name] : deferred?.[name];
}

export function useSplotchyMarkup(): string | undefined {
  return useLazyExport(splotchy, true);
}
