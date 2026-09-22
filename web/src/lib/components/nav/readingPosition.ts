// The window scrollspy behind a standalone page's contents rail and disclosure
// (/privacy, /accessibility): rAF-throttled, the /design pattern.

// A section is the one being read once its top has climbed within this
// distance of the viewport top. Deeper than either layout parks a jumped-to
// section, so arriving from the contents marks the section it landed on.
export const SPY_LINE_PX = 128;

export interface ReadingPosition<Id extends string> {
  /** The scrollspied section — the last one whose top has crossed the line. */
  active: Id;
  /** False while the reader is still above the first section. */
  entered: boolean;
}

// Returns its teardown. `sections` is the page's ordered contents list; the
// first entry is the seed, so the rail is never blank at the top.
export function watchReadingPosition<Id extends string>(
  sections: readonly { id: Id }[],
  onChange: (reading: ReadingPosition<Id>) => void
): () => void {
  let raf = 0;
  const spy = () => {
    raf = 0;
    let active: Id = sections[0].id;
    let entered = false;
    for (const { id } of sections) {
      const section = document.getElementById(id);
      if (section && section.getBoundingClientRect().top <= SPY_LINE_PX) {
        active = id;
        entered = true;
      }
    }
    onChange({ active, entered });
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(spy);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (raf) cancelAnimationFrame(raf);
  };
}
