import { useContext } from 'react';
import { Image, SvgXml } from 'react-native-svg';
import type { OfflinePageId } from './catalog';
import type { PaperTheme } from '../drawing/theme';
import type { PaperSize } from '../drawing/paperSpace';
import { BundledFillLoadScope } from '../drawing/BundledBookArtwork';

import { OfflineArtworkScope } from './artworkContext';
function useOfflineArtwork(id: OfflinePageId, theme: PaperTheme) {
  const artwork = useContext(OfflineArtworkScope)[id]?.[theme];
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
  const art = useOfflineArtwork(pageId, theme);
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
  const art = useOfflineArtwork(pageId, theme);
  const onLoad = useContext(BundledFillLoadScope);
  return (
    <Image
      href={art.fill}
      x={0}
      y={0}
      width={size.width}
      height={size.height}
      preserveAspectRatio="xMidYMid meet"
      onLoad={() => onLoad?.()}
    />
  );
}
