import { afterEach, describe, expect, it, vi } from 'vitest';
import { stopDrawSound } from '$lib/audio/drawingSound';
import { impactThreshold } from '$lib/haptics';
import { dragToClear, type DragToClearOptions } from './dragToClear';

vi.mock('$lib/drawing/engine', () => ({ releaseAllPointers: vi.fn() }));
vi.mock('$lib/audio/drawingSound', () => ({ stopDrawSound: vi.fn() }));
vi.mock('$lib/haptics', () => ({ impactThreshold: vi.fn() }));

// happy-dom lacks a PointerEvent constructor with pointerId, so stub it the
// same way scribbleGuard.test.ts does.
function pointerEvent(type: string, pointerId: number, clientX = 0, clientY = 0) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'clientX', { value: clientX });
  Object.defineProperty(e, 'clientY', { value: clientY });
  return e;
}

const acceptRadius = () => Math.min(window.innerWidth, window.innerHeight) * 0.4;
const clearProgress = () => document.documentElement.style.getPropertyValue('--clear-progress');

function setup() {
  const node = document.createElement('button');
  node.setPointerCapture = vi.fn();
  node.releasePointerCapture = vi.fn();
  document.body.appendChild(node);
  const options: DragToClearOptions = {
    containerEl: document.createElement('div'),
    acceptZoneEl: document.createElement('div'),
    clearPreviewEl: document.createElement('div'),
    pageTurnOverlayEl: document.createElement('div'),
    onClear: vi.fn(),
    onTutorialShow: vi.fn(),
    onTutorialDismiss: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
  const action = dragToClear(node, () => options);
  return { node, options, action };
}

describe('dragToClear pointer identity', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.useRealTimers();
    vi.clearAllMocks();
    document.documentElement.style.removeProperty('--clear-progress');
  });

  it('commits the clear when the same pointer drags past the accept radius', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));
    node.dispatchEvent(pointerEvent('pointerup', 1, far, 100));

    expect(options.onClear).toHaveBeenCalledTimes(1);
  });

  it('ignores moves and releases from a different pointer', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 2, far, 100));

    expect(options.containerEl.style.transform).toBe('');
    expect(clearProgress()).toBe('0');

    node.dispatchEvent(pointerEvent('pointerup', 2, far, 100));

    expect(options.onClear).not.toHaveBeenCalled();
    expect(node.classList.contains('dragging')).toBe(true);

    node.dispatchEvent(pointerEvent('pointerup', 1, 100, 100));

    expect(options.onClear).not.toHaveBeenCalled();
    expect(node.classList.contains('dragging')).toBe(false);
  });

  it('does not let a second pointerdown restart an active drag', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointerdown', 2, far, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));
    node.dispatchEvent(pointerEvent('pointerup', 1, far, 100));

    expect(options.onClear).toHaveBeenCalledTimes(1);
  });

  it('cancels a drag past the accept radius without committing and resets its UI state', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointercancel', 2, 100, 100));

    expect(node.classList.contains('dragging')).toBe(true);

    vi.advanceTimersByTime(16);
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));

    expect(options.containerEl.classList.contains('dragging-active')).toBe(true);
    expect(options.containerEl.style.transform).not.toBe('');
    expect(node.classList.contains('delete-ready')).toBe(true);
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(true);
    expect(options.acceptZoneEl.classList.contains('threshold-reached')).toBe(true);
    expect(options.clearPreviewEl.classList.contains('committed')).toBe(true);
    expect(clearProgress()).toBe('1');

    vi.mocked(options.onTutorialDismiss).mockClear();
    vi.mocked(impactThreshold).mockClear();
    node.dispatchEvent(pointerEvent('pointercancel', 1, far, 100));

    expect(options.onClear).not.toHaveBeenCalled();
    expect(options.onTutorialDismiss).not.toHaveBeenCalled();
    expect(impactThreshold).not.toHaveBeenCalled();
    expect(stopDrawSound).toHaveBeenCalledTimes(1);
    expect(options.onDragEnd).toHaveBeenCalledTimes(1);
    expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
    expect(options.containerEl.style.transform).toBe('');
    expect(node.classList.contains('dragging')).toBe(false);
    expect(node.classList.contains('delete-ready')).toBe(false);
    expect(node.style.transition).toBe('');
    expect(node.style.opacity).toBe('');
    expect(node.style.transform).toBe('');
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('threshold-reached')).toBe(false);
    expect(options.clearPreviewEl.classList.contains('committed')).toBe(false);
    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(false);
    expect(clearProgress()).toBe('0');

    vi.advanceTimersByTime(250);

    expect(options.acceptZoneEl.style.display).toBe('none');
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(false);
  });
});
