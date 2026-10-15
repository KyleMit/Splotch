import { SECTION_JUMP_INSET_PX } from '../../../../web/src/lib/components/settings/paneScroll';
import type { ScrollExtent } from '../rsdDrawing/RsdScrollCue';

// The wide Settings shell's scroll geometry (paneScroll.ts): where the pane's reading line falls,
// where a jump parks a section, and how the table of contents keeps the spied row in view.
// paneScroll.ts keeps these three to itself; native-settings-layouts.test.mjs reads each from it.
// The reading line sits this far below the pane's top edge, so the highlight flips as a heading
// approaches it rather than after it has scrolled away.
export const SCROLLSPY_LINE_INSET_PX = 130;
// Fractional device pixels leave a scroll a hair short of its true end.
export const SCROLL_END_EPSILON_PX = 2;
// The spied row stays this clear of the nav's edges, out from under their shades.
export const NAV_ROW_CLEARANCE_PX = 24;

// Each section's offset in the pane's scrolled content. The sections stack, so an offset depends
// only on the heights above it — which also keeps it true when a section above grows, where a
// position report would not arrive for the sections it pushed down. Null until every height is in.
export function stackedOffsets(
  heights: readonly (number | undefined)[],
  count: number,
  top: number,
  gap: number
): number[] | null {
  const offsets: number[] = [];
  let next = top;
  for (let index = 0; index < count; index++) {
    const height = heights[index];
    if (height === undefined) return null;
    offsets.push(next);
    next += height + gap;
  }
  return offsets;
}

// The section the reading position sits in. The end of the scroll means the last section, which
// may be too short to ever reach the reading line on its own.
export function spiedSectionAt<Id extends string>(
  ids: readonly Id[],
  offsets: readonly number[],
  { offset, viewport, content }: ScrollExtent
): Id {
  if (viewport > 0 && content > 0 && offset + viewport >= content - SCROLL_END_EPSILON_PX)
    return ids[ids.length - 1];
  const line = offset + SCROLLSPY_LINE_INSET_PX;
  let current = ids[0];
  ids.forEach((id, index) => {
    if (offsets[index] <= line) current = id;
  });
  return current;
}

// Where a table-of-contents jump scrolls the pane: the heading just clear of its top edge.
export function sectionJumpOffset(sectionOffset: number) {
  return Math.max(0, sectionOffset - SECTION_JUMP_INSET_PX);
}

// The nav offset that brings a row the pane elected back into view, or null where it already is.
// The pane's scroll elects the row, so it can be one the parent never scrolled the nav to.
export function navRevealOffset(
  row: { top: number; height: number },
  nav: ScrollExtent
): number | null {
  const above = nav.offset + NAV_ROW_CLEARANCE_PX - row.top;
  const below = row.top + row.height - (nav.offset + nav.viewport - NAV_ROW_CLEARANCE_PX);
  if (above <= 0 && below <= 0) return null;
  const target = nav.offset + (above > 0 ? -above : below);
  return Math.min(Math.max(0, target), Math.max(0, nav.content - nav.viewport));
}
