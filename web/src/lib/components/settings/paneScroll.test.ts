import { describe, expect, it, vi } from 'vitest';
import {
  SECTION_JUMP_INSET_PX,
  revealNavRow,
  scrollPaneToSection,
  spiedSectionAt,
} from './paneScroll';

// Every case is arranged in layout pixels inside a scroller whose top edge is
// the viewport's, then drawn at a visual scale the way the card's fly-in (a
// transform) or a pinch-zoomed pane draws it: rects scale, clientHeight and
// scrollTop do not.
function drawnAt(el: HTMLElement, { top, height }: { top: number; height: number }, scale: number) {
  el.getBoundingClientRect = () => new DOMRect(0, top * scale, 100, height * scale);
  return el;
}

function scroller({
  height,
  scale,
  scrollTop = 0,
  scrollHeight = 10_000,
}: {
  height: number;
  scale: number;
  scrollTop?: number;
  scrollHeight?: number;
}) {
  const el = drawnAt(document.createElement('div'), { top: 0, height }, scale);
  Object.defineProperty(el, 'clientHeight', { value: height });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(el, 'scrollTop', { value: scrollTop });
  const scrollTo = vi.fn<(options: ScrollToOptions) => void>();
  el.scrollTo = scrollTo as HTMLElement['scrollTo'];
  return { el, scrollTo };
}

function childAt(top: number, height: number, scale: number) {
  return drawnAt(document.createElement('section'), { top, height }, scale);
}

const SECTIONS = [{ id: 'first' }, { id: 'middle' }, { id: 'last' }] as const;
type Id = (typeof SECTIONS)[number]['id'];
const PANE_HEIGHT_PX = 600;
const HEADING_HEIGHT_PX = 300;

function headings(tops: Partial<Record<Id, number>>, scale: number) {
  const elements: Partial<Record<Id, HTMLElement>> = {};
  for (const { id } of SECTIONS) {
    const top = tops[id];
    if (top !== undefined) elements[id] = childAt(top, HEADING_HEIGHT_PX, scale);
  }
  return elements;
}

describe('spiedSectionAt', () => {
  it('elects the last heading at or above the reading line', () => {
    const pane = scroller({ height: PANE_HEIGHT_PX, scale: 1 }).el;
    const elements = headings({ first: 0, middle: 10, last: 5000 }, 1);
    expect(spiedSectionAt(pane, SECTIONS, elements, true)).toBe('middle');
  });

  it('falls back to the first section before any heading reaches the line', () => {
    const pane = scroller({ height: PANE_HEIGHT_PX, scale: 1 }).el;
    const elements = headings({ first: 5000, middle: 6000, last: 7000 }, 1);
    expect(spiedSectionAt(pane, SECTIONS, elements, true)).toBe('first');
  });

  it('passes over a section with no element yet', () => {
    const pane = scroller({ height: PANE_HEIGHT_PX, scale: 1 }).el;
    const elements = headings({ first: 0, last: 10 }, 1);
    expect(spiedSectionAt(pane, SECTIONS, elements, false)).toBe('last');
  });

  // Scales far enough apart that a line left in visual pixels would elect the
  // first section at one extreme and the last at the other.
  it('elects the same section while the pane is drawn scaled', () => {
    for (const scale of [0.01, 100]) {
      const pane = scroller({ height: PANE_HEIGHT_PX, scale }).el;
      const elements = headings({ first: 0, middle: 10, last: 5000 }, scale);
      expect(spiedSectionAt(pane, SECTIONS, elements, true)).toBe('middle');
    }
  });

  // While sections are still arriving, the end of the scroll is only the end of
  // what has arrived, and electing the last section there would strobe the
  // highlight down the column on open.
  it('elects the last section at the scroll end only once the pane is whole', () => {
    const pane = scroller({ height: 600, scale: 1, scrollTop: 400, scrollHeight: 1000 }).el;
    const elements = headings({ first: -400 }, 1);

    expect(spiedSectionAt(pane, SECTIONS, elements, true)).toBe('last');
    expect(spiedSectionAt(pane, SECTIONS, elements, false)).toBe('first');
  });
});

describe('scrollPaneToSection', () => {
  it('parks the heading the jump inset below the pane top, in layout pixels', () => {
    for (const scale of [1, 0.5, 2]) {
      const pane = scroller({ height: PANE_HEIGHT_PX, scale, scrollTop: 300 });

      scrollPaneToSection(pane.el, childAt(250, 100, scale), 'smooth');

      expect(pane.scrollTo).toHaveBeenCalledWith({
        top: 300 + 250 - SECTION_JUMP_INSET_PX,
        behavior: 'smooth',
      });
    }
  });

  // A pane with no layout box yet reports a zero height; its rect delta is
  // taken as it is rather than divided by that zero.
  it('treats a pane with no layout box as unscaled', () => {
    const pane = scroller({ height: 0, scale: 1 });

    scrollPaneToSection(pane.el, childAt(80, 100, 1), 'auto');

    expect(pane.scrollTo).toHaveBeenCalledWith({
      top: 80 - SECTION_JUMP_INSET_PX,
      behavior: 'auto',
    });
  });
});

describe('revealNavRow', () => {
  const NAV_HEIGHT_PX = 400;
  const NAV_SCROLL_TOP_PX = 100;
  const ROW_HEIGHT_PX = 40;

  function navWithRow(rowTop: number, scale: number) {
    const nav = scroller({ height: NAV_HEIGHT_PX, scale, scrollTop: NAV_SCROLL_TOP_PX });
    const row = childAt(rowTop, ROW_HEIGHT_PX, scale);
    row.dataset.section = 'middle';
    nav.el.append(row);
    return nav;
  }

  function revealedTop(rowTop: number, scale: number) {
    const nav = navWithRow(rowTop, scale);
    revealNavRow(nav.el, 'middle', 'auto');
    return nav.scrollTo.mock.calls[0]?.[0].top;
  }

  it('leaves a row well inside the column where it is', () => {
    expect(revealedTop(NAV_HEIGHT_PX / 2, 1)).toBeUndefined();
  });

  // Past the bare overflow, by the clearance that keeps the row off the edge
  // shade.
  it('brings a row below the column up past its bottom edge', () => {
    const rowTop = 500;
    const overflow = rowTop + ROW_HEIGHT_PX - NAV_HEIGHT_PX;
    expect(revealedTop(rowTop, 1)).toBeGreaterThan(NAV_SCROLL_TOP_PX + overflow);
  });

  it('brings a row above the column down past its top edge', () => {
    const rowTop = -200;
    expect(revealedTop(rowTop, 1)).toBeLessThan(NAV_SCROLL_TOP_PX + rowTop);
  });

  it('scrolls the same layout distance whatever scale the column is drawn at', () => {
    const unscaled = revealedTop(500, 1);
    expect(revealedTop(500, 0.5)).toBeCloseTo(unscaled ?? Number.NaN);
    expect(revealedTop(500, 2)).toBeCloseTo(unscaled ?? Number.NaN);
  });

  it('passes the requested behaviour through', () => {
    const nav = navWithRow(500, 1);
    revealNavRow(nav.el, 'middle', 'smooth');
    expect(nav.scrollTo.mock.calls[0]?.[0].behavior).toBe('smooth');
  });

  it('does nothing without a nav or a matching row', () => {
    const nav = navWithRow(500, 1);
    revealNavRow(undefined, 'middle', 'auto');
    revealNavRow(nav.el, 'last', 'auto');
    expect(nav.scrollTo).not.toHaveBeenCalled();
  });
});
