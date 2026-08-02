import { afterEach, describe, expect, it, vi } from 'vitest';
import { POINTER_RESUME_GAP_MS, POINTER_RESUME_JUMP_RATIO } from '$lib/drawing/strokeMath';
import { scribbleGuard, scribbleTap } from './scribbleGuard';

const forgetPenPointer = vi.hoisted(() => vi.fn());
vi.mock('$lib/drawing/engine', () => ({ forgetPenPointer }));

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
function pointerEvent(
  type: string,
  pointerId: number,
  { clientX = 0, clientY = 0, pointerType = 'mouse', buttons = 0 } = {}
) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'clientX', { value: clientX });
  Object.defineProperty(e, 'clientY', { value: clientY });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  Object.defineProperty(e, 'buttons', { value: buttons });
  return e;
}

const tapActions = new Set<{ destroy: () => void }>();

function tapElement() {
  const el = document.createElement('button');
  document.body.appendChild(el);
  const activate = vi.fn();
  const action = scribbleTap(el, activate);
  tapActions.add(action);
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(el);
  return { el, activate, action };
}

describe('scribbleTap', () => {
  afterEach(() => {
    for (const action of tapActions) action.destroy();
    tapActions.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    forgetPenPointer.mockClear();
    document.body.innerHTML = '';
  });

  it('activates once on a completed press, ignoring the trailing click', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('activates on a keyboard/AT click (detail 0, no pointer press)', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('ignores a pointerup whose press did not start on the control (a drag ending there)', () => {
    const { activate } = tapElement();
    window.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).not.toHaveBeenCalled();
  });

  it('ignores a pointerup from a different pointer than the press', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 2));
    expect(activate).not.toHaveBeenCalled();
  });

  it('survives pointerleave drift when the release hit-tests inside the control', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointermove', 1, { clientX: 10.25, clientY: 10 }));
    el.dispatchEvent(pointerEvent('pointerleave', 1, { clientX: 10.25, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 10.25, clientY: 10 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('does not activate when the same pointer releases outside the control', () => {
    const { el, activate } = tapElement();
    vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not activate a drag that leaves and ends back on the control', () => {
    const { el, activate } = tapElement();
    vi.mocked(document.elementFromPoint).mockImplementation((x) => (x < 20 ? el : document.body));
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointermove', 1, { clientX: 30, clientY: 10 }));
    el.dispatchEvent(pointerEvent('pointerleave', 1, { clientX: 30, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointermove', 1, { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 10, clientY: 10 }));
    expect(activate).not.toHaveBeenCalled();
  });

  it('stops hit-testing moves once the press is known to be dragged', () => {
    const { el } = tapElement();
    const hitTest = vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointermove', 1, { clientX: 10 }));
    window.dispatchEvent(pointerEvent('pointermove', 1, { clientX: 20 }));
    expect(hitTest).toHaveBeenCalledTimes(1);
  });

  it('keeps a press tappable when larger movement stays inside the control', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointermove', 1, { clientX: 40, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 40, clientY: 10 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('clears the press when the pointer is cancelled', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointercancel', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).not.toHaveBeenCalled();
  });

  it('completes a pen tap when a far move after the resume gap proves its up was omitted', () => {
    vi.useFakeTimers();
    const { el, activate } = tapElement();
    const jump = Math.min(window.innerWidth, window.innerHeight) * POINTER_RESUME_JUMP_RATIO + 1;
    el.dispatchEvent(
      pointerEvent('pointerdown', 1, { pointerType: 'pen', buttons: 1, clientX: 10 })
    );
    vi.advanceTimersByTime(POINTER_RESUME_GAP_MS + 1);
    window.dispatchEvent(
      pointerEvent('pointermove', 1, {
        pointerType: 'pen',
        buttons: 1,
        clientX: 10 + jump,
      })
    );
    expect(activate).toHaveBeenCalledTimes(1);
    expect(forgetPenPointer).toHaveBeenCalledWith(1);
  });

  it('does not mistake a continuous pen drag for an omitted-up tap', () => {
    vi.useFakeTimers();
    const { el, activate } = tapElement();
    const jump = Math.min(window.innerWidth, window.innerHeight) * POINTER_RESUME_JUMP_RATIO + 1;
    el.dispatchEvent(
      pointerEvent('pointerdown', 1, { pointerType: 'pen', buttons: 1, clientX: 10 })
    );
    vi.advanceTimersByTime(POINTER_RESUME_GAP_MS);
    window.dispatchEvent(
      pointerEvent('pointermove', 1, {
        pointerType: 'pen',
        buttons: 1,
        clientX: 10 + jump,
      })
    );
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not reinterpret a dragged pen as a tap after a later idle jump', () => {
    vi.useFakeTimers();
    const { el, activate } = tapElement();
    vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
    const jump = Math.min(window.innerWidth, window.innerHeight) * POINTER_RESUME_JUMP_RATIO + 1;
    el.dispatchEvent(
      pointerEvent('pointerdown', 1, { pointerType: 'pen', buttons: 1, clientX: 10 })
    );
    window.dispatchEvent(
      pointerEvent('pointermove', 1, { pointerType: 'pen', buttons: 1, clientX: 30 })
    );
    vi.advanceTimersByTime(POINTER_RESUME_GAP_MS + 1);
    window.dispatchEvent(
      pointerEvent('pointermove', 1, {
        pointerType: 'pen',
        buttons: 1,
        clientX: 30 + jump,
      })
    );
    expect(activate).not.toHaveBeenCalled();
  });

  it('consumes the first resumed pen move after synchronously activating', () => {
    vi.useFakeTimers();
    const { el, activate } = tapElement();
    const downstream = vi.fn();
    window.addEventListener('pointermove', downstream, true);
    const jump = Math.min(window.innerWidth, window.innerHeight) * POINTER_RESUME_JUMP_RATIO + 1;
    el.dispatchEvent(
      pointerEvent('pointerdown', 1, { pointerType: 'pen', buttons: 1, clientX: 10 })
    );
    vi.advanceTimersByTime(POINTER_RESUME_GAP_MS + 1);
    const resumed = pointerEvent('pointermove', 1, {
      pointerType: 'pen',
      buttons: 1,
      clientX: 10 + jump,
    });
    window.dispatchEvent(resumed);
    window.removeEventListener('pointermove', downstream, true);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(downstream).not.toHaveBeenCalled();
    expect(resumed.defaultPrevented).toBe(true);
  });

  it('update() swaps the handler', () => {
    const { el, activate, action } = tapElement();
    const next = vi.fn();
    action.update(next);
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('detaches on destroy', () => {
    const { el, activate, action } = tapElement();
    action.destroy();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    el.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    expect(activate).not.toHaveBeenCalled();
  });
});
