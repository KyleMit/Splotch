import { fontSizeDisplayFluid } from './tokens.css';

const PERCENT = 100;

// Shipping's --font-size-display clamp(), which React Native cannot evaluate, against a window.
export function displayFontSize(windowWidth: number) {
  const { viewportWidthPercent, offsetPx, minPx, maxPx } = fontSizeDisplayFluid;
  return Math.min(
    maxPx,
    Math.max(minPx, (windowWidth * viewportWidthPercent) / PERCENT + offsetPx)
  );
}
