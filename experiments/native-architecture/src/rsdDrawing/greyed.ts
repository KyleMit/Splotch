import { channels, hexByte } from './colorMix';

// A flyout-open tile greys through CSS grayscale(1), which React Native's iOS renderer drops, so
// the native app paints the grey into the icon markup itself: each sRGB channel becomes the color's
// luma, by the Filter Effects grayscale matrix. Icon markup writes every color in hex.
const GRAYSCALE_LUMA = [0.2126, 0.7152, 0.0722] as const;
const MARKUP_HEX_COLOR = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function grayscale(hex: string): string {
  const luma = channels(hex).reduce((sum, value, index) => sum + value * GRAYSCALE_LUMA[index], 0);
  return `#${hexByte(luma).repeat(3)}`;
}

export function greyedMarkup(markup: string): string {
  return markup.replace(MARKUP_HEX_COLOR, (hex) => grayscale(hex));
}
