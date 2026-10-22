import { describe, expect, it } from 'vitest';
import {
  revealNavRow,
  sectionScrollTop,
  spiedSectionAt as shippingSpiedSectionAt,
} from '../../src/lib/components/settings/paneScroll.ts';
import {
  navRevealOffset,
  sectionJumpOffset,
  spiedSectionAt,
} from '../../src/settings/settingsPane.ts';

// Shipping reads the wide Settings pane through element rects; native reads the same geometry as
// numbers. These stand-ins give shipping's functions a pane, its sections and the nav rows at
// known offsets, unscaled, so both sides answer the same scroll.
const PANE_TOP_PX = 96;
const VIEWPORT_PX = 520;
const IDS = ['appearance', 'sound', 'controls', 'saving', 'coloring', 'about'];
const HEIGHTS = [340, 180, 610, 260, 90, 150];
const OFFSETS = HEIGHTS.map((_, index) => HEIGHTS.slice(0, index).reduce((sum, h) => sum + h, 0));
const CONTENT_PX = HEIGHTS.reduce((sum, height) => sum + height, 0);
const SCROLL_STEP_PX = 7;

function scroller(scrollTop, viewport = VIEWPORT_PX, content = CONTENT_PX) {
  return {
    scrollTop,
    clientHeight: viewport,
    scrollHeight: content,
    getBoundingClientRect: () => ({
      top: PANE_TOP_PX,
      bottom: PANE_TOP_PX + viewport,
      height: viewport,
    }),
    scrollTo({ top }) {
      this.scrolledTo = top;
    },
  };
}

// An element at `offset` in the scrolled content, as its rect reads at this scroll.
const placed = (scrollTop, offset, height = 0) => ({
  getBoundingClientRect: () => ({
    top: PANE_TOP_PX + offset - scrollTop,
    bottom: PANE_TOP_PX + offset - scrollTop + height,
  }),
});

// A browser clamps scrollTo into the scroll range; native clamps the offset itself.
const clampScroll = (top, viewport, content) =>
  Math.min(Math.max(0, top), Math.max(0, content - viewport));

const scrollTops = [];
for (let top = 0; top <= CONTENT_PX - VIEWPORT_PX; top += SCROLL_STEP_PX) scrollTops.push(top);
scrollTops.push(CONTENT_PX - VIEWPORT_PX - 1, CONTENT_PX - VIEWPORT_PX);

describe('the native wide Settings pane against paneScroll.ts', () => {
  it('spies the same section as shipping at every scroll position once the pane is whole', () => {
    const sections = IDS.map((id) => ({ id }));
    for (const top of scrollTops) {
      const elements = Object.fromEntries(IDS.map((id, i) => [id, placed(top, OFFSETS[i])]));
      const shipping = shippingSpiedSectionAt(scroller(top), sections, elements, true);
      const native = spiedSectionAt(IDS, OFFSETS, {
        offset: top,
        viewport: VIEWPORT_PX,
        content: CONTENT_PX,
      });
      expect(native, `scrollTop ${top}`).toBe(shipping);
    }
  });

  it('parks a jumped-to section where shipping does, from any scroll position', () => {
    for (const top of [0, 133, CONTENT_PX - VIEWPORT_PX])
      OFFSETS.forEach((offset, index) => {
        const shipping = sectionScrollTop(scroller(top), placed(top, offset));
        expect(sectionJumpOffset(offset), `${IDS[index]} from ${top}`).toBe(Math.max(0, shipping));
      });
  });

  it('scrolls the table of contents to reveal a spied row exactly when shipping does', () => {
    const NAV_VIEWPORT_PX = 230;
    const ROW_PX = 44;
    const navContent = IDS.length * ROW_PX;
    for (let navTop = 0; navTop <= navContent - NAV_VIEWPORT_PX; navTop += 5)
      IDS.forEach((id, index) => {
        const row = { top: index * ROW_PX, height: ROW_PX };
        const nav = scroller(navTop, NAV_VIEWPORT_PX, navContent);
        nav.querySelector = (selector) =>
          selector === `[data-section="${id}"]` ? placed(navTop, row.top, row.height) : null;
        revealNavRow(nav, id, 'auto');
        const shipping =
          nav.scrolledTo === undefined
            ? null
            : clampScroll(nav.scrolledTo, NAV_VIEWPORT_PX, navContent);
        const native = navRevealOffset(row, {
          offset: navTop,
          viewport: NAV_VIEWPORT_PX,
          content: navContent,
        });
        expect(native, `${id} at nav ${navTop}`).toBe(shipping);
      });
  });
});
