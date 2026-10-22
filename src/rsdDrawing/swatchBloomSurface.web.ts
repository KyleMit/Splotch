import type { ComponentProps } from 'react';
import { deferredLayer } from './clearSurfaces.web';
import type { RsdSwatchBloom as Bloom } from './RsdSwatchBloom';

export const RsdSwatchBloom = deferredLayer<ComponentProps<typeof Bloom>>(
  () => import('./RsdSwatchBloom').then((module) => module.RsdSwatchBloom),
  'The paint selection cue'
);
