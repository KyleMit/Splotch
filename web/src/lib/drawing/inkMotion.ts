import { paintStrokeFootprint, strokeGhostReadsTiles, strokeMotionBounds } from './inkMotionBounds';
import { renderOp, type StrokeGroupCommand } from './strokeOps';
import { viewMatrix, viewTransformCss, type EngineViewState } from './paperView';
import { prefersReducedMotion } from '$lib/platform/reducedMotion';

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// `paint` lays the visible live tiles onto a target under its current transform;
// both ghosts read their pixels from it rather than replaying history.
export function createInkMotion(paint: (target: CanvasRenderingContext2D) => void) {
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
    mask.width = 0;
    pendingSubtract = target;
  }

  // A crayon or magic ghost is the undone ink as it stands on the live tiles.
  // Replaying those ops re-rasterizes the whole stroke through the crayon pass
  // buffer, which is the cost the 1751 bisect measured on the undo path; the
  // tiles already hold the pixels, and a bounded number of blits reads them. A
  // pen ghost still replays: that is exact and cheap, and a five-finger drag's
  // footprint covers most of the paper, where the tile copy is the dearer path.
  function undo(
    canvas: HTMLCanvasElement,
    command: StrokeGroupCommand | undefined,
    view: EngineViewState,
    scale: number
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

  function clear(
    canvas: HTMLCanvasElement,
    view: EngineViewState,
    scale: number,
    viewport: { width: number; height: number }
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
    image.className = 'clear-ink-motion';
    const wrapper = present(document.body, image, 'none');
    wrapper.classList.add('clear-ink-layer');
    wrapper.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  }

  return { cancel, undo, subtractRemainingInk, clear };
}
