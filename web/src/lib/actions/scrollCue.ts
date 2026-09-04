// Scroll affordances for content that outgrows the box it scrolls in (issue
// #907: the coloring picker's opening viewport read as the whole catalog). Two
// independent cues, each attached as an action:
//
//   cutTrailingRow budgets the dialog's height so the fold lands *inside* a row
//                  instead of between two, making the clipped tile itself the
//                  signal that the list continues — the one cue a pre-reader can
//                  act on. Tile grids only, and only where the height is ours to
//                  set.
//   observeContentEnd reports whether the end of the scrollable content is on
//                  screen, so a bottom fade can stand down both at the boundary
//                  and on content short enough never to have crossed it. Any
//                  scroller — it is what ScrollCue is built on.
//   coverScrollportPadding publishes the scrollport's bottom padding, the strip
//                  a bottom-stuck fade cannot reach on its own. Also ScrollCue's.
//
// Both re-evaluate off a ResizeObserver rather than a reactive open flag: a
// closed <dialog> is display:none, so every open resizes the elements involved
// from zero, and so does a rotation — which matters here because paper
// orientation is locked independently of the viewport (ADR-0050), so the tile
// aspect, and with it the row height, can change under an already-open picker.

/** How much of the trailing row stays visible below the fold. Half a tile is
 *  enough artwork to recognise as a tile and far too little to mistake for the
 *  last row. */
const TRAILING_ROW_PEEK_FRACTION = 0.5;

/** The most of the scrollport the cut may cost. Rows are a large share of a
 *  phone's picker and a small one of a roomy window, so this spends a few
 *  pixels to guarantee the cue where it's needed and declines to trade away a
 *  whole row of choices — on a desktop, or in a height-starved landscape
 *  phone — where it isn't. */
const MAX_CUT_GIVEAWAY_FRACTION = 0.15;

export interface RowCutMeasurements {
  /** Offset of the grid's top edge within the scrollable content. */
  gridTop: number;
  rowHeight: number;
  rowGap: number;
  rowCount: number;
  /** Height of the scrollport with no budget applied. */
  viewportHeight: number;
  /** Height of the scrollable content. */
  contentHeight: number;
}

/**
 * The scrollport height that puts the fold inside a row, or null when the
 * natural height should stand.
 *
 * Deriving the cap from the grid is the point: a flat cap (the picker's 85vh)
 * has no relationship to the row pitch, so on some devices it happens to land on
 * a clean row boundary — which is exactly the "looks complete" reading the issue
 * caught.
 */
export function trailingRowCutHeight(m: RowCutMeasurements): number | null {
  if (m.rowHeight <= 0 || m.viewportHeight <= 0) return null;
  if (m.contentHeight <= m.viewportHeight) return null;

  const rowPitch = m.rowHeight + m.rowGap;
  const peek = m.rowHeight * TRAILING_ROW_PEEK_FRACTION;
  const fullRows = Math.floor((m.viewportHeight - m.gridTop - peek) / rowPitch);

  // A viewport too short to seat a whole row plus the peek can't spare one. A
  // viewport that already seats every row is only overflowing by its own
  // padding, and cutting into that shows blank space rather than a tile.
  if (fullRows < 1 || fullRows >= m.rowCount) return null;

  const height = m.gridTop + fullRows * rowPitch + peek;
  if (height >= m.viewportHeight) return null;
  return height >= m.viewportHeight * (1 - MAX_CUT_GIVEAWAY_FRACTION) ? height : null;
}

/** Shortens the grid's scrolling `<dialog>` ancestor so its fold cuts a row. */
export function cutTrailingRow(node: HTMLElement) {
  const scrollport = node.closest('dialog');
  if (!scrollport) return;

  // Layout offsets, never getBoundingClientRect: the picker flies in on a
  // scaling transform, and the first observation lands mid-animation — box
  // rectangles are scaled there, so every measurement would be taken against a
  // dialog a fraction of its settled size.
  function offsetWithinScrollport(element: HTMLElement) {
    let top = 0;
    for (let node: HTMLElement | null = element; node && node !== scrollport;) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return top;
  }

  function measure() {
    if (!scrollport || !scrollport.open) return;
    const firstTile = node.firstElementChild as HTMLElement | null;
    if (!firstTile) return;

    // Measure against the natural height, not a cap left over from the last
    // layout, or each pass would budget down from the previous pass's budget.
    scrollport.style.removeProperty('max-height');

    const rowGap = Number.parseFloat(getComputedStyle(node).rowGap) || 0;
    const rowHeight = firstTile.offsetHeight;
    const height = trailingRowCutHeight({
      gridTop: offsetWithinScrollport(node),
      rowHeight,
      rowGap,
      rowCount: Math.round((node.offsetHeight + rowGap) / (rowHeight + rowGap)),
      viewportHeight: scrollport.clientHeight,
      contentHeight: scrollport.scrollHeight,
    });

    if (height !== null) scrollport.style.maxHeight = `${height}px`;
  }

  const observer = new ResizeObserver(measure);
  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
      scrollport.style.removeProperty('max-height');
    },
  };
}

/** An element with no layout box at all — the reading a closed `<dialog>`'s
 *  contents give, since it is `display: none`. */
function unrendered(box: DOMRectReadOnly): boolean {
  return box.width === 0 && box.height === 0;
}

/**
 * Attaches to a zero-height sentinel sitting at the end of a scroller's
 * content, and reports whether that end is on screen. True covers both states
 * that need no continuation cue — content short enough never to overflow, and a
 * scroller already at its end — leaving false for the one state that does.
 *
 * The whole three-state answer is that one intersection, so the browser
 * recomputes it as the scroller moves, the content grows, or the device
 * rotates: no scroll listener, and nothing measuring the DOM per frame. The
 * root is left implicit on purpose — an intersection is clipped by every
 * scrollable ancestor on the way up to it, so one observer serves a dialog's
 * scrollport, a settings pane, and the document itself without being told which
 * it is standing in.
 */
export function observeContentEnd(node: HTMLElement, onChange: (atEnd: boolean) => void) {
  let atEnd = true;

  const intersection = new IntersectionObserver(([entry]) => {
    // A surface nobody is looking at reads as "more below": it has no box, so
    // nothing intersects. Adopting that would arm the cue while it is hidden
    // and then visibly retire it a frame into the next open, on content that
    // never needed one.
    if (unrendered(entry.boundingClientRect)) return;
    if (entry.isIntersecting === atEnd) return;
    atEnd = entry.isIntersecting;
    onChange(atEnd);
  });
  intersection.observe(node);

  // Showing a hidden surface resizes it from zero without changing an
  // intersection that was already false, so the observer above stays silent on
  // exactly the open that first needs a reading. Re-observing forces a fresh
  // one; the sentinel spans its container, so its width tracks every show,
  // hide, and rotation without a second element to watch.
  const resize = new ResizeObserver(() => {
    intersection.unobserve(node);
    intersection.observe(node);
  });
  resize.observe(node);

  return {
    destroy() {
      intersection.disconnect();
      resize.disconnect();
    },
  };
}

/** The custom property `coverScrollportPadding` writes and ScrollCue's `bottom`
 *  reads. Not a tuning knob: it carries a measurement of the call site's own
 *  scroller, so nothing should declare it by hand. */
const SCROLLPORT_BOTTOM_PADDING_PROPERTY = '--scrollport-bottom-padding';

/** The scrollport a sticky descendant of `node` sticks to: the nearest ancestor
 *  that scrolls its content, or the document's scroller when none does. Only
 *  `visible` and `clip` leave an element out — `hidden` still establishes a
 *  scrollport, and so still bounds a sticky box. */
function nearestScrollport(node: HTMLElement): Element | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY !== 'visible' && overflowY !== 'clip') return el;
  }
  return document.scrollingElement;
}

/**
 * Lets a `bottom: 0` sticky element reach the bottom edge of the scrollport it
 * sticks to, by publishing that scrollport's bottom padding as
 * `--scrollport-bottom-padding` on the element for a negative inset to spend.
 *
 * A scroll container lays its children out in its *content* box and clips them
 * at its *padding* box, and a sticky inset resolves against the content box. So
 * anything still being scrolled past keeps showing through the strip of bottom
 * padding — while a fade stuck to `bottom: 0` stops exactly one padding above
 * it. The fade's opaque end then cuts a hard line across live content, with an
 * undimmed sliver of it below: the more bottom padding a scroller has, the less
 * the cue reads as a fade at all.
 */
export function coverScrollportPadding(node: HTMLElement) {
  const scrollport = nearestScrollport(node);
  if (!scrollport) return;

  function publish() {
    const padding = Number.parseFloat(getComputedStyle(scrollport!).paddingBottom) || 0;
    node.style.setProperty(SCROLLPORT_BOTTOM_PADDING_PROPERTY, `${padding}px`);
  }
  publish();

  // Padding is a declaration, not a measurement, so nothing reports it changing
  // — but every way it changes here (a media query re-evaluating on a rotate or
  // a resize) resizes the scrollport in the same pass.
  const observer = new ResizeObserver(publish);
  observer.observe(scrollport);

  return {
    destroy() {
      observer.disconnect();
      node.style.removeProperty(SCROLLPORT_BOTTOM_PADDING_PROPERTY);
    },
  };
}
