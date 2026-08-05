import { afterEach, describe, expect, it } from 'vitest';
import {
  attachPinchTextZoom,
  clampTextZoom,
  MAX_TEXT_ZOOM,
  MIN_TEXT_ZOOM,
  nextTextZoom,
} from './pinchTextZoom.svelte';

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
  return { node, target };
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

// A finger that goes down in the pane, wanders out of its bounds, and lifts out
// there: the pane never sees the `pointerup`, so only the `pointerleave` on the
// way out can reclaim the entry.
function strandLoneFinger(node: HTMLElement) {
  node.dispatchEvent(touch('pointerdown', 1, 50, 50));
  node.dispatchEvent(touch('pointermove', 1, -10, 50));
  node.dispatchEvent(touch('pointerleave', 1, -10, 50));
}

describe('attachPinchTextZoom', () => {
  afterEach(() => {
    for (const gesture of attached) gesture.destroy();
    attached.clear();
    document.body.innerHTML = '';
  });

  it('leaves a lone finger uncaptured so the pane still scrolls natively', () => {
    const { node } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));

    expect(node.hasPointerCapture(1)).toBe(false);
  });

  it('captures both fingers once the pinch engages, not just the incoming one', () => {
    const { node } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));

    expect(node.hasPointerCapture(1)).toBe(true);
    expect(node.hasPointerCapture(2)).toBe(true);
  });

  it('scales the target as the captured fingers spread apart', () => {
    const { node, target } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointermove', 2, 200, 0));

    expect(target.style.zoom).toBe('2');
  });

  it('releases each capture as its finger lifts', () => {
    const { node } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointerup', 1, 0, 0));
    node.dispatchEvent(touch('pointerup', 2, 100, 0));

    expect(node.hasPointerCapture(1)).toBe(false);
    expect(node.hasPointerCapture(2)).toBe(false);
  });

  it('swallows the one trailing click a pinch leaks onto the control beneath it', () => {
    const { node } = pinchPane();
    node.dispatchEvent(touch('pointerdown', 1, 0, 0));
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointerup', 2, 100, 0));
    node.dispatchEvent(touch('pointerup', 1, 0, 0));

    const ghost = new MouseEvent('click', { bubbles: true, cancelable: true });
    node.dispatchEvent(ghost);
    expect(ghost.defaultPrevented).toBe(true);

    const realTap = new MouseEvent('click', { bubbles: true, cancelable: true });
    node.dispatchEvent(realTap);
    expect(realTap.defaultPrevented).toBe(false);
  });

  it('does not zoom on a one-finger scroll after a finger was stranded outside the pane', () => {
    const { node, target } = pinchPane();
    strandLoneFinger(node);

    // Were the stranded finger still tracked, this second finger would take the
    // count to two and its move would drive the zoom from a stale spread.
    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointermove', 2, 200, 0));

    expect(target.style.zoom).toBe('');
  });

  it('does not swallow a tap after a finger was stranded outside the pane', () => {
    const { node } = pinchPane();
    strandLoneFinger(node);

    node.dispatchEvent(touch('pointerdown', 2, 100, 0));
    node.dispatchEvent(touch('pointerup', 2, 100, 0));
    const tap = new MouseEvent('click', { bubbles: true, cancelable: true });
    node.dispatchEvent(tap);

    expect(tap.defaultPrevented).toBe(false);
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
