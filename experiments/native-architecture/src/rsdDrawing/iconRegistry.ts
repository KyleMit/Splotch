import { createLazyExport, useLazyValue } from '../lazyExport';
import {
  NATIVE_ICONS,
  type NativeDeferredIconName,
  type NativeIconMarkup,
  type NativeIconName,
  type NativeStartupIconName,
} from './icons.generated';

// Icons no startup surface renders load in their own chunk on first use (lazyExport.ts).
const deferredIcons = createLazyExport<Record<NativeDeferredIconName, NativeIconMarkup>>(() =>
  import('./icons.deferred.generated').then((module) => module.NATIVE_DEFERRED_ICONS)
);
const splotchy = createLazyExport<string>(() =>
  import('./splotchy.generated').then((module) => module.NATIVE_SPLOTCHY)
);
const DEFERRED_ICONS_DESCRIPTION = 'Deferred icon chunk';

function isStartupIcon(name: NativeIconName): name is NativeStartupIconName {
  return Object.hasOwn(NATIVE_ICONS, name);
}

export function useNativeIconMarkup(name: NativeIconName): NativeIconMarkup | undefined {
  const deferred = useLazyValue(
    deferredIcons,
    isStartupIcon(name) ? undefined : (icons) => icons[name],
    DEFERRED_ICONS_DESCRIPTION
  );
  return isStartupIcon(name) ? NATIVE_ICONS[name] : deferred;
}

export function useSplotchyMarkup(): string | undefined {
  return useLazyValue(splotchy, (markup) => markup, DEFERRED_ICONS_DESCRIPTION);
}
