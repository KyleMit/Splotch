import { describe, expect, it, vi } from 'vitest';
import { scribbleGuard, scribbleTap } from './scribbleGuard';

// Touch.touchType is Safari-only, so the stylus/finger discrimination can't be
// exercised in the Chromium e2e run — stubbed touch lists cover it here.
function touchEvent(type: string, touchTypes: (string | undefined)[]) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'changedTouches', {
    value: touchTypes.map((touchType) => ({ touchType })),
  });
  return e;
}

function guardedElement() {
  const el = document.createElement('div');
  const action = scribbleGuard(el);
  return { el, action };
}

describe('scribbleGuard', () => {
  it('cancels stylus touchstart/touchmove/touchend', () => {
    const { el } = guardedElement();
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      const e = touchEvent(type, ['stylus']);
      el.dispatchEvent(e);
      expect(e.defaultPrevented, type).toBe(true);
    }
  });

  it('leaves finger touches alone so click synthesis survives', () => {
    const { el } = guardedElement();
    const e = touchEvent('touchstart', ['direct']);
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('leaves touches without touchType alone (non-iOS browsers)', () => {
    const { el } = guardedElement();
    const e = touchEvent('touchstart', [undefined]);
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('leaves mixed stylus+finger contact alone', () => {
    const { el } = guardedElement();
    const e = touchEvent('touchstart', ['stylus', 'direct']);
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('detaches on destroy', () => {
    const { el, action } = guardedElement();
    action.destroy();
    const e = touchEvent('touchstart', ['stylus']);
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});

// happy-dom lacks a PointerEvent constructor with pointerId, so stub it the
// same way the touch helper stubs touchType.
function pointerEvent(type: string, pointerId: number) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  return e;
}

function tapElement() {
  const el = document.createElement('button');
  const activate = vi.fn();
  const action = scribbleTap(el, activate);
  return { el, activate, action };
}

describe('scribbleTap', () => {
  it('activates once on a completed press, ignoring the trailing click', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerup', 1));
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('activates on a keyboard/AT click (detail 0, no pointer press)', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('ignores a pointerup whose press did not start on the control (a drag ending there)', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).not.toHaveBeenCalled();
  });

  it('ignores a pointerup from a different pointer than the press', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerup', 2));
    expect(activate).not.toHaveBeenCalled();
  });

  it('clears the press when the pointer leaves or is cancelled', () => {
    const { el, activate } = tapElement();
    for (const interrupt of ['pointerleave', 'pointercancel']) {
      el.dispatchEvent(pointerEvent('pointerdown', 1));
      el.dispatchEvent(pointerEvent(interrupt, 1));
      el.dispatchEvent(pointerEvent('pointerup', 1));
    }
    expect(activate).not.toHaveBeenCalled();
  });

  it('update() swaps the handler', () => {
    const { el, activate, action } = tapElement();
    const next = vi.fn();
    action.update(next);
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('detaches on destroy', () => {
    const { el, activate, action } = tapElement();
    action.destroy();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerup', 1));
    el.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    expect(activate).not.toHaveBeenCalled();
  });
});
