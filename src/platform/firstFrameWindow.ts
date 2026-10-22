import { Dimensions, type ScaledSize } from 'react-native';
import { FIRST_FRAME_VIEWPORT_ATTRIBUTE, parseFirstFrameViewport } from './firstFrameViewport';

// Only web modules import this (firstFrame.web.ts, windowDimensions.web.ts): the viewport the shell's
// prerendered frame was laid out for, which the boot script names on the root it fills.
declare global {
  var __EXPO_ROUTER_HYDRATE__: boolean | undefined;
}

function hydratedViewport(): ScaledSize | null {
  if (globalThis.__EXPO_ROUTER_HYDRATE__ !== true) return null;
  const root = document.getElementById('root');
  return parseFirstFrameViewport(root?.getAttribute(FIRST_FRAME_VIEWPORT_ATTRIBUTE) ?? null);
}

export const HYDRATED_VIEWPORT = typeof window === 'undefined' ? null : hydratedViewport();

// The window the first frame was laid out for: the build's own (Dimensions.set) or the one the
// shell names. The browser's live window replaces it after hydration (windowDimensions.web.ts).
export function firstFrameWindow(): ScaledSize {
  return HYDRATED_VIEWPORT ?? Dimensions.get('window');
}
