import { strokeMotionBounds } from './inkMotionBounds';
import { renderOp, type StrokeGroupCommand } from './strokeOps';
import { viewMatrix, type EngineViewState } from './paperView';

export function createInkMotion() {
  let overlay: HTMLDivElement | null = null;

  function cancel() {
    overlay?.remove();
    overlay = null;
  }

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
    if (!target) return;
    target.translate(-bounds.left, -bounds.top);
    for (const op of command.ops) renderOp(target, op);
    renderOp(target, { kind: 'crayonFlush' });
    image.className = 'undo-ink-motion';
    image.style.cssText = `left:${bounds.left / scale}px;top:${bounds.top / scale}px;width:${bounds.width / scale}px;height:${bounds.height / scale}px`;
    const wrapper = document.createElement('div');
    wrapper.className = 'ink-motion';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.transform = `matrix(${viewMatrix(view).join(',')})`;
    wrapper.append(image);
    image.addEventListener(
      'animationend',
      () => {
        wrapper.remove();
        if (overlay === wrapper) overlay = null;
      },
      { once: true }
    );
    canvas.parentElement?.append(wrapper);
    overlay = wrapper;
  }

  return { cancel, undo };
}
