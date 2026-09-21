import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelClearSound,
  commitClearSound,
  startClearSound,
  stopDrawSound,
  updateClearSound,
} from '$lib/audio/drawingSound';
import { impactThreshold } from '$lib/platform/haptics';
import { releaseAllPointers } from '$lib/drawing/engine';
import { CLEAR_SHEET_DURATION_MS } from '$lib/drawing/inkMotion';
import { dragToClear, type DragToClearOptions } from './dragToClear';
import { ACCEPT_RADIUS_FACTOR } from './dragToClearGeometry';

vi.mock('$lib/drawing/engine', () => ({ releaseAllPointers: vi.fn() }));
vi.mock('$lib/audio/drawingSound', () => ({
  cancelClearSound: vi.fn(),
  commitClearSound: vi.fn(),
  startClearSound: vi.fn(),
  stopDrawSound: vi.fn(),
  updateClearSound: vi.fn(),
}));
vi.mock('$lib/platform/haptics', () => ({ impactThreshold: vi.fn() }));

// happy-dom lacks a PointerEvent constructor with pointerId, so stub it the
// same way scribbleGuard.test.ts does.
function pointerEvent(type: string, pointerId: number, clientX = 0, clientY = 0) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'clientX', { value: clientX });
  Object.defineProperty(e, 'clientY', { value: clientY });
  return e;
}

const acceptRadius = () => Math.min(window.innerWidth, window.innerHeight) * ACCEPT_RADIUS_FACTOR;
const clearProgress = (options: DragToClearOptions) =>
  options.clearWashEl.style.getPropertyValue('--clear-progress');

function createOptions(): DragToClearOptions {
  return {
    containerEl: document.createElement('div'),
    acceptZoneEl: document.createElement('div'),
    clearPreviewEl: document.createElement('div'),
    clearWashEl: document.createElement('div'),
    onClear: vi.fn(),
    onTutorialShow: vi.fn(),
    onTutorialDismiss: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
}

function setup() {
  const node = document.createElement('button');
  node.setPointerCapture = vi.fn();
  node.releasePointerCapture = vi.fn();
  document.body.appendChild(node);
  const options = createOptions();
  const getOptions = vi.fn(() => options);
  const action = dragToClear(node, getOptions);
  return { node, options, action, getOptions };
}

describe('dragToClear pointer identity', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

  it('drives clear audio from normalized drag progress through commit', () => {
    const { node, action } = setup();
    cleanup = () => action.destroy();
    const radius = acceptRadius();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, 100 + radius / 2, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, 100 + radius, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, 100 + radius * 1.25, 100));
    node.dispatchEvent(pointerEvent('pointerup', 1, 100 + radius * 1.25, 100));

    expect(startClearSound).toHaveBeenCalledOnce();
    expect(updateClearSound).toHaveBeenNthCalledWith(1, 0.5);
    expect(updateClearSound).toHaveBeenNthCalledWith(2, 1);
    expect(updateClearSound).toHaveBeenNthCalledWith(3, 1.25);
    expect(commitClearSound).toHaveBeenCalledOnce();
    expect(cancelClearSound).not.toHaveBeenCalled();
  });

  it('reads options once across an accepted drag with many moves', () => {
    const { node, action, getOptions } = setup();
    cleanup = () => action.destroy();
    const radius = acceptRadius();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    for (const fraction of [0.1, 0.3, 0.6, 0.9, 1.1]) {
      node.dispatchEvent(pointerEvent('pointermove', 1, 100 + radius * fraction, 100));
    }
    node.dispatchEvent(pointerEvent('pointerup', 1, 100 + radius * 1.1, 100));

    expect(getOptions).toHaveBeenCalledOnce();
  });

  it('drives the wash without restyling the document root', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, 100 + acceptRadius() / 2, 100));

    expect(clearProgress(options)).toBe('0.5');
    expect(document.documentElement.getAttribute('style') ?? '').toBe('');
  });

  it('keeps progress, feedback, and release on the pointer-down radius after resize', () => {
    const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1_000);
    const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1_000);
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    expect(options.acceptZoneEl.style.width).toBe('800px');

    width.mockReturnValue(250);
    height.mockReturnValue(250);
    node.dispatchEvent(pointerEvent('pointermove', 1, 300, 100));

    expect(clearProgress(options)).toBe('0.5');
    expect(updateClearSound).toHaveBeenLastCalledWith(0.5);
    expect(node.classList.contains('delete-ready')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('threshold-reached')).toBe(false);
    expect(options.clearPreviewEl.classList.contains('committed')).toBe(false);
    expect(impactThreshold).not.toHaveBeenCalled();

    node.dispatchEvent(pointerEvent('pointermove', 1, 500, 100));

    expect(clearProgress(options)).toBe('1');
    expect(updateClearSound).toHaveBeenLastCalledWith(1);
    expect(node.classList.contains('delete-ready')).toBe(true);
    expect(options.acceptZoneEl.classList.contains('threshold-reached')).toBe(true);
    expect(options.clearPreviewEl.classList.contains('committed')).toBe(true);
    expect(impactThreshold).toHaveBeenCalledOnce();

    node.dispatchEvent(pointerEvent('pointermove', 1, 400, 100));
    node.dispatchEvent(pointerEvent('pointerup', 1, 400, 100));

    expect(updateClearSound).toHaveBeenLastCalledWith(0.75);
    expect(options.onClear).not.toHaveBeenCalled();
    expect(cancelClearSound).toHaveBeenCalledOnce();
  });

  it('captures fresh options and radius after pointer cancellation', () => {
    const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1_000);
    const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1_000);
    const { node, options, action, getOptions } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointercancel', 1, 100, 100));

    const freshOptions = createOptions();
    getOptions.mockReturnValue(freshOptions);
    width.mockReturnValue(500);
    height.mockReturnValue(500);
    node.dispatchEvent(pointerEvent('pointerdown', 2, 100, 100));

    expect(getOptions).toHaveBeenCalledTimes(2);
    expect(freshOptions.acceptZoneEl.style.width).toBe('400px');
    expect(freshOptions.containerEl.classList.contains('dragging-active')).toBe(true);
    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
    node.dispatchEvent(pointerEvent('pointermove', 2, 300, 100));
    expect(node.classList.contains('delete-ready')).toBe(true);
  });

  it('uses captured options during destroy and lets a new action capture fresh inputs', () => {
    const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1_000);
    const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1_000);
    const node = document.createElement('button');
    node.setPointerCapture = vi.fn();
    node.releasePointerCapture = vi.fn();
    document.body.appendChild(node);
    const firstOptions = createOptions();
    const secondOptions = createOptions();
    const firstGetter = vi.fn(() => firstOptions);
    const firstAction = dragToClear(node, firstGetter);

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    expect(firstOptions.acceptZoneEl.style.width).toBe('800px');
    width.mockReturnValue(500);
    height.mockReturnValue(500);
    firstAction.destroy();
    expect(firstGetter).toHaveBeenCalledOnce();

    const secondGetter = vi.fn(() => secondOptions);
    const secondAction = dragToClear(node, secondGetter);
    cleanup = () => secondAction.destroy();
    node.dispatchEvent(pointerEvent('pointerdown', 2, 100, 100));

    expect(secondGetter).toHaveBeenCalledOnce();
    expect(secondOptions.acceptZoneEl.style.width).toBe('400px');
    expect(secondOptions.containerEl.classList.contains('dragging-active')).toBe(true);
    expect(firstOptions.containerEl.classList.contains('dragging-active')).toBe(false);
  });

  it('sends the button home at commit and lets taps through until the page has gone', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;
    const rect = vi
      .spyOn(node, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(900, 20, 70, 70));

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    vi.advanceTimersByTime(16);
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));
    rect.mockReturnValue(new DOMRect(900 + far - 100, 20, 70, 70));
    node.dispatchEvent(pointerEvent('pointerup', 1, far, 100));

    expect(options.onClear).toHaveBeenCalledExactlyOnceWith({ x: 935, y: 55 });
    expect(options.containerEl.style.transform).toBe('');
    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
    expect(node.classList.contains('dragging')).toBe(false);
    expect(node.classList.contains('clearing')).toBe(true);
    expect(options.clearPreviewEl.classList.contains('committed')).toBe(false);
    expect(options.clearPreviewEl.classList.contains('releasing')).toBe(true);
    expect(stopDrawSound).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(stopDrawSound).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CLEAR_SHEET_DURATION_MS - 301);

    expect(node.classList.contains('clearing')).toBe(true);

    vi.advanceTimersByTime(1);

    expect(node.classList.contains('clearing')).toBe(false);

    node.dispatchEvent(pointerEvent('pointerdown', 2, 935, 55));

    expect(node.classList.contains('dragging')).toBe(true);
    expect(options.clearPreviewEl.classList.contains('releasing')).toBe(false);
  });

  it('aims the departing page at the dock the button occupies at release', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;
    const rect = vi
      .spyOn(node, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(900, 20, 70, 70));

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, 100, far));
    // An orientation change mid-drag moved the dock; the button keeps its drag translation.
    rect.mockReturnValue(new DOMRect(580, 90 + far - 100, 60, 60));
    node.dispatchEvent(pointerEvent('pointerup', 1, 100, far));

    expect(options.onClear).toHaveBeenCalledExactlyOnceWith({ x: 610, y: 120 });
  });

  it('releases the preview flood only for a committed drag', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, 120, 100));
    node.dispatchEvent(pointerEvent('pointerup', 1, 120, 100));

    expect(options.onClear).not.toHaveBeenCalled();
    expect(options.clearPreviewEl.classList.contains('releasing')).toBe(false);
  });

  it('ignores moves and releases from a different pointer', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 2, far, 100));

    expect(options.containerEl.style.transform).toBe('');
    expect(clearProgress(options)).toBe('0');

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
    expect(clearProgress(options)).toBe('1');

    vi.mocked(options.onTutorialDismiss).mockClear();
    vi.mocked(impactThreshold).mockClear();
    node.dispatchEvent(pointerEvent('pointercancel', 1, far, 100));

    expect(options.onClear).not.toHaveBeenCalled();
    expect(options.onTutorialDismiss).not.toHaveBeenCalled();
    expect(impactThreshold).not.toHaveBeenCalled();
    expect(cancelClearSound).toHaveBeenCalledOnce();
    expect(stopDrawSound).toHaveBeenCalledTimes(1);
    expect(options.onDragEnd).toHaveBeenCalledTimes(1);
    expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
    expect(options.containerEl.style.transform).toBe('');
    expect(node.classList.contains('dragging')).toBe(false);
    expect(node.classList.contains('delete-ready')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('threshold-reached')).toBe(false);
    expect(options.clearPreviewEl.classList.contains('committed')).toBe(false);
    expect(options.clearPreviewEl.classList.contains('releasing')).toBe(false);
    expect(clearProgress(options)).toBe('0');

    vi.advanceTimersByTime(250);

    expect(options.acceptZoneEl.style.display).toBe('none');
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(false);
  });

  it('resets shared visual state when destroyed mid-drag', () => {
    const { node, options, action } = setup();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));

    expect(clearProgress(options)).toBe('1');

    action.destroy();

    expect(cancelClearSound).toHaveBeenCalledOnce();
    expect(clearProgress(options)).toBe('0');
    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
    expect(options.containerEl.style.transform).toBe('');
    expect(node.classList.contains('dragging')).toBe(false);
    expect(node.classList.contains('delete-ready')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('threshold-reached')).toBe(false);
    expect(options.acceptZoneEl.style.display).toBe('none');
  });
});

describe('dragToClear keyboard activation', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.clearAllMocks();
  });

  it('commits the clear path for a detail-zero click', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));

    expect(releaseAllPointers).toHaveBeenCalledOnce();
    expect(startClearSound).toHaveBeenCalledOnce();
    expect(commitClearSound).toHaveBeenCalledOnce();
    expect(vi.mocked(releaseAllPointers).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startClearSound).mock.invocationCallOrder[0]
    );
    expect(vi.mocked(startClearSound).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(commitClearSound).mock.invocationCallOrder[0]
    );
    expect(options.onTutorialDismiss).toHaveBeenCalledOnce();
    expect(options.onClear).toHaveBeenCalledOnce();
  });

  it('ignores a real pointer click', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(new MouseEvent('click', { detail: 1 }));

    expect(options.onTutorialDismiss).not.toHaveBeenCalled();
    expect(options.onClear).not.toHaveBeenCalled();
  });

  it('ignores a detail-zero click while a pointer owns the gesture', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));

    expect(options.onClear).not.toHaveBeenCalled();
    expect(node.classList.contains('dragging')).toBe(true);
  });

  it('ignores repeat activation until the departing page has gone', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    vi.advanceTimersByTime(CLEAR_SHEET_DURATION_MS - 1);
    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));

    expect(options.onClear).toHaveBeenCalledOnce();
    expect(startClearSound).toHaveBeenCalledOnce();
    expect(node.classList.contains('clearing')).toBe(true);

    vi.advanceTimersByTime(1);

    expect(vi.getTimerCount()).toBe(0);
    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));

    expect(options.onClear).toHaveBeenCalledTimes(2);
  });
});

describe('dragToClear hold-to-show-tutorial timer', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows the tutorial when the pointer is held still for the hold duration', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));

    vi.advanceTimersByTime(499);

    expect(options.onTutorialShow).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(options.onTutorialShow).toHaveBeenCalledTimes(1);
  });

  it('cancels the hold when the pointer moves past the movement threshold', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, 160, 100));

    expect(options.onTutorialDismiss).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);

    expect(options.onTutorialShow).not.toHaveBeenCalled();
  });

  it('cancels a pending hold when the action is destroyed mid-hold', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    action.destroy();

    vi.advanceTimersByTime(1000);

    expect(options.onTutorialShow).not.toHaveBeenCalled();
  });
});
