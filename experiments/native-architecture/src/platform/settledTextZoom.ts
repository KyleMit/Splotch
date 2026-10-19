import { createContext } from 'react';
import { MIN_TEXT_ZOOM } from '../../../../web/src/lib/actions/textZoom';

// The Settings text zoom as of the last finished pinch. Zooming changes how wide native text is
// laid out without changing the window, so text fitted to its width (rsdDrawing/fittedText.native.tsx)
// starts its fit over once the fingers lift, rather than on every frame of the gesture.
export const SettledTextZoom = createContext(MIN_TEXT_ZOOM);
