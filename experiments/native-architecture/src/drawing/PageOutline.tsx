import { Path } from 'react-native-svg';
import { COLORING_PAGES, type PageId } from './pages';
import { DRAWING_THEME } from './theme';

const OUTLINE_WIDTH_PX = 7;

export function PageOutline({ pageId }: { pageId: PageId }) {
  return COLORING_PAGES[pageId].paths.map((path, index) => (
    <Path
      key={index}
      d={path}
      fill="none"
      stroke={DRAWING_THEME.textStrong}
      strokeWidth={OUTLINE_WIDTH_PX}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}
