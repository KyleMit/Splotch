import { createElement, type ComponentProps, type ComponentType } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type {
  RsdBrushMenu as BrushMenu,
  RsdColorMenu as ColorMenu,
  RsdStrokeWidthMenu as StrokeWidthMenu,
} from './RsdToolFlyouts';

type Menus = typeof import('./RsdToolFlyouts');

// A menu shows only once its button is pressed, so all three load from one chunk on first open rather
// than before first paint. Until it arrives the button reads as open with nothing beside it.
const menus = createLazyExport<Menus>(() => import('./RsdToolFlyouts'));
const DESCRIPTION = 'The drawing tool menus';

function deferredMenu<P extends object>(select: (loaded: Menus) => ComponentType<P>) {
  return function DeferredMenu(props: P) {
    const Loaded = useLazyValue(menus, select, DESCRIPTION);
    return Loaded ? createElement(Loaded, props) : null;
  };
}

export const RsdBrushMenu = deferredMenu<ComponentProps<typeof BrushMenu>>(
  (loaded) => loaded.RsdBrushMenu
);
export const RsdStrokeWidthMenu = deferredMenu<ComponentProps<typeof StrokeWidthMenu>>(
  (loaded) => loaded.RsdStrokeWidthMenu
);
export const RsdColorMenu = deferredMenu<ComponentProps<typeof ColorMenu>>(
  (loaded) => loaded.RsdColorMenu
);
