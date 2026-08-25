import { afterEach, describe, expect, it, vi } from 'vitest';
import { POINTER_RESUME_GAP_MS, POINTER_RESUME_JUMP_RATIO } from '$lib/drawing/strokeMath';
import { scribbleGuard, scribbleTap } from './scribbleGuard';

const { flushSync, forgetPenPointer } = vi.hoisted(() => ({
  flushSync: vi.fn(),
  forgetPenPointer: vi.fn(),
}));
vi.mock('svelte', () => ({ flushSync }));
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
    flushSync.mockReset();
    forgetPenPointer.mockReset();
    document.body.innerHTML = '';
  });

  it('activates once on a completed press without flushing, ignoring the trailing click', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(flushSync).not.toHaveBeenCalled();
  });

  it('prepares a press before activating its completed tap', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const events: string[] = [];
    const action = scribbleTap(el, {
      activate: () => events.push('activate'),
      onPressStart: () => events.push('prepare'),
      onPressCancel: () => events.push('cancel'),
    });
    tapActions.add(action);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(el);

    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));

    expect(events).toEqual(['prepare', 'activate']);
  });

  it('cancels preparation when a press does not activate', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const events: string[] = [];
    const action = scribbleTap(el, {
      activate: () => events.push('activate'),
      onPressStart: () => events.push('prepare'),
      onPressCancel: () => events.push('cancel'),
    });
    tapActions.add(action);

    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointercancel', 1));

    expect(events).toEqual(['prepare', 'cancel']);
  });

  it('cancels a live preparation before starting a re-entrant press', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const events: string[] = [];
    const action = scribbleTap(el, {
      activate: () => events.push('activate'),
      onPressStart: () => events.push('prepare'),
      onPressCancel: () => events.push('cancel'),
    });
    tapActions.add(action);

    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerdown', 2));

    expect(events).toEqual(['prepare', 'cancel', 'prepare']);
  });

  it('cancels a live preparation when the action is destroyed', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const events: string[] = [];
    const action = scribbleTap(el, {
      activate: () => events.push('activate'),
      onPressStart: () => events.push('prepare'),
      onPressCancel: () => events.push('cancel'),
    });
    tapActions.add(action);

    el.dispatchEvent(pointerEvent('pointerdown', 1));
    action.destroy();
    tapActions.delete(action);

    expect(events).toEqual(['prepare', 'cancel']);
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

  it('lets the latest press activate when the previous pointerup never arrived', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerdown', 2));
    window.dispatchEvent(pointerEvent('pointerup', 2));
    expect(activate).toHaveBeenCalledTimes(1);
    window.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('routes concurrent presses to their owning action', () => {
    const first = tapElement();
    const second = tapElement();
    vi.mocked(document.elementFromPoint).mockImplementation((x) => (x < 20 ? first.el : second.el));
    first.el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 10 }));
    second.el.dispatchEvent(pointerEvent('pointerdown', 2, { clientX: 30 }));
    window.dispatchEvent(pointerEvent('pointerup', 2, { clientX: 30 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 10 }));
    expect(first.activate).toHaveBeenCalledTimes(1);
    expect(second.activate).toHaveBeenCalledTimes(1);
  });

  it('shares window listeners until the last action is destroyed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = tapElement();
    const second = tapElement();

    expect(add.mock.calls.map(([type, , options]) => [type, options])).toEqual([
      ['pointermove', true],
      ['pointerup', true],
      ['pointercancel', true],
    ]);

    first.action.destroy();
    expect(remove).not.toHaveBeenCalled();
    second.action.destroy();
    expect(remove.mock.calls.map(([type, , options]) => [type, options])).toEqual([
      ['pointermove', true],
      ['pointerup', true],
      ['pointercancel', true],
    ]);
  });

  it('survives pointerleave drift when the release hit-tests inside the control', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointermove', 1, { clientX: 10.25, clientY: 10 }));
    el.dispatchEvent(pointerEvent('pointerleave', 1, { clientX: 10.25, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 10.25, clientY: 10 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  // iPadOS snaps a near-miss touch onto the control: the browser targets the
  // whole pointer stream at it while a raw elementFromPoint at the release
  // point still reports the neighbor. The release is re-asked at the nearest
  // point inside the control's rect — on-device the un-forgiven miss was a tap
  // 1px above the undo button playing its press animation and doing nothing
  // (issue 1237). The mocks reproduce that geometry: the button spans y 948 to
  // 1010, the tap lands at 947.
  function nearMissGeometry(el: HTMLElement) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      x: 8,
      y: 948,
      left: 8,
      top: 948,
      right: 70,
      bottom: 1010,
      width: 62,
      height: 62,
      toJSON: () => ({}),
    } as DOMRect);
    vi.mocked(document.elementFromPoint).mockImplementation((_x, y) =>
      y >= 948 ? el : document.body
    );
  }

  it('activates a sub-tolerance near-miss the browser targeted at the control', () => {
    const { el, activate } = tapElement();
    nearMissGeometry(el);
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 39, clientY: 947 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 39, clientY: 947 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  // The forgiveness must ask the browser's hit-test at the snapped point, not
  // merely trust the press: a control that collapsed, hid, or was covered
  // mid-press — which the browser would never target — still cancels, even
  // though the finger never moved. (Adversarial review of the first fix: a
  // held press on the undo button survived the drawer collapsing it away and
  // deleted a stroke on release.)
  it('does not activate a stationary press on a control that vanished mid-press', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 39, clientY: 947 }));
    vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 39, clientY: 947 }));
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not activate a beyond-tolerance miss even inside the snapped rect axis', () => {
    const { el, activate } = tapElement();
    nearMissGeometry(el);
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 39, clientY: 930 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 39, clientY: 930 }));
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not activate when the pointer travels and releases outside the control', () => {
    const { el, activate } = tapElement();
    vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
    el.dispatchEvent(pointerEvent('pointerdown', 1, { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 40, clientY: 10 }));
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
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).not.toHaveBeenCalled();
  });

  // The other face of the iPadOS near-miss (issue 1237): touch-target expansion
  // can aim the pointer stream at a neighbor while WebKit still synthesizes the
  // click on this control. With no press to consume it, the click is the
  // browser's tap resolution and must activate — discarding it left a button
  // that played no feedback and did nothing.
  it('activates on a browser-resolved click whose pointer stream missed the control', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  // The consuming window exists because the synthesized click is NOT dispatched
  // synchronously with the pointerup — on-device it arrived two tasks later,
  // where a zero-delay timer had already expired and the control double-fired
  // (drawer expanded on pointerup, collapsed again on the click).
  it('consumes the trailing click even when it arrives a task later', () => {
    const { el, activate } = tapElement();
    const base = performance.now();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    vi.spyOn(performance, 'now').mockReturnValue(base + 5);
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('lets a click activate once the consume window has expired', () => {
    const { el, activate } = tapElement();
    const base = performance.now();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    expect(activate).toHaveBeenCalledTimes(1);
    vi.spyOn(performance, 'now').mockReturnValue(base + 1e6);
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(2);
  });

  // The window is armed AFTER the handler runs: an activation that itself
  // takes longer than the window (post-rotation relayout, a cold dialog mount)
  // must not burn the allowance meant for the browser's click-synthesis delay
  // and let its own trailing click re-fire. (Adversarial review of the first
  // fix — a slow toggleDrawer expanded on pointerup, collapsed on the click.)
  it('consumes the trailing click of a slow activation', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const base = performance.now();
    let clock = base;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const activate = vi.fn(() => {
      clock += 5000;
    });
    const action = scribbleTap(el, activate);
    tapActions.add(action);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(el);

    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    clock += 5;
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  // A counter, not a flag: two rapid taps whose synthesized clicks both arrive
  // late must both be consumed — a single slot let the second click re-fire.
  it('consumes one trailing click per completed press', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    el.dispatchEvent(pointerEvent('pointerdown', 2));
    window.dispatchEvent(pointerEvent('pointerup', 2));
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(2);
  });

  // A pointercancel produces no synthesized click, so it must not arm
  // consumption — arming there swallowed the next genuine browser-resolved
  // near-miss click for the whole window, recreating the dead tap this exists
  // to fix.
  it('does not let a cancelled press swallow a later browser-resolved click', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    window.dispatchEvent(pointerEvent('pointercancel', 1));
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('activates once for two concurrent pointers on one control', () => {
    const { el, activate } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerdown', 2));
    window.dispatchEvent(pointerEvent('pointerup', 2));
    window.dispatchEvent(pointerEvent('pointerup', 1));
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('stays inert for a click after destroy mid-press', () => {
    const { el, activate, action } = tapElement();
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    action.destroy();
    tapActions.delete(action);
    el.dispatchEvent(new MouseEvent('click', { detail: 1 }));
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

  it('handles a missing lift after the engine capture listener and before target drawing', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const order: string[] = [];
    const engineCapture = () => order.push('engine capture');
    const targetDraw = () => order.push('target draw');
    window.addEventListener('pointermove', engineCapture, true);
    canvas.addEventListener('pointermove', targetDraw);
    const { el, activate } = tapElement();
    forgetPenPointer.mockImplementation(() => order.push('forget pen pointer'));
    activate.mockImplementation(() => order.push('activate'));
    flushSync.mockImplementation(() => order.push('flush'));
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
    canvas.dispatchEvent(resumed);
    window.removeEventListener('pointermove', engineCapture, true);
    canvas.removeEventListener('pointermove', targetDraw);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(forgetPenPointer).toHaveBeenCalledWith(1);
    expect(flushSync).toHaveBeenCalledTimes(1);
    expect(resumed.defaultPrevented).toBe(true);
    expect(order).toEqual(['engine capture', 'forget pen pointer', 'activate', 'flush']);
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

  it.each([0, -1])(
    'falls back to drag classification when the viewport side is %s',
    (viewportSide) => {
      vi.useFakeTimers();
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(viewportSide);
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(viewportSide);
      const { el, activate } = tapElement();
      vi.mocked(document.elementFromPoint).mockImplementation((x) => (x < 20 ? el : document.body));
      el.dispatchEvent(
        pointerEvent('pointerdown', 1, { pointerType: 'pen', buttons: 1, clientX: 10 })
      );
      vi.advanceTimersByTime(POINTER_RESUME_GAP_MS + 1);
      const drag = pointerEvent('pointermove', 1, {
        pointerType: 'pen',
        buttons: 1,
        clientX: 30,
      });
      window.dispatchEvent(drag);
      expect(drag.defaultPrevented).toBe(false);
      expect(activate).not.toHaveBeenCalled();
      expect(forgetPenPointer).not.toHaveBeenCalled();
      expect(flushSync).not.toHaveBeenCalled();
      window.dispatchEvent(pointerEvent('pointerup', 1, { clientX: 10 }));
      expect(activate).not.toHaveBeenCalled();
    }
  );

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
