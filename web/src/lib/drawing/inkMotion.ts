import { paintStrokeFootprint, strokeMotionBounds } from './inkMotionBounds';
import type { StrokeGroupCommand } from './strokeOps';
import { viewMatrix, type EngineViewState } from './paperView';

// `paint` lays the visible live tiles onto a target under its current transform;
// both ghosts read their pixels from it rather than replaying history.
export function createInkMotion(paint: (target: CanvasRenderingContext2D) => void) {
  let overlay: HTMLDivElement | null = null;

  function cancel() {
    overlay?.remove();
    overlay = null;
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

  // The ghost is the undone ink as it stands on the live tiles, kept only
  // inside a mask of the command's footprint. Replaying the command's ops instead
  // re-rasterizes the whole stroke through the crayon pass buffer, which is
  // the cost the 1751 bisect measured on the undo path; the tiles already hold
  // those pixels, and a bounded number of blits reads them.
  function undo(
    canvas: HTMLCanvasElement,
    command: StrokeGroupCommand | undefined,
    view: EngineViewState,
    scale: number
  ) {
    cancel();
    if (!command || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = strokeMotionBounds(
      command,
      Math.round(view.paperCssWidth * scale),
      Math.round(view.paperCssHeight * scale)
    );
    if (!bounds) return;
    const image = document.createElement('canvas');
    image.width = bounds.width;
    image.height = bounds.height;
    const target = image.getContext('2d');
    const mask = document.createElement('canvas');
    mask.width = bounds.width;
    mask.height = bounds.height;
    const maskTarget = mask.getContext('2d');
    if (!target || !maskTarget) return;
    maskTarget.translate(-bounds.left, -bounds.top);
    paintStrokeFootprint(maskTarget, command);
    target.translate(-bounds.left, -bounds.top);
    paint(target);
    // One destination-in of the whole footprint: applying the mask per tile
    // blit would clear everything outside each successive tile instead.
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalCompositeOperation = 'destination-in';
    target.drawImage(mask, 0, 0);
    mask.width = 0;
    mask.height = 0;
    image.className = 'undo-ink-motion';
    image.style.cssText = `left:${bounds.left / scale}px;top:${bounds.top / scale}px;width:${bounds.width / scale}px;height:${bounds.height / scale}px`;
    present(canvas.parentElement, image, `matrix(${viewMatrix(view).join(',')})`);
  }

  function clear(
    canvas: HTMLCanvasElement,
    view: EngineViewState,
    scale: number,
    viewport: { width: number; height: number }
  ) {
    cancel();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const image = document.createElement('canvas');
    image.width = viewport.width;
    image.height = viewport.height;
    const target = image.getContext('2d');
    if (!target) return;
    target.setTransform(...viewMatrix({ ...view, tx: view.tx * scale, ty: view.ty * scale }));
    paint(target);
    image.className = 'clear-ink-motion';
    const wrapper = present(document.body, image, 'none');
    wrapper.classList.add('clear-ink-layer');
    Object.assign(wrapper.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  return { cancel, undo, clear };
}
