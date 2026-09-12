import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const action = scribbleTap(el, vi.fn() as () => void);
  tapActions.add(action);
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(el);
  return { el };
}

afterEach(() => {
  for (const action of tapActions) action.destroy();
  tapActions.clear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
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
