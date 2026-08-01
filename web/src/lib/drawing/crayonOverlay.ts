import { setLiveCrayonBuffer } from './crayonPassBuffer';

interface CrayonOverlays {
  bottom: HTMLCanvasElement;
  bottomCtx: CanvasRenderingContext2D;
  top: HTMLCanvasElement;
  topCtx: CanvasRenderingContext2D;
  engineCreated: boolean;
}

let overlays: CrayonOverlays | null = null;

export function setupLegacyCrayonOverlays(
  canvas: HTMLCanvasElement,
  target: CanvasRenderingContext2D,
  opacity: string
) {
  const provided = canvas.parentElement?.querySelectorAll<HTMLCanvasElement>(
    'canvas[data-crayon-overlay]'
  );
  let bottom: HTMLCanvasElement;
  let top: HTMLCanvasElement;
  let engineCreated: boolean;
  if (provided && provided.length >= 2) {
    bottom = provided[0];
    top = provided[1];
    engineCreated = false;
  } else {
    const overlayCss =
      'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;';
    bottom = document.createElement('canvas');
    bottom.setAttribute('aria-hidden', 'true');
    bottom.style.cssText = overlayCss + 'mix-blend-mode:darken;';
    top = document.createElement('canvas');
    top.setAttribute('aria-hidden', 'true');
    top.style.cssText = overlayCss;
    canvas.insertAdjacentElement('afterend', bottom);
    bottom.insertAdjacentElement('afterend', top);
    engineCreated = true;
  }
  const bottomCtx = bottom.getContext('2d')!;
  const topCtx = top.getContext('2d')!;
  overlays = { bottom, bottomCtx, top, topCtx, engineCreated };
  setLiveCrayonBuffer(target, bottomCtx, topCtx);
  top.style.opacity = opacity;
}

export function resizeLegacyCrayonOverlays(width: number, height: number) {
  if (!overlays) return;
  for (const [canvas, context] of [
    [overlays.bottom, overlays.bottomCtx],
    [overlays.top, overlays.topCtx],
  ] as const) {
    canvas.width = width;
    canvas.height = height;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }
}

export function syncLegacyCrayonMix(opacity: string) {
  if (overlays) overlays.top.style.opacity = opacity;
}

export function detachLegacyCrayonOverlays() {
  setLiveCrayonBuffer(null, null);
  if (overlays?.engineCreated) {
    overlays.bottom.remove();
    overlays.top.remove();
  }
  overlays = null;
}
