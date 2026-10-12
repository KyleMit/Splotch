// The segment skin's one raised thumb travels between cells instead of each
// cell painting its own fill. It is measured rather than computed from the
// index because cells are equal-width only under `fill`: hugging tracks and
// collapsed square options are not.
export function createSegmentThumb({
  track,
  cells,
  index,
}: {
  track: () => HTMLDivElement | undefined;
  cells: readonly (HTMLElement | undefined)[];
  index: () => number;
}) {
  let x = $state(0);
  let width = $state(0);
  // Off while the thumb is placed without travel: on first paint, and when a
  // resize moves the cells rather than the selection.
  let travels = $state(false);
  let travelFrame: number | undefined;

  function placeThumb(travel: boolean) {
    const target = cells[index()];
    if (!target) return;
    const firstPlacement = width === 0;
    x = target.offsetLeft;
    width = target.offsetWidth;
    if (travel && !firstPlacement) return;
    travels = false;
    if (travelFrame !== undefined) cancelAnimationFrame(travelFrame);
    travelFrame = requestAnimationFrame(() => {
      travelFrame = undefined;
      travels = true;
    });
  }

  $effect(() => {
    if (index() !== -1) placeThumb(true);
  });

  $effect(() => {
    const trackEl = track();
    if (index() === -1 || !trackEl) return;
    const observer = new ResizeObserver(() => placeThumb(false));
    observer.observe(trackEl);
    for (const cell of cells) if (cell) observer.observe(cell);
    return () => {
      observer.disconnect();
      if (travelFrame !== undefined) cancelAnimationFrame(travelFrame);
    };
  });

  return {
    get x() {
      return x;
    },
    get width() {
      return width;
    },
    get travels() {
      return travels;
    },
  };
}
