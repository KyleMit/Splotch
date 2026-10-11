import { PAPER_WIDTH, PAPER_HEIGHT } from '../drawing/model';
import { useContext } from 'react';
import { Image, SvgXml } from 'react-native-svg';
import type { OfflinePageId } from './catalog';
import type { PaperTheme } from '../drawing/theme';
import { BundledFillLoadScope } from '../drawing/BundledBookArtwork';

import { OfflineArtworkScope } from './artworkContext';
export function useOfflineArtwork(id: OfflinePageId, theme: PaperTheme) {
  const artwork = useContext(OfflineArtworkScope)[id]?.[theme];
  if (!artwork) throw new Error('The coloring artwork is not ready.');
  return artwork;
}
export function OfflineBookOutline({
  pageId,
  theme,
}: {
  pageId: OfflinePageId;
  theme: PaperTheme;
}) {
  const art = useOfflineArtwork(pageId, theme);
  return (
    <SvgXml
      xml={art.outline}
      width={PAPER_WIDTH}
      height={PAPER_HEIGHT}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}
export function OfflineMagicFill({ pageId, theme }: { pageId: OfflinePageId; theme: PaperTheme }) {
  const art = useOfflineArtwork(pageId, theme);
  const onLoad = useContext(BundledFillLoadScope);
  return (
    <Image
      href={art.fill}
      x={0}
      y={0}
      width={PAPER_WIDTH}
      height={PAPER_HEIGHT}
      preserveAspectRatio="xMidYMid meet"
      onLoad={() => onLoad?.()}
    />
  );
}
