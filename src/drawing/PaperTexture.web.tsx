import { memo } from 'react';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import { webAssetUri } from '../platform/webAsset';
import { PAPER_TEXTURE_PROPERTY } from '../platform/firstFrameContract';
import { useDrawingTheme } from './DrawingAppearance';
import type { Point } from './model';

// The prerendered shell inlines the texture under this property, so the first frame paints it without
// a request; anywhere else the file loads as before.
const PAPER_TEXTURE = `var(${PAPER_TEXTURE_PROPERTY}, url("${webAssetUri(handmadePaper)}"))`;

export const PaperTexture = memo(function PaperTexture({
  rightInset = 0,
  origin = { x: 0, y: 0 },
}: {
  rightInset?: number;
  origin?: Point;
}) {
  const { paper } = useDrawingTheme();
  return (
    <div
      aria-hidden
      data-testid="paper-texture"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        // Longhands: a var() inside the shorthand would leave every longhand unreadable.
        backgroundColor: paper,
        backgroundImage: PAPER_TEXTURE,
        backgroundPosition: `${rightInset ? `calc(${rightInset - origin.x}px - 100vw)` : `${-origin.x}px`} ${-origin.y}px`,
      }}
    />
  );
});
