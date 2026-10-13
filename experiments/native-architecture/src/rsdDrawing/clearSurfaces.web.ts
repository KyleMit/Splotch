import { createElement, type ComponentProps, type ComponentType } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdClearCoachmark as Coachmark } from './RsdClearCoachmark';
import type { RsdClearUnderlay as Underlay } from './RsdClearUnderlay';

// Neither layer paints anything until a press or drag on Clear, so each chunk loads once the
// screen has mounted rather than before first paint. Until it arrives, or if it fails to, the
// drag still clears; only its decoration is missing.
function deferredLayer<P extends object>(
  load: () => Promise<ComponentType<P>>,
  description: string
) {
  const layer = createLazyExport(load);
  const whole = (loaded: ComponentType<P>) => loaded;
  return function DeferredLayer(props: P) {
    const Loaded = useLazyValue(layer, whole, description);
    return Loaded ? createElement(Loaded, props) : null;
  };
}

export const RsdClearCoachmark = deferredLayer<ComponentProps<typeof Coachmark>>(
  () => import('./RsdClearCoachmark').then((module) => module.RsdClearCoachmark),
  'The Clear coachmark'
);
export const RsdClearUnderlay = deferredLayer<ComponentProps<typeof Underlay>>(
  () => import('./RsdClearUnderlay').then((module) => module.RsdClearUnderlay),
  'The Clear underlay'
);
