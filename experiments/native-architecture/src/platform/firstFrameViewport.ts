import type { ScaledSize } from 'react-native';

// The root attribute naming the viewport its prerendered markup was laid out for, as
// `<width>x<height>@<scale>`; tools/migration/prerender-native-web.mjs writes it.
export const FIRST_FRAME_VIEWPORT_ATTRIBUTE = 'data-first-frame-viewport';

const VIEWPORT = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/;

export function formatFirstFrameViewport({ width, height, scale }: ScaledSize) {
  return `${width}x${height}@${scale}`;
}

export function parseFirstFrameViewport(value: string | null): ScaledSize | null {
  const match = value === null ? null : VIEWPORT.exec(value);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    scale: Number(match[3]),
    fontScale: 1,
  };
}
