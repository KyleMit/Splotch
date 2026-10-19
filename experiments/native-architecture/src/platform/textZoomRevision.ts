import { createContext } from 'react';

// Counts the Settings text-zoom pinches that have finished. A pinch changes how wide native text is
// laid out without changing the window, and can end back at the zoom it started from after the text
// already shrank mid-gesture, so text fitted to its width (rsdDrawing/fittedText.native.tsx) starts
// its fit over on each finished pinch rather than on the zoom value or every frame of the gesture.
export const TextZoomRevision = createContext(0);
