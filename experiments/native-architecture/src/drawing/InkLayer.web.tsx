import { forwardRef, useSyncExternalStore } from 'react';
import { RasterInk, type RasterInkHandle } from './RasterInk';
import type { InkLayerProps } from './inkLayerProps';

// The web renderer draws the live cohort as React state, rendering with each published packet.
export const InkLayer = forwardRef<RasterInkHandle, InkLayerProps>(function InkLayer(
  { live, ...props },
  ref
) {
  const drafts = useSyncExternalStore(live.subscribe, live.drafts, live.drafts);
  return <RasterInk ref={ref} {...props} drafts={drafts} />;
});
