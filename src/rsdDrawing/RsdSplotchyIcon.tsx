import { SvgXml } from '../platform/svg';
import { useSplotchyMarkup } from './iconRegistry';
import { EMPTY_ICON_MARKUP } from './RsdIcon';

// The shipping SplotchyIcon.svelte: the mascot's own palette in both themes, never re-inked, and
// loaded apart from the icon set as shipping loads it by URL.
export function RsdSplotchyIcon({ size }: { size: number }) {
  return <SvgXml xml={useSplotchyMarkup() ?? EMPTY_ICON_MARKUP} width={size} height={size} />;
}
