import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHexSnapGesture } from './hexSnapGesture';

const HEX_WIDTH_PX = 60;
const HEX_HEIGHT_PX = 69;

describe('hex snap gesture', () => {
  let picker: HTMLDivElement;
  let gesture: ReturnType<typeof createHexSnapGesture>;
  let centers: Record<string, { cx: number; cy: number }>;
  const hover = vi.fn();
  const pick = vi.fn();

  function addHexagon(color: string) {
    const hex = document.createElement('button');
    hex.className = 'hexagon';
    hex.dataset.color = color;
    hex.getBoundingClientRect = () => {
      const { cx, cy } = centers[color];
      return new DOMRect(
        cx - HEX_WIDTH_PX / 2,
        cy - HEX_HEIGHT_PX / 2,
        HEX_WIDTH_PX,
        HEX_HEIGHT_PX
      );
    };
    picker.append(hex);
    return hex;
  }

  function pointer(type: string, x: number, y: number, target: Element = picker) {
    const event = new PointerEvent(type, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    hover.mockClear();
    pick.mockClear();
    centers = { '#ff0000': { cx: 100, cy: 100 }, '#0000ff': { cx: 200, cy: 100 } };
    picker = document.createElement('div');
    picker.setPointerCapture = vi.fn();
    addHexagon('#ff0000');
    addHexagon('#0000ff');
    document.body.append(picker);
    gesture = createHexSnapGesture({ hover, pick });
    picker.addEventListener('pointerdown', gesture.down);
    picker.addEventListener('pointermove', gesture.move);
    picker.addEventListener('pointerup', gesture.up);
    picker.addEventListener('pointercancel', gesture.reset);
    picker.addEventListener('pointerleave', gesture.leave);
  });
  afterEach(() => {
    picker.remove();
    vi.restoreAllMocks();
  });

  it('snaps a gap tap to the nearest center and commits it', () => {
    const down = pointer('pointerdown', 135, 100);
    expect(hover).toHaveBeenLastCalledWith('#ff0000');
    expect(down.defaultPrevented).toBe(true);
    pointer('pointerup', 135, 100);
    expect(pick).toHaveBeenCalledExactlyOnceWith('#ff0000');
  });

  it('prefers the hexagon under a direct hit', () => {
    const blue = picker.querySelector<HTMLElement>('[data-color="#0000ff"]');
    if (!blue) throw new Error('missing hexagon');
    pointer('pointerdown', 0, 0, blue);
    expect(hover).toHaveBeenLastCalledWith('#0000ff');
  });

  it('ignores a down beyond every snap radius', () => {
    const down = pointer('pointerdown', 400, 400);
    pointer('pointerup', 400, 400);
    expect(hover).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(false);
  });

  it('commits the highlighted color when the up lands past the radius', () => {
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 195, 100);
    pointer('pointerup', 400, 400);
    expect(pick).toHaveBeenCalledExactlyOnceWith('#0000ff');
  });

  it('clears the highlight when a move leaves every hexagon', () => {
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 150, 300);
    expect(hover).toHaveBeenLastCalledWith(null);
  });

  it('takes pointer capture on down so a later up still commits', () => {
    pointer('pointerdown', 100, 100);
    expect(picker.setPointerCapture).toHaveBeenCalledWith(1);
    pointer('pointerleave', 600, 600);
    pointer('pointerup', 600, 600);
    expect(pick).toHaveBeenCalledExactlyOnceWith('#ff0000');
  });

  it('re-snapshots the centers on each down', () => {
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 100, 100);
    centers['#ff0000'] = { cx: 500, cy: 500 };
    pointer('pointerdown', 500, 500);
    expect(hover).toHaveBeenLastCalledWith('#ff0000');
  });

  it('drops the snapshot when the layout is invalidated', () => {
    pointer('pointerdown', 100, 100);
    centers['#0000ff'] = { cx: 300, cy: 300 };
    pointer('pointermove', 300, 300);
    expect(hover).toHaveBeenLastCalledWith(null);
    gesture.invalidateLayout();
    pointer('pointermove', 300, 300);
    expect(hover).toHaveBeenLastCalledWith('#0000ff');
  });

  it('forgets a cancelled drag', () => {
    pointer('pointerdown', 100, 100);
    pointer('pointercancel', 100, 100);
    expect(hover).toHaveBeenLastCalledWith(null);
    pointer('pointerup', 400, 400);
    expect(pick).not.toHaveBeenCalled();
  });

  it('leaves no stale commit after a reset mid-drag', () => {
    pointer('pointerdown', 100, 100);
    gesture.reset();
    pointer('pointermove', 200, 100);
    pointer('pointerup', 400, 400);
    expect(pick).not.toHaveBeenCalled();
  });

  it('keeps the highlight on leave only while dragging', () => {
    pointer('pointerdown', 100, 100);
    hover.mockClear();
    pointer('pointerleave', 600, 600);
    expect(hover).not.toHaveBeenCalled();
    pointer('pointerup', 100, 100);
    pointer('pointerleave', 600, 600);
    expect(hover).toHaveBeenLastCalledWith(null);
  });
});
