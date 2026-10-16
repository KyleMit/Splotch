import { isOfflinePageId } from '../offlineLibrary/identity';
import { OfflineBookOutline } from '../offlineLibrary/artwork';
import { BundledBookOutline } from './BundledBookArtwork';
import { useBundledPageOutlines } from './bundledOutlines';
import { isFarmPageId } from './bundledBooks';
import { G, Path } from '../platform/svg';
import { COLORING_PAGES, type PageId } from './pages';
import { PAPER_THEMES } from './theme';
import { useInkAppearance } from './InkAppearance';
import { pageArtTransform, type PaperBounds, type PaperSize } from './paperSpace';

const OUTLINE_WIDTH_PX = 7;

// A Farm page's line art can still be loading on web (bundledOutlines.web.ts), so a capture that
// draws the outline waits for it.
export function usePageOutlineReady(pageId: PageId): boolean {
  const farmPage = isFarmPageId(pageId) ? pageId : null;
  const outlines = useBundledPageOutlines(farmPage);
  return farmPage === null || outlines !== undefined;
}

export function pageHasOutline(pageId: PageId): boolean {
  return isOfflinePageId(pageId) || isFarmPageId(pageId) || COLORING_PAGES[pageId].paths.length > 0;
}

// Every page's art frame sits contain-fitted and centered on the paper (pageArtTransform).
export function PageOutline({
  pageId,
  size,
}: {
  pageId: PageId;
  size: PaperSize & Partial<Pick<PaperBounds, 'x' | 'y'>>;
}) {
  const { theme } = useInkAppearance();
  if (isOfflinePageId(pageId))
    return (
      <G transform={`translate(${size.x ?? 0} ${size.y ?? 0})`}>
        <OfflineBookOutline pageId={pageId} theme={theme} size={size} />
      </G>
    );
  if (isFarmPageId(pageId))
    return (
      <G transform={`translate(${size.x ?? 0} ${size.y ?? 0})`}>
        <BundledBookOutline pageId={pageId} theme={theme} size={size} />
      </G>
    );
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
