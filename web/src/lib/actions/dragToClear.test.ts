import { readFileSync } from 'node:fs';
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
import { dragToClear, PAGE_TURN_DURATION_MS, type DragToClearOptions } from './dragToClear';
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

function transitionEndEvent(propertyName: string) {
  const e = new Event('transitionend', { bubbles: true });
  Object.defineProperty(e, 'propertyName', { value: propertyName });
  return e;
}

const acceptRadius = () => Math.min(window.innerWidth, window.innerHeight) * ACCEPT_RADIUS_FACTOR;
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

  it('plays the commit exit animation through its class stages and back to rest', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    vi.advanceTimersByTime(16);
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));
    node.dispatchEvent(pointerEvent('pointerup', 1, far, 100));

    expect(options.onClear).toHaveBeenCalledTimes(1);
    expect(node.classList.contains('clearing')).toBe(true);
    expect(node.classList.contains('dragging')).toBe(true);
    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(true);
    expect(stopDrawSound).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(stopDrawSound).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(300);

    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(false);
    expect(options.containerEl.style.transform).toBe('');
    expect(node.classList.contains('dragging')).toBe(false);
    expect(node.classList.contains('clearing-done')).toBe(true);
    expect(options.containerEl.classList.contains('dragging-active')).toBe(true);

    vi.advanceTimersByTime(50);

    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
    expect(node.classList.contains('clearing')).toBe(false);
    expect(node.classList.contains('clearing-done')).toBe(false);
    expect(node.classList.contains('clearing-return')).toBe(true);

    // An icon's own margin transition bubbles to the button; only the button's
    // own opacity marks the return leg as done.
    const icon = node.appendChild(document.createElement('span'));
    icon.dispatchEvent(transitionEndEvent('margin-right'));
    node.dispatchEvent(transitionEndEvent('transform'));

    expect(node.classList.contains('clearing-return')).toBe(true);

    node.dispatchEvent(transitionEndEvent('opacity'));

    expect(node.classList.contains('clearing-return')).toBe(false);
  });

  it('restores a button caught in its return leg when the next drag is cancelled', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));
    node.dispatchEvent(pointerEvent('pointerup', 1, far, 100));

    expect(node.classList.contains('clearing')).toBe(true);

    vi.advanceTimersByTime(PAGE_TURN_DURATION_MS + 50);

    expect(node.classList.contains('clearing-return')).toBe(true);

    node.dispatchEvent(pointerEvent('pointerdown', 2, 100, 100));
    node.dispatchEvent(pointerEvent('pointercancel', 2, 100, 100));

    expect(node.classList.contains('clearing-return')).toBe(false);
    expect(node.classList.contains('dragging')).toBe(false);
    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
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
    expect(cancelClearSound).toHaveBeenCalledOnce();
    expect(stopDrawSound).toHaveBeenCalledTimes(1);
    expect(options.onDragEnd).toHaveBeenCalledTimes(1);
    expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(options.containerEl.classList.contains('dragging-active')).toBe(false);
    expect(options.containerEl.style.transform).toBe('');
    expect(node.classList.contains('dragging')).toBe(false);
    expect(node.classList.contains('delete-ready')).toBe(false);
    expect(node.classList.contains('clearing')).toBe(false);
    expect(node.classList.contains('clearing-done')).toBe(false);
    expect(node.classList.contains('clearing-return')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(false);
    expect(options.acceptZoneEl.classList.contains('threshold-reached')).toBe(false);
    expect(options.clearPreviewEl.classList.contains('committed')).toBe(false);
    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(false);
    expect(clearProgress()).toBe('0');

    vi.advanceTimersByTime(250);

    expect(options.acceptZoneEl.style.display).toBe('none');
    expect(options.acceptZoneEl.classList.contains('visible')).toBe(false);
  });

  it('resets shared visual state when destroyed mid-drag', () => {
    const { node, options, action } = setup();
    const far = 100 + acceptRadius() + 10;

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(pointerEvent('pointermove', 1, far, 100));

    expect(clearProgress()).toBe('1');

    action.destroy();

    expect(cancelClearSound).toHaveBeenCalledOnce();
    expect(clearProgress()).toBe('0');
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
    expect(node.classList.contains('clearing')).toBe(true);
    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(true);
  });

  it('ignores a real pointer click', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(new MouseEvent('click', { detail: 1 }));

    expect(options.onTutorialDismiss).not.toHaveBeenCalled();
    expect(options.onClear).not.toHaveBeenCalled();
    expect(node.classList.contains('clearing')).toBe(false);
    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(false);
  });

  it('ignores a detail-zero click while a pointer owns the gesture', () => {
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(pointerEvent('pointerdown', 1, 100, 100));
    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));

    expect(options.onClear).not.toHaveBeenCalled();
    expect(node.classList.contains('dragging')).toBe(true);
  });

  it('ignores repeat activation until the clear exit choreography finishes', () => {
    vi.useFakeTimers();
    const { node, options, action } = setup();
    cleanup = () => action.destroy();

    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    vi.advanceTimersByTime(400);
    node.dispatchEvent(new MouseEvent('click', { detail: 0 }));

    expect(options.onClear).toHaveBeenCalledOnce();
    expect(startClearSound).toHaveBeenCalledOnce();
    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(true);
    expect(node.classList.contains('clearing')).toBe(true);

    vi.advanceTimersByTime(PAGE_TURN_DURATION_MS - 400);

    expect(options.pageTurnOverlayEl.classList.contains('animating')).toBe(false);
    expect(node.classList.contains('clearing')).toBe(true);
    expect(node.classList.contains('clearing-done')).toBe(true);

    vi.advanceTimersByTime(50);

    expect(node.classList.contains('clearing')).toBe(false);
    expect(node.classList.contains('clearing-done')).toBe(false);
    expect(node.classList.contains('clearing-return')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('dragToClear hold-to-show-tutorial timer', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.useRealTimers();
    vi.clearAllMocks();
    document.documentElement.style.removeProperty('--clear-progress');
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

// The page-turn hand-off waits out a ripple animation whose duration is
// declared in ClearButton.svelte's CSS, where no module can import it — so the
// agreement is checked by reading that source. The path stays a parameter
// because Vite rewrites a literal `new URL('./literal', import.meta.url)` into
// the served asset's http URL, which readFileSync rejects (precedent:
// app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('dragToClear exit choreography timing', () => {
  it("waits out ClearButton.svelte's ripple animation", () => {
    const match = sourceFile('../components/ClearButton.svelte').match(
      /animation:\s*ripple\s+([\d.]+)s/
    );
    expect(match, 'ClearButton.svelte declares a ripple animation duration').not.toBeNull();

    expect(PAGE_TURN_DURATION_MS).toBe(Number(match![1]) * 1000);
  });
});
