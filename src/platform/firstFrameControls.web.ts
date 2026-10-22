import { useLayoutEffect } from 'react';
import { CONTROLS_LIVE_ATTRIBUTE } from './firstFrameContract';

// The drawing controls' handlers attach in the commit that runs this, so from here the shell stops
// answering presses itself (its squish and "not yet" wiggle) and lets them through.
export function useControlsLive(): void {
  useLayoutEffect(() => {
    document.documentElement.setAttribute(CONTROLS_LIVE_ATTRIBUTE, '');
    return () => document.documentElement.removeAttribute(CONTROLS_LIVE_ATTRIBUTE);
  }, []);
}
