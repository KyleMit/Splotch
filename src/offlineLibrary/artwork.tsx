import { useContext } from 'react';
import { SvgXml } from '../platform/svg';
import type { OfflinePageId } from './catalog';
import type { PaperTheme } from '../drawing/theme';
import { artOrientation, type PaperSize } from '../drawing/paperSpace';
import { BookMagicFill } from '../drawing/BundledBookArtwork';
import { svgFrame } from '../drawing/bookFill';

import { OfflineArtworkScope } from './artworkContext';
function useOfflineArtwork(id: OfflinePageId, theme: PaperTheme, size: PaperSize) {
  const artwork = useContext(OfflineArtworkScope)[id]?.[artOrientation(size)][theme];
  if (!artwork) throw new Error('The coloring artwork is not ready.');
  return artwork;
}
export function OfflineBookOutline({
  pageId,
  theme,
  size,
}: {
  pageId: OfflinePageId;
  theme: PaperTheme;
  size: PaperSize;
}) {
  const art = useOfflineArtwork(pageId, theme, size);
  return (
    <SvgXml
      xml={art.outline}
      width={size.width}
      height={size.height}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}
export function OfflineMagicFill({
  pageId,
  theme,
  size,
}: {
  pageId: OfflinePageId;
  theme: PaperTheme;
  size: PaperSize;
}) {
  const art = useOfflineArtwork(pageId, theme, size);
  return <BookMagicFill href={art.fill} frame={svgFrame(art.outline)} size={size} />;
}
