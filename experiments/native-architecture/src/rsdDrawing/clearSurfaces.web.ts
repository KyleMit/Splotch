import { createElement, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdClearCoachmark as Coachmark } from './RsdClearCoachmark';
import type { RsdClearUnderlay as Underlay } from './RsdClearUnderlay';

// A decorative layer can fail to load without taking its control away. Each chunk begins loading
// when its mounted consumer needs it; the camera keeps its glyph while its cue loads.
export function deferredLayer<P extends object>(
  load: () => Promise<ComponentType<P>>,
  description: string,
  fallback?: (props: P) => ReactNode
) {
  const layer = createLazyExport(load);
  const whole = (loaded: ComponentType<P>) => loaded;
  return function DeferredLayer(props: P) {
    const Loaded = useLazyValue(layer, whole, description);
    return Loaded ? createElement(Loaded, props) : (fallback?.(props) ?? null);
  };
}

export const RsdClearCoachmark = deferredLayer<ComponentProps<typeof Coachmark>>(
  () => import('./RsdClearCoachmark').then((module) => module.RsdClearCoachmark),
  'The Clear coachmark'
);
export const RsdClearUnderlay = deferredLayer<ComponentProps<typeof Underlay>>(
  () => import('../drawing/pageArtChunk.web').then((module) => module.RsdClearUnderlay),
  'The Clear underlay'
);
