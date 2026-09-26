import { paintStrokeFootprint, strokeGhostReadsTiles, strokeMotionBounds } from './inkMotionBounds';
import { renderOp, type StrokeGroupCommand } from './strokeOps';
import {
  containFit,
  paperToView,
  viewMatrix,
  viewToPaper,
  viewTransformCss,
  type EngineViewState,
} from './paperView';
import { COLORING_OVERLAY_ID } from './overlay';
import { isIosDevice } from '$lib/platform';
import { prefersReducedMotion } from '$lib/platform/reducedMotion';

// How far the undo ghost drifts toward the undo button as it fades, as a
// fraction of the distance between their centres: far enough to read as ink
// pulled back into the pen, short enough that the stroke never leaves its place.
const UNDO_INK_DRIFT_FRACTION = 0.28;

// The clear sheet scales about a point pulled this fraction of the way past the
// clear button's centre toward the top-right corner it docks in, so the sheet
// travels a straight line into the button and slides under it rather than
// shrinking onto its face.
const CLEAR_SHEET_CORNER_PULL = 0.34;

// Paired with the clear-sheet animation in app.css, which inkMotion.test.ts
// reads back; the clear gesture holds its exit for the same time.
export const CLEAR_SHEET_DURATION_MS = 560;

export interface ClientPoint {
  x: number;
  y: number;
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// The undo restore writes the very tiles the ghost has just read. Left
// pending, WebKit resolves those reads at presentation after the write, and
// on a physical iPad that frame overran the action-frame gate on a quarter of
// crayon undos. Reading one pixel back resolves them now, before the write,
// for a few milliseconds of undo time; the ghost's pixels are unchanged.
// Android Chrome is the reason this is not unconditional: there the same
// readback is a synchronous GPU round trip that made the first undo block for
// over a second and every later one slower.
// Evidence: docs/scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/.
function settleTileReads(target: CanvasRenderingContext2D) {
  target.getImageData(0, 0, 1, 1);
}

// The drift is measured in client space, where the button lives, and handed to
// the ghost in its own paper space, which the rotation lock may have turned.
function driftTowards(
  image: HTMLCanvasElement,
  host: HTMLElement | null,
  target: HTMLElement | null | undefined,
  view: EngineViewState,
  ghostCenter: ClientPoint
) {
  const targetRect = target?.getBoundingClientRect();
  const hostRect = host?.getBoundingClientRect();
  if (!targetRect?.width || !hostRect) return;
  const center = paperToView(view, ghostCenter.x, ghostCenter.y);
  const dx =
    (targetRect.left + targetRect.width / 2 - hostRect.left - center.x) * UNDO_INK_DRIFT_FRACTION;
  const dy =
    (targetRect.top + targetRect.height / 2 - hostRect.top - center.y) * UNDO_INK_DRIFT_FRACTION;
  const drift = viewToPaper(view, view.tx + dx, view.ty + dy);
  image.style.setProperty('--ink-tx', `${drift.x}px`);
  image.style.setProperty('--ink-ty', `${drift.y}px`);
}

// The ghost's animation is paused in app.css and starts here, one frame after
// the one that paints it. A tile-read ghost carries a stroke-sized canvas
// whose pixels are rasterized during that first frame — 70 ms for a
// paper-width crayon stroke on an iPad — while a CSS animation's clock starts
// at the frame it was created in either way, so the fade was already a quarter
// over by the time any of it reached the screen (issue #1775). Where
// settleTileReads runs, that raster is paid inside undo instead, and the pause
// still covers every browser that defers it. The first callback runs at the
// top of the painting frame, before its pixels exist; the frame after it
// begins only once they do.
function runWhenPainted(image: HTMLCanvasElement) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (image.isConnected) image.classList.add('undo-ink-running');
    })
  );
}

// The coloring page's line art stays on the page through a clear, but it sits
// above the ink, so a sheet leaving without it would blank the art for the
// first frame and reveal it again as the sheet shrinks.
function paintColoringArt(target: CanvasRenderingContext2D, view: EngineViewState, scale: number) {
  const art = document.getElementById(COLORING_OVERLAY_ID);
  if (!(art instanceof HTMLImageElement) || art.hidden || !art.naturalWidth || !art.complete)
    return;
  const box = { width: view.paperCssWidth * scale, height: view.paperCssHeight * scale };
  const fit = containFit({ width: art.naturalWidth, height: art.naturalHeight }, box);
  target.globalCompositeOperation = 'source-over';
  target.drawImage(
    art,
    fit.offsetX,
    fit.offsetY,
    art.naturalWidth * fit.scale,
    art.naturalHeight * fit.scale
  );
}

// `paint` lays the visible live tiles onto a target under its current transform;
// both ghosts read their pixels from it rather than replaying history.
// `settlesTileReads` says whether this browser should resolve a tile-read
// ghost's reads before the undo restore writes those tiles (see settleTileReads);
// only tests pass anything but the default.
export function createInkMotion(
  paint: (target: CanvasRenderingContext2D) => void,
  settlesTileReads: () => boolean = isIosDevice
) {
  let overlay: HTMLDivElement | null = null;
  let pendingSubtract: CanvasRenderingContext2D | null = null;

  function cancel() {
    overlay?.remove();
    overlay = null;
    pendingSubtract = null;
  }

  function present(host: HTMLElement | null, image: HTMLCanvasElement, transform: string) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ink-motion';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.transform = transform;
    wrapper.append(image);
    const dispose = () => {
      wrapper.remove();
      image.width = 0;
      image.height = 0;
      if (overlay === wrapper) overlay = null;
    };
    image.addEventListener('animationend', dispose, { once: true });
    image.addEventListener('animationcancel', dispose, { once: true });
    host?.append(wrapper);
    overlay = wrapper;
    return wrapper;
  }

  // Copies the visible live tiles into the overlay and keeps only the command's
  // footprint. The mask is applied once with destination-in after every tile
  // is composited: applying it per tile blit would clear everything outside
  // each successive tile instead. The target keeps its paper-space transform
  // so the subtraction pass can paint the tiles again without restoring it.
  function ghostFromTiles(
    target: CanvasRenderingContext2D,
    command: StrokeGroupCommand,
    bounds: { left: number; top: number; width: number; height: number }
  ) {
    const mask = canvasOf(bounds.width, bounds.height);
    const maskTarget = mask.getContext('2d');
    if (!maskTarget) return;
    maskTarget.translate(-bounds.left, -bounds.top);
    paintStrokeFootprint(maskTarget, command);
    paint(target);
    target.globalCompositeOperation = 'destination-in';
    target.drawImage(mask, bounds.left, bounds.top);
    if (settlesTileReads()) settleTileReads(target);
    mask.width = 0;
    pendingSubtract = target;
  }

  // A crayon or magic ghost is the undone ink as it stands on the live tiles.
  // Replaying those ops re-rasterizes the whole stroke through the crayon pass
  // buffer, which is the cost the 1751 bisect measured on the undo path; the
  // tiles already hold the pixels, and a bounded number of blits reads them. A
  // pen ghost still replays: that is exact and cheap, and a five-finger drag's
  // footprint covers most of the paper, where the tile copy is the dearer path.
  //
  // The ghost is built synchronously inside engine.undo, and its cost is an
  // accepted price of the cue rather than an overrun to trim. On a Galaxy S21 FE
  // in Android Chrome a pen undo spends about 2 ms median and 4 ms P95 here,
  // measured as engine.undoInkMotion with Reduce Motion off against on, while
  // the tile restore stays under 2 ms P95 (issue #2238, issuecomment-5828881795).
  // Deferring the build to the next frame was rejected: the tile read must stay
  // ahead of undoTiledCommand, so only the DOM insert and the layout reads in
  // driftTowards could move, and they would land in the frame the next-frame
  // gate measures instead.
  function undo(
    canvas: HTMLCanvasElement,
    command: StrokeGroupCommand | undefined,
    view: EngineViewState,
    scale: number,
    towards: HTMLElement | null | undefined
  ) {
    cancel();
    if (!command || prefersReducedMotion()) return;
    const bounds = strokeMotionBounds(
      command,
      Math.round(view.paperCssWidth * scale),
      Math.round(view.paperCssHeight * scale)
    );
    if (!bounds) return;
    const image = canvasOf(bounds.width, bounds.height);
    const target = image.getContext('2d');
    if (!target) return;
    target.translate(-bounds.left, -bounds.top);
    if (strokeGhostReadsTiles(command)) ghostFromTiles(target, command, bounds);
    else for (const op of command.ops) renderOp(target, op);
    image.className = 'undo-ink-motion';
    image.style.cssText = `left:${bounds.left / scale}px;top:${bounds.top / scale}px;width:${bounds.width / scale}px;height:${bounds.height / scale}px`;
    driftTowards(image, canvas.parentElement, towards, view, {
      x: (bounds.left + bounds.width / 2) / scale,
      y: (bounds.top + bounds.height / 2) / scale,
    });
    runWhenPainted(image);
    present(canvas.parentElement, image, viewTransformCss(view));
  }

  // Once the undo has restored the tiles, every pixel still on the paper inside
  // the footprint is ink the command never owned. Knocking it out of the ghost
  // keeps that older ink pinned in place while the ghost shrinks over it; the
  // tiles are transparent wherever no ink remains, so the pass costs the same
  // bounded blits as the copy. destination-out scales the ghost by one minus the
  // surviving alpha, so it is exact where the surviving ink is opaque or absent
  // and leaves a residue of at most a quarter of full alpha where the mask's AA
  // pad covers only an older stroke's antialiased edge, a one-pixel fringe that
  // the cue's own fade then scales down again.
  function subtractRemainingInk() {
    const target = pendingSubtract;
    pendingSubtract = null;
    if (!target) return;
    target.globalCompositeOperation = 'destination-out';
    paint(target);
  }

  // The whole page — paper, ink and line art as one bitmap — scales into the
  // clear button, beneath it, so the button hiding the sheet is the
  // disappearance. The clean page was underneath the whole time.
  function clear(
    canvas: HTMLCanvasElement,
    view: EngineViewState,
    scale: number,
    viewport: { width: number; height: number },
    bin: ClientPoint
  ) {
    cancel();
    if (prefersReducedMotion()) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const image = canvasOf(viewport.width, viewport.height);
    const target = image.getContext('2d');
    if (!target) return;
    target.setTransform(...viewMatrix({ ...view, tx: view.tx * scale, ty: view.ty * scale }));
    paint(target);
    paintColoringArt(target, view, scale);
    image.className = 'clear-sheet-motion';
    const originX = bin.x - rect.left;
    const originY = bin.y - rect.top;
    const pulledX = originX + (rect.width - originX) * CLEAR_SHEET_CORNER_PULL;
    const pulledY = originY - originY * CLEAR_SHEET_CORNER_PULL;
    image.style.transformOrigin = `${pulledX}px ${pulledY}px`;
    const wrapper = present(document.body, image, 'none');
    wrapper.classList.add('clear-sheet-layer');
    wrapper.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  }

  return { cancel, undo, subtractRemainingInk, clear };
}
