import { scale } from '../lib/design/tokens';

const WEB_TEXT_FONT = { fontFamily: scale.fontFamily } as const;

// The web stack's variable face carries every weight, so text keeps its own.
export function shippingTextFont() {
  return WEB_TEXT_FONT;
}
