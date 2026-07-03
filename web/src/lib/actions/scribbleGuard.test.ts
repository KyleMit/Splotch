import { describe, expect, it } from 'vitest';
import { scribbleGuard } from './scribbleGuard';

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
