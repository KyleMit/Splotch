import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { colorFoldGesture } from './colorFoldGesture';
import { PRESS_CLICK_CONSUME_WINDOW_MS } from './scribbleGuard';

describe('color fold gesture', () => {
  let button: HTMLButtonElement;
  let action: ReturnType<typeof colorFoldGesture>;
  const tap = vi.fn();
  const fold = vi.fn();

  function pointer(type: string, x: number, y: number, pointerId = 1) {
    button.dispatchEvent(new PointerEvent(type, { pointerId, clientX: x, clientY: y, button: 0 }));
  }

  beforeEach(() => {
    tap.mockClear();
    fold.mockClear();
    button = document.createElement('button');
    button.setPointerCapture = vi.fn();
    button.hasPointerCapture = () => true;
    button.releasePointerCapture = vi.fn();
    action = colorFoldGesture(button, { tap, fold });
  });
  afterEach(() => {
    action.destroy();
    vi.restoreAllMocks();
  });

  it('opens on a small tap and consumes its trailing click', () => {
    pointer('pointerdown', 10, 10);
    pointer('pointerup', 10, 27);
    button.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(tap).toHaveBeenCalledTimes(1);
    expect(fold).not.toHaveBeenCalled();
  });

  it.each([
    [40, true],
    [-40, false],
  ] as const)('folds by vertical travel %s', (dy, folded) => {
    pointer('pointerdown', 30, 100);
    pointer('pointermove', 30, 100 + dy);
    pointer('pointerup', 30, 100 + dy);
    button.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(fold).toHaveBeenCalledExactlyOnceWith(folded);
    expect(tap).not.toHaveBeenCalled();
  });

  it('cancels horizontal and returning drags', () => {
    pointer('pointerdown', 20, 100);
    pointer('pointermove', 70, 100);
    pointer('pointerup', 20, 100);
    expect(tap).not.toHaveBeenCalled();
    expect(fold).not.toHaveBeenCalled();
  });

  it('ignores another pointer and cancellation', () => {
    pointer('pointerdown', 20, 100);
    pointer('pointerup', 20, 50, 2);
    pointer('pointercancel', 20, 100);
    pointer('pointerup', 20, 150);
    expect(tap).not.toHaveBeenCalled();
    expect(fold).not.toHaveBeenCalled();
  });

  it('accepts a near-miss click after a cancelled pointer stream', () => {
    pointer('pointerdown', 20, 100);
    pointer('pointercancel', 20, 100);
    button.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('expires a missing trailing click after a fold swipe', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    pointer('pointerdown', 20, 100);
    pointer('pointerup', 20, 150);
    now.mockReturnValue(PRESS_CLICK_CONSUME_WINDOW_MS + 1);
    button.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(tap).toHaveBeenCalledTimes(1);
    expect(fold).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('consumes both delayed clicks from two rapid taps', () => {
    for (let i = 0; i < 2; i++) {
      pointer('pointerdown', 20, 100);
      pointer('pointerup', 20, 100);
    }
    for (let i = 0; i < 2; i++) button.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(tap).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard activation and updated handlers', () => {
    const updatedTap = vi.fn();
    action.update({ tap: updatedTap, fold });
    button.click();
    expect(updatedTap).toHaveBeenCalledTimes(1);
    expect(tap).not.toHaveBeenCalled();
  });
});
