import { HYDRATED_VIEWPORT } from './firstFrameWindow';

// The web export's shell carries the drawing screen's first frame, rendered at build time
// (prerenderFirstFrame.tsx), and its boot script sets Expo's hydration flag on the paths that frame
// fits. While the build renders and while the browser hydrates, the drawing screen paints that
// frame, so the hydrating render matches the markup; the next render takes the browser's own
// window (windowDimensions.web.ts), safe area and settings.
export const FIRST_FRAME_PRERENDERED = typeof window === 'undefined' || HYDRATED_VIEWPORT !== null;
