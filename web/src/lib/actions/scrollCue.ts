// Scroll affordances for a tile grid that outgrows the dialog it scrolls in
// (issue #907: the coloring picker's opening viewport read as the whole
// catalog). Two independent cues, each attached as an action:
//
//   cutTrailingRow budgets the dialog's height so the fold lands *inside* a row
//                  instead of between two, making the clipped tile itself the
//                  signal that the list continues — the one cue a pre-reader can
//                  act on.
//   retireAtScrollEnd reports whether the end of the scrollable content is
//                  reached, so a bottom fade can stand down at the boundary
//                  instead of reading as permanent chrome.
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

/** Sub-pixel scroll offsets and fractional layout keep the arithmetic from
 *  landing exactly on the end. */
const SCROLL_END_EPSILON_PX = 1;

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
    for (let node: HTMLElement | null = element; node && node !== scrollport; ) {
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

/**
 * Reports whether the node's `<dialog>` scrollport is showing the end of its
 * content — true both at the bottom of a long list and throughout a list short
 * enough not to overflow at all.
 *
 * An IntersectionObserver on a trailing sentinel was the first shape here and
 * doesn't work: a closed dialog and a below-the-fold sentinel both read as "not
 * intersecting", so opening the picker is not an intersection change and the
 * observer stays silent exactly when the answer is first needed. Resizing from
 * zero *is* observable, so the ResizeObserver drives the reading and the scroll
 * listener only tracks movement within a scrollport already sized.
 */
export function retireAtScrollEnd(node: HTMLElement, onChange: (atEnd: boolean) => void) {
  const scrollport = node.closest('dialog');
  if (!scrollport) return;

  let atEnd = true;
  function read() {
    if (!scrollport) return;
    // A closed dialog measures zero and would read as "at the end"; adopting
    // that would retire the cue before the next open has been looked at.
    if (!scrollport.open) return;
    const next =
      scrollport.scrollTop + scrollport.clientHeight >=
      scrollport.scrollHeight - SCROLL_END_EPSILON_PX;
    if (next === atEnd) return;
    atEnd = next;
    onChange(next);
  }

  // Watching the scrollport rather than the content: it resizes on open, on
  // rotation, and whenever `cutTrailingRow` applies its budget, so the reading
  // is taken after the height it depends on has settled.
  const observer = new ResizeObserver(read);
  observer.observe(scrollport);
  scrollport.addEventListener('scroll', read, { passive: true });

  return {
    destroy() {
      observer.disconnect();
      scrollport.removeEventListener('scroll', read);
    },
  };
}
