import { isOfflinePageId } from '../offlineLibrary/identity';
import { OfflineBookOutline } from '../offlineLibrary/artwork';
import { BundledBookOutline } from './BundledBookArtwork';
import { isFarmPageId } from './bundledBooks';
import { G, Path } from 'react-native-svg';
import { COLORING_PAGES, type PageId } from './pages';
import { PAPER_THEMES } from './theme';
import { useInkAppearance } from './InkAppearance';
import { pageArtTransform, type PaperSize } from './paperSpace';

const OUTLINE_WIDTH_PX = 7;

// Every page's art frame sits contain-fitted and centered on the paper (pageArtTransform).
export function PageOutline({ pageId, size }: { pageId: PageId; size: PaperSize }) {
  const { theme } = useInkAppearance();
  if (isOfflinePageId(pageId))
    return <OfflineBookOutline pageId={pageId} theme={theme} size={size} />;
  if (isFarmPageId(pageId)) return <BundledBookOutline pageId={pageId} theme={theme} size={size} />;
  const paths = COLORING_PAGES[pageId].paths;
  if (paths.length === 0) return null;
  return (
    <G transform={pageArtTransform(size)}>
      {paths.map((path, index) => (
        <Path
          key={index}
          d={path}
          fill="none"
          stroke={PAPER_THEMES[theme].outline}
          strokeWidth={OUTLINE_WIDTH_PX}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </G>
  );
}
