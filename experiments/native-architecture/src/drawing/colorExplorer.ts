import { isCustomColor, type CustomColor } from './palette';

export const EXPLORER_COLUMNS = 5;
export const EXPLORER_ROWS = 5;
const HUE_SECTORS = 6;
const CHANNEL_MAX = 255;

export function exploreColor(x: number, y: number, width: number, height: number): CustomColor {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    throw new Error('Color explorer is not ready.');
  const hue = Math.max(0, Math.min(1, x / width)) * HUE_SECTORS;
  const vertical = Math.max(0, Math.min(1, y / height)) * 2;
  const saturation = Math.min(1, vertical);
  const brightness = Math.min(1, 2 - vertical);
  const chroma = brightness * saturation;
  const intermediate = chroma * (1 - Math.abs((hue % 2) - 1));
  const sector = Math.floor(hue) % HUE_SECTORS;
  const channels = [
    [chroma, intermediate, 0],
    [intermediate, chroma, 0],
    [0, chroma, intermediate],
    [0, intermediate, chroma],
    [intermediate, 0, chroma],
    [chroma, 0, intermediate],
  ][sector];
  const hex = `#${channels
    .map((value) =>
      Math.round((value + brightness - chroma) * CHANNEL_MAX)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
    .toUpperCase()}`;
  if (!isCustomColor(hex)) throw new Error('Color explorer produced an invalid color.');
  return hex;
}

export const EXPLORER_TILES = Array.from(
  { length: EXPLORER_COLUMNS * EXPLORER_ROWS },
  (_, index) => {
    const x = (index % EXPLORER_COLUMNS) + 0.5;
    const y = Math.floor(index / EXPLORER_COLUMNS) + 0.5;
    return { x, y, color: exploreColor(x, y, EXPLORER_COLUMNS, EXPLORER_ROWS) };
  }
);

export function isDiscreteColorActivation(source: unknown): boolean {
  return (
    typeof source === 'object' && source !== null && (!('detail' in source) || source.detail === 0)
  );
}
