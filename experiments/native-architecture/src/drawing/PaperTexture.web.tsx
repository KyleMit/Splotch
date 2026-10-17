import { memo } from 'react';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import { webAssetUri } from '../platform/webAsset';
import { useDrawingTheme } from './DrawingAppearance';
import type { Point } from './model';

const PAPER_TEXTURE = `url("${webAssetUri(handmadePaper)}")`;

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
        background: `${paper} ${PAPER_TEXTURE} ${rightInset ? `calc(${rightInset - origin.x}px - 100vw)` : `${-origin.x}px`} ${-origin.y}px`,
      }}
    />
  );
});
