import { afterEach, describe, expect, it, vi } from 'vitest';
import { adoptPointerStroke, getActiveCanvas } from '$lib/drawing/engine';
import { dragColorToCanvas } from './dragColorToCanvas';

vi.mock('$lib/drawing/engine', () => ({
  adoptPointerStroke: vi.fn(),
  getActiveCanvas: vi.fn(),
}));

// happy-dom lacks a PointerEvent constructor with pointerId, so stub it the
// same way scribbleGuard.test.ts does.
function pointerEvent(type: string, pointerId: number, clientX = 0, clientY = 0) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'clientX', { value: clientX });
  Object.defineProperty(e, 'clientY', { value: clientY });
  return e;
}

function setup() {
  const node = document.createElement('button');
  document.body.appendChild(node);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  vi.mocked(getActiveCanvas).mockReturnValue(canvas);
  // The action hit-tests each move; happy-dom's elementFromPoint has no real
  // layout, so route it by x: the "canvas region" starts at x=100.
  document.elementFromPoint = (x: number) => (x >= 100 ? canvas : node);
  const onDragToCanvas = vi.fn();
  const action = dragColorToCanvas(node, onDragToCanvas);
  return { node, canvas, onDragToCanvas, action };
}

describe('dragColorToCanvas', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('hands the pointer to the engine once the drag crosses onto the canvas', () => {
    const { node, onDragToCanvas, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    node.dispatchEvent(pointerEvent('pointermove', 1, 50, 10)); // still off-canvas
    expect(onDragToCanvas).not.toHaveBeenCalled();

    node.dispatchEvent(pointerEvent('pointermove', 1, 150, 10)); // over the canvas
    expect(onDragToCanvas).toHaveBeenCalledTimes(1);
    expect(adoptPointerStroke).toHaveBeenCalledTimes(1);
    // Selection runs before the handoff, so the adopted stroke's first dot
    // already paints in the dragged color.
    expect(vi.mocked(onDragToCanvas).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(adoptPointerStroke).mock.invocationCallOrder[0]
    );

    // The handoff is once per press: later moves belong to the engine.
    node.dispatchEvent(pointerEvent('pointermove', 1, 200, 10));
    expect(adoptPointerStroke).toHaveBeenCalledTimes(1);
  });

  it('ignores moves from a pointer other than the pressed one', () => {
    const { node, onDragToCanvas, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    node.dispatchEvent(pointerEvent('pointermove', 2, 150, 10));

    expect(onDragToCanvas).not.toHaveBeenCalled();
    expect(adoptPointerStroke).not.toHaveBeenCalled();
  });

  it('stops tracking on release or cancel before reaching the canvas (a tap)', () => {
    const { node, onDragToCanvas, action } = setup();
    cleanup = () => action.destroy();

    for (const interrupt of ['pointerup', 'pointercancel']) {
      node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
      node.dispatchEvent(pointerEvent(interrupt, 1, 10, 10));
      node.dispatchEvent(pointerEvent('pointermove', 1, 150, 10));
    }

    expect(onDragToCanvas).not.toHaveBeenCalled();
    expect(adoptPointerStroke).not.toHaveBeenCalled();
  });

  it('never hands off while a floating control covers the canvas at the pointer', () => {
    const { node, canvas, onDragToCanvas, action } = setup();
    cleanup = () => action.destroy();
    const floatingButton = document.createElement('button');
    document.elementFromPoint = () => floatingButton;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    node.dispatchEvent(pointerEvent('pointermove', 1, 150, 10));
    expect(onDragToCanvas).not.toHaveBeenCalled();

    // Sliding off the control onto exposed canvas completes the handoff.
    document.elementFromPoint = () => canvas;
    node.dispatchEvent(pointerEvent('pointermove', 1, 180, 10));
    expect(onDragToCanvas).toHaveBeenCalledTimes(1);
    expect(adoptPointerStroke).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the engine has a canvas', () => {
    const { node, onDragToCanvas, action } = setup();
    cleanup = () => action.destroy();
    vi.mocked(getActiveCanvas).mockReturnValue(undefined as unknown as HTMLCanvasElement);

    node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    node.dispatchEvent(pointerEvent('pointermove', 1, 150, 10));

    expect(onDragToCanvas).not.toHaveBeenCalled();
    expect(adoptPointerStroke).not.toHaveBeenCalled();
  });

  it('update() swaps the selection callback', () => {
    const { node, onDragToCanvas, action } = setup();
    cleanup = () => action.destroy();
    const next = vi.fn();
    action.update(next);

    node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    node.dispatchEvent(pointerEvent('pointermove', 1, 150, 10));

    expect(onDragToCanvas).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('detaches on destroy, mid-drag included', () => {
    const { node, onDragToCanvas, action } = setup();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    action.destroy();
    node.dispatchEvent(pointerEvent('pointermove', 1, 150, 10));
    node.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    node.dispatchEvent(pointerEvent('pointermove', 1, 150, 10));

    expect(onDragToCanvas).not.toHaveBeenCalled();
    expect(adoptPointerStroke).not.toHaveBeenCalled();
  });
});
