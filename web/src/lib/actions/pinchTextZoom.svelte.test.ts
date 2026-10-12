import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachPinchTextZoom,
  clampTextZoom,
  MAX_TEXT_ZOOM,
  MIN_TEXT_ZOOM,
  nextTextZoom,
} from './pinchTextZoom.svelte';
import { PRESS_CLICK_CONSUME_WINDOW_MS } from './clickConsumeWindow';

describe('clampTextZoom', () => {
  it('keeps values within [MIN, MAX]', () => {
    expect(clampTextZoom(0.5)).toBe(MIN_TEXT_ZOOM);
    expect(clampTextZoom(2)).toBe(2);
    expect(clampTextZoom(99)).toBe(MAX_TEXT_ZOOM);
  });

  it('falls back to MIN for non-finite input (matches clampScale)', () => {
    expect(clampTextZoom(NaN)).toBe(MIN_TEXT_ZOOM);
    expect(clampTextZoom(Infinity)).toBe(MIN_TEXT_ZOOM);
    expect(clampTextZoom(-Infinity)).toBe(MIN_TEXT_ZOOM);
  });
});

describe('nextTextZoom', () => {
  it('scales proportionally to how far the fingers spread', () => {
    // Fingers twice as far apart as when the pinch began → twice the zoom.
    expect(nextTextZoom(1, 100, 200)).toBe(2);
    // Half the spread → half (clamped to MIN since 0.5 < 1).
    expect(nextTextZoom(2, 200, 100)).toBe(1);
  });

  it('compounds from the base zoom captured at the pinch start', () => {
    // Already at 1.5×, fingers spread 1.5× further → 2.25×.
    expect(nextTextZoom(1.5, 100, 150)).toBeCloseTo(2.25);
  });

  it('never exceeds MAX or drops below MIN', () => {
    expect(nextTextZoom(2, 100, 1000)).toBe(MAX_TEXT_ZOOM);
    expect(nextTextZoom(1, 100, 1)).toBe(MIN_TEXT_ZOOM);
  });

  it('holds the current zoom when the base spread is degenerate', () => {
    // A zero base spread (e.g. fingers coincident) must not divide-by-zero.
    expect(nextTextZoom(1.5, 0, 300)).toBe(1.5);
  });
});

const attached = new Set<{ destroy: () => void }>();

function pinchPane() {
  const node = document.createElement('div');
  const target = document.createElement('div');
  node.appendChild(target);
  document.body.appendChild(node);
  const gesture = attachPinchTextZoom(node, () => ({ target, enabled: true }));
  attached.add(gesture);
  return { node, target, gesture };
}

function touch(type: string, pointerId: number, clientX = 0, clientY = 0) {
  return new PointerEvent(type, {
    pointerId,
    pointerType: 'touch',
    clientX,
    clientY,
    bubbles: type !== 'pointerleave',
    cancelable: true,
  });
}

function pinchAndLift(node: HTMLElement) {
  node.dispatchEvent(touch('pointerdown', 1, 0, 0));
  node.dispatchEvent(touch('pointerdown', 2, 100, 0));
  node.dispatchEvent(touch('pointerup', 2, 100, 0));
  node.dispatchEvent(touch('pointerup', 1, 0, 0));
}

// A pointer-synthesized click carries detail >= 1; detail 0 is keyboard/AT.
function pointerClick() {
  return new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
}

// `hasPointerCapture` here reports happy-dom's own bookkeeping of the action's
// `setPointerCapture` calls — which is all these assertions claim. A real browser
// ignores a capture request for a pointer id it has no active pointer for (in
// Chromium `setPointerCapture` neither throws nor captures), so no synthetic-event
// test can prove the browser actually redirected anything. The real capture path
// is covered with compositor touch in `tests/settings-zoom.spec.ts`.
describe('attachPinchTextZoom', () => {
  afterEach(() => {
    for (const gesture of attached) gesture.destroy();
    attached.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('leaves a lone finger uncaptured so the pane still scrolls natively', () => {
    const { node } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));

    expect(node.hasPointerCapture(1)).toBe(false);
  });

  it('captures the finger that completes the pinch, leaving the resting one native', () => {
    const { node } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));

    expect(node.hasPointerCapture(2)).toBe(true);
    expect(node.hasPointerCapture(1)).toBe(false);
  });

  it('scales the target as the fingers spread apart', () => {
    const { node, target } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointermove', 2, 200, 0));

    expect(target.style.zoom).toBe('2');
  });

  it('releases the capture as the finger lifts', () => {
    const { node } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointerup', 2, 100, 0));

    expect(node.hasPointerCapture(2)).toBe(false);
  });

  it('forgets every finger as it lifts, so a later lone finger cannot pinch', () => {
    const { node, target } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointerup', 2, 100, 0));
    node.dispatchEvent(touch('pointerup', 1, 0, 0));

    // Browsers reuse touch pointer ids, so the next gesture can land on one the
    // pinch already used. A finger the tracker failed to drop would put the count
    // back at two here, and this lone drag would zoom instead of scrolling.
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointermove', 1, 0, 300));

    expect(target.style.zoom).toBe('');
  });

  it('drops a finger the browser cancels, so it cannot linger as a phantom', () => {
    const { node, target } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 50, 50));
    // The pane's scroll claimed it — the browser's way of saying this finger is no
    // longer ours, and the only way one leaves without a `pointerup`.
    node.dispatchEvent(touch('pointercancel', 1, 50, 50));

    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointermove', 2, 200, 0));

    expect(target.style.zoom).toBe('');
  });

  it('swallows the one trailing click a pinch leaks onto the control beneath it', () => {
    const { node } = pinchPane();
    pinchAndLift(node);

    const ghost = pointerClick();
    node.dispatchEvent(ghost);
    expect(ghost.defaultPrevented).toBe(true);

    const realTap = pointerClick();
    node.dispatchEvent(realTap);
    expect(realTap.defaultPrevented).toBe(false);
  });

  it('lets a keyboard or assistive-tech click through after a pinch', () => {
    const { node } = pinchPane();
    pinchAndLift(node);

    const keyboardClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 });
    node.dispatchEvent(keyboardClick);
    expect(keyboardClick.defaultPrevented).toBe(false);
  });

  it('lets a pointer click through once the pinch has been over for the click window', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { node } = pinchPane();
    pinchAndLift(node);

    now.mockReturnValue(PRESS_CLICK_CONSUME_WINDOW_MS + 1);
    const laterClick = pointerClick();
    node.dispatchEvent(laterClick);
    expect(laterClick.defaultPrevented).toBe(false);
  });

  it('lets the first pointer click through after a reset reopens the pane', () => {
    const { node, gesture } = pinchPane();
    pinchAndLift(node);

    gesture.reset();
    const reopenedClick = pointerClick();
    node.dispatchEvent(reopenedClick);
    expect(reopenedClick.defaultPrevented).toBe(false);
  });

  it('detaches on destroy', () => {
    const { node, target } = pinchPane();
    for (const gesture of attached) gesture.destroy();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointermove', 2, 200, 0));

    expect(node.hasPointerCapture(1)).toBe(false);
    expect(target.style.zoom).toBe('');
  });
});
