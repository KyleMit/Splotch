import {
  createElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ComponentType,
} from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type {
  RsdGlassPanes as Panes,
  RsdMarginRules as Rules,
  RsdRailGlass as Rail,
} from './RsdBareGlass.web';

type Glass = typeof import('./RsdBareGlass.web');

// Only the flat Button style shows the glass, so it stays off the startup path and loads once the
// saved style asks for it.
const glass = createLazyExport<Glass>(() => import('./RsdBareGlass.web'));
const DESCRIPTION = 'The flat toolbar glass';

function deferredGlass<P extends object>(select: (loaded: Glass) => ComponentType<P>) {
  return function DeferredGlass(props: P) {
    const Loaded = useLazyValue(glass, select, DESCRIPTION);
    return Loaded ? createElement(Loaded, props) : null;
  };
}

export const RsdRailGlass = deferredGlass<ComponentProps<typeof Rail>>(
  (loaded) => loaded.RsdRailGlass
);
export const RsdMarginRules = deferredGlass<ComponentProps<typeof Rules>>(
  (loaded) => loaded.RsdMarginRules
);
export const RsdGlassPanes = deferredGlass<ComponentProps<typeof Panes>>(
  (loaded) => loaded.RsdGlassPanes
);

const loaded = () => glass.current() !== undefined;

// Shipping's boot script prints the flat chrome before its first paint, so the drawing screen holds
// its controls until the glass has arrived rather than showing them a beat before their margin. A
// failed load lets the controls through: the glass retries as it mounts.
export function useBareGlassReady(bare: boolean) {
  const ready = useSyncExternalStore(glass.subscribe, loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!bare || ready) return;
    glass.load().catch((error: unknown) => {
      console.error(`${DESCRIPTION} failed to load:`, error);
      setFailed(true);
    });
  }, [bare, ready]);
  return !bare || ready || failed;
}
