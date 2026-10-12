// Scroll geometry for the wide Settings shell: where its continuous pane's
// reading line falls, where a jump parks a section, and how the table of
// contents keeps the spied row in view. Pure given the elements — the shell
// owns every piece of state these readings feed.

// How far past the pane's top edge the reading line sits. The highlight flips
// as a heading approaches that line rather than after it has scrolled away.
const SCROLLSPY_LINE_INSET_PX = 130;
// Fractional device pixels and pinch-zoomed content leave scrollTop a hair
// short of the true end, so "scrolled to the bottom" needs a tolerance.
const SCROLL_END_EPSILON_PX = 2;
// Where a table-of-contents jump parks the heading: just clear of the pane's
// top edge rather than flush against it. The page inventory's section-landed
// band has to cover it, which page-inventory.test.mjs checks against this export.
export const SECTION_JUMP_INSET_PX = 12;
// How far the spied row is kept clear of the nav's own edges, so a row the
// pane elected does not surface half-buried under the `local` covers in the
// nav's background. The two extreme rows sit against the ends of the scroll
// extent and cannot take the full clearance; the covers scroll with the list
// and paint over the shade there, which is what that attachment is for.
const NAV_ROW_CLEARANCE_PX = 24;

// The card flies in scaled from its opening button, so a rect read while that
// animation runs is not in CSS pixels. A scroller's own visual-to-layout ratio
// converts a measurement into whatever space the current frame is in.
function visualScale(el: HTMLElement): number {
  const height = el.clientHeight;
  return height ? el.getBoundingClientRect().height / height : 1;
}

// `sections` is the pane's stacking order and `elements` whichever of them
// exist yet. The end of the scroll only means the last section once every
// section is in the pane (`paneWhole`); while they are still arriving it is
// just the end of what has arrived, and electing the last section there would
// strobe the highlight down the column on open.
export function spiedSectionAt<Id extends string>(
  pane: HTMLElement,
  sections: readonly { readonly id: Id }[],
  elements: Partial<Record<Id, HTMLElement>>,
  paneWhole: boolean
): Id {
  const atScrollEnd =
    pane.scrollTop + pane.clientHeight >= pane.scrollHeight - SCROLL_END_EPSILON_PX;
  if (paneWhole && atScrollEnd) {
    return sections[sections.length - 1].id;
  }
  const line = pane.getBoundingClientRect().top + SCROLLSPY_LINE_INSET_PX * visualScale(pane);
  let current = sections[0].id;
  for (const section of sections) {
    const el = elements[section.id];
    if (el && el.getBoundingClientRect().top <= line) current = section.id;
  }
  return current;
}

// Arithmetic on the pane's own scrollTop, never `scrollIntoView`: that method
// scrolls *every* scrollable ancestor, and the card, the split and the dialog
// are all clipped boxes. Dividing the rect delta by the pane's visual scale
// lands the arithmetic in layout pixels, so neither the fly-in's transform nor
// a pinch-zoomed pane skews where the scroll ends up.
export function scrollPaneToSection(
  pane: HTMLElement,
  section: HTMLElement,
  behavior: ScrollBehavior
) {
  const offset =
    (section.getBoundingClientRect().top - pane.getBoundingClientRect().top) / visualScale(pane);
  pane.scrollTo({ top: pane.scrollTop + offset - SECTION_JUMP_INSET_PX, behavior });
}

// The pane's scroll elects the highlight, so — unlike a click, which can only
// land on a row already on screen — the spied row can be one the parent never
// scrolled the nav to. Wherever the list outgrows its column, that leaves the
// table of contents showing no highlight at all.
export function revealNavRow(nav: HTMLElement | undefined, id: string, behavior: ScrollBehavior) {
  const row = nav?.querySelector<HTMLElement>(`[data-section="${id}"]`);
  if (!nav || !row) return;
  const scale = visualScale(nav);
  const navRect = nav.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const clearance = NAV_ROW_CLEARANCE_PX * scale;
  const above = navRect.top + clearance - rowRect.top;
  const below = rowRect.bottom - (navRect.bottom - clearance);
  if (above <= 0 && below <= 0) return;
  const shift = above > 0 ? -above : below;
  nav.scrollTo({ top: nav.scrollTop + shift / scale, behavior });
}
