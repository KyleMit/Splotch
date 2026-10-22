import { css } from 'react-strict-dom';
import { DRAWING_ON_BRAND, type DrawingTheme } from '../drawing/theme';
import { colorPainter } from './greyed';

const badges = css.create({
  painted: (fill: string, text: string) => ({ backgroundColor: fill, color: text }),
});

// A tile's grey filter painted into its own colors, which the native renderers cannot be trusted to
// apply (greyed.ts): the filter its icon paints, the AI Image Button badge's face under it, and the
// flat badge's paper ring. The tile itself then carries no filter.
export function paintedTile(
  filter: string | undefined,
  { brandSolid, paper }: Pick<DrawingTheme, 'brandSolid' | 'paper'>
) {
  if (!filter) return { filter, badge: null, ring: paper };
  const paint = colorPainter(filter);
  return {
    filter,
    badge: badges.painted(paint(brandSolid), paint(DRAWING_ON_BRAND)),
    ring: paint(paper),
  };
}
