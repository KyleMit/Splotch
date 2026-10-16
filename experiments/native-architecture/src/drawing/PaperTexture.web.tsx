import { memo } from 'react';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import { webAssetUri } from '../platform/webAsset';
import { useDrawingTheme } from './DrawingAppearance';

const PAPER_TEXTURE = `url("${webAssetUri(handmadePaper)}")`;

export const PaperTexture = memo(function PaperTexture() {
  const { paper } = useDrawingTheme();
  return (
    <div
      aria-hidden
      data-testid="paper-texture"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `${paper} ${PAPER_TEXTURE}`,
      }}
    />
  );
});
