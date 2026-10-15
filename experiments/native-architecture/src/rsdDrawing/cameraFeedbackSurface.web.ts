import type { ComponentProps } from 'react';
import { deferredLayer } from './clearSurfaces.web';
import type { RsdCameraFeedback as Feedback } from './RsdCameraFeedback';

export const RsdCameraFeedback = deferredLayer<ComponentProps<typeof Feedback>>(
  () => import('./RsdCameraFeedback').then((module) => module.RsdCameraFeedback),
  'The screenshot capture cue',
  (props) => props.children
);
