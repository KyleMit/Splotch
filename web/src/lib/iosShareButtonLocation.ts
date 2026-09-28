// Where Safari's Share button is, in the words the install steps use
// (ADR-0039): at the bottom on a phone-width portrait viewport, in the toolbar
// otherwise, including before the viewport is measured (width 0). Free of `$app`
// and `$lib` aliases so install-banner-layout.spec.ts can import it under Node.
import { TABLET_MIN_SIDE_PX } from './breakpoints';
import type { Orientation } from './platform';

export function iosShareButtonLocation(viewportWidthPx: number, orientation: Orientation) {
  return viewportWidthPx > 0 && viewportWidthPx < TABLET_MIN_SIDE_PX && orientation === 'portrait'
    ? 'at the bottom of the screen'
    : 'in the Safari toolbar';
}
