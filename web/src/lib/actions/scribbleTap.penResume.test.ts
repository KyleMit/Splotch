import { afterEach, describe, expect, it, vi } from 'vitest';
import { POINTER_RESUME_GAP_MS, POINTER_RESUME_JUMP_RATIO } from '$lib/drawing/strokeMath';
import { scribbleTap } from './scribbleGuard';

const { flushSync, forgetPenPointer } = vi.hoisted(() => ({
  flushSync: vi.fn(),
  forgetPenPointer: vi.fn(),
}));
vi.mock('svelte', () => ({ flushSync }));
vi.mock('$lib/drawing/engine', () => ({ forgetPenPointer }));

// happy-dom lacks a PointerEvent constructor with pointerId, so stub it.
function pointerEvent(
  type: string,
  pointerId: number,
  { clientX = 0, clientY = 0, pointerType = 'mouse', button = 0, buttons = 0 } = {}
) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'clientX', { value: clientX });
  Object.defineProperty(e, 'clientY', { value: clientY });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  Object.defineProperty(e, 'button', { value: button });
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
  return { el, activate };
}

function resumeJumpPx() {
  return Math.min(window.innerWidth, window.innerHeight) * POINTER_RESUME_JUMP_RATIO + 1;
}

afterEach(() => {
  for (const action of tapActions) action.destroy();
  tapActions.clear();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  flushSync.mockReset();
  forgetPenPointer.mockReset();
});

// .claude/rules/svelte.md: code reached per pointermove must not measure DOM.
// This path shares frames with a live stroke by design — a second finger
// presses a swatch while the first is drawing (see PointerHalos) — so a style
// and layout flush per move competes with the stroke it runs alongside.
describe('scribbleTap viewport measurement', () => {
  function countClientWidthReads() {
    let reads = 0;
    const root = document.documentElement;
    const original = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(root), 'clientWidth');
    Object.defineProperty(root, 'clientWidth', {
      configurable: true,
      get() {
        reads++;
        return 800;
      },
    });
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => 600 });
    return {
      reads: () => reads,
      restore() {
        Reflect.deleteProperty(root, 'clientWidth');
        Reflect.deleteProperty(root, 'clientHeight');
        if (original) Object.defineProperty(Object.getPrototypeOf(root), 'clientWidth', original);
      },
    };
  }

  // viewportSide feeds a pen-only branch, so measuring for a finger would add a
  // layout flush to the common case — a toddler tapping swatches — which is
  // worse than the per-move read this hoist removed.
  it('does not measure the viewport at all for a touch press', () => {
    const { el } = tapElement();
    const probe = countClientWidthReads();

    try {
      el.dispatchEvent(pointerEvent('pointerdown', 2, { pointerType: 'touch' }));
      for (let i = 1; i <= 6; i++) {
        window.dispatchEvent(
          pointerEvent('pointermove', 2, { pointerType: 'touch', clientX: i, clientY: i })
        );
      }

      expect(probe.reads()).toBe(0);
    } finally {
      probe.restore();
    }
  });

  it('measures the viewport once per press, not once per pen move', () => {
    const { el } = tapElement();
    const probe = countClientWidthReads();

    try {
      el.dispatchEvent(pointerEvent('pointerdown', 1, { pointerType: 'pen', buttons: 1 }));
      const afterDown = probe.reads();

      for (let i = 1; i <= 12; i++) {
        window.dispatchEvent(
          pointerEvent('pointermove', 1, { pointerType: 'pen', buttons: 1, clientX: i, clientY: i })
        );
      }

      expect(afterDown).toBe(1);
      expect(probe.reads()).toBe(afterDown);
    } finally {
      probe.restore();
    }
  });
});

describe('scribbleTap pen resume', () => {
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
    const jump = resumeJumpPx();
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
    const jump = resumeJumpPx();
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
    const jump = resumeJumpPx();
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
    const jump = resumeJumpPx();
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
});
