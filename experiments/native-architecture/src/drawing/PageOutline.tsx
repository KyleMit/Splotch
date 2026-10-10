import { Path } from 'react-native-svg';
import { COLORING_PAGES, type PageId } from './pages';
import { PAPER_THEMES } from './theme';
import { useInkAppearance } from './InkAppearance';

const OUTLINE_WIDTH_PX = 7;

export function PageOutline({ pageId }: { pageId: PageId }) {
  const { theme } = useInkAppearance();
  return COLORING_PAGES[pageId].paths.map((path, index) => (
    <Path
      key={index}
      d={path}
      fill="none"
      stroke={PAPER_THEMES[theme].outline}
      strokeWidth={OUTLINE_WIDTH_PX}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}
