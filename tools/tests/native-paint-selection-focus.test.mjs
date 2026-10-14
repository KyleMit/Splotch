// @vitest-environment happy-dom
import {
  act,
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePaintSelectionFocus } from '../../experiments/native-architecture/src/drawing/usePaintSelectionFocus.ts';

const native = vi.hoisted(() => ({ listener: null }));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event, listener) => {
      native.listener = listener;
      return {
        remove: () => {
          native.listener = null;
        },
      };
    },
  },
}));

let root;
let container;
let resolveWrite;
let driver;
let attempted;
let returnedCurrent;

const NativeButton = forwardRef(({ disabled, ...props }, ref) => {
  const target = useRef(null);
  useImperativeHandle(ref, () => target.current, []);
  useLayoutEffect(() => {
    // This simulates focus loss on disabling; RNW transition causality requires a real trace.
    if (disabled) target.current.blur();
    target.current.disabled = disabled;
  }, [disabled]);
  return createElement('button', { ...props, ref: target });
});

// A choice that holds the palette disabled until its write lands, as any settings save does.
function Fixture() {
  const [color, setColor] = useState('Purple');
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const black = useRef(null);
  const mounted = useRef(true);
  const disabled = saving || blocked;
  const focus = usePaintSelectionFocus({ color, disabled, blocked });
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  function save(next) {
    setSaving(true);
    return new Promise((resolve) => {
      resolveWrite = () => {
        if (mounted.current) {
          setColor(next);
          setSaving(false);
        }
        resolve();
      };
    });
  }
  driver = {
    saving: () => saving,
    color: () => color,
    choose(hasFocus = true) {
      return focus.choose(
        'Black',
        hasFocus
          ? {
              focus(isCurrent) {
                black.current.focus();
                returnedCurrent = isCurrent;
              },
            }
          : null,
        () => {
          attempted();
          return save('Black');
        }
      );
    },
    setBlocked,
  };
  return createElement(
    'div',
    { onFocus: focus.cancel, onPointerDown: focus.cancel, onTouchStart: focus.cancel },
    createElement(NativeButton, { ref: black, disabled, 'aria-label': 'Black' }),
    createElement('button', { 'aria-label': 'Purple' }),
    createElement('button', { 'aria-label': 'Other' })
  );
}
function button(label) {
  return container.querySelector(`[aria-label="${label}"]`);
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  attempted = vi.fn();
  resolveWrite = null;
  returnedCurrent = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Fixture)));
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container.remove();
});
function choose(origin = 'keyboard') {
  act(() => {
    if (origin === 'pointer')
      button('Black').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    button('Black').focus();
    if (origin === 'pointer')
      button('Black').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  act(() => {
    void driver.choose();
  });
}
async function complete() {
  await act(async () => {
    resolveWrite();
  });
}

it.each(['keyboard', 'pointer'])(
  'restores the %s choice only after its save and blocks busy actions',
  async (origin) => {
    const focus = vi.spyOn(button('Black'), 'focus');
    choose(origin);
    expect(driver.saving()).toBe(true);
    expect(button('Black').disabled).toBe(true);
    expect(document.activeElement).not.toBe(button('Black'));
    expect(focus).toHaveBeenCalledTimes(1);
    act(() => {
      void driver.choose();
    });
    expect(attempted).toHaveBeenCalledTimes(1);
    await complete();
    expect(driver.saving()).toBe(false);
    expect(driver.color()).toBe('Black');
    expect(document.activeElement).toBe(button('Black'));
    expect(focus).toHaveBeenCalledTimes(2);
    act(() => button('Purple').focus());
    expect(document.activeElement).toBe(button('Purple'));
  }
);

it('does not return focus when activation had no initiating focus', async () => {
  act(() => button('Other').focus());
  act(() => {
    void driver.choose(false);
  });
  const focus = vi.spyOn(button('Black'), 'focus');
  await complete();
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button('Other'));
});

const CANCELLATIONS = ['new focus', 'pointer', 'touch', 'AppState', 'successor', 'unmount'];
it.each(
  ['keyboard', 'pointer'].flatMap((origin) => CANCELLATIONS.map((reason) => [origin, reason]))
)('cancels a late %s return after %s', async (origin, reason) => {
  choose(origin);
  const focus = vi.spyOn(button('Black'), 'focus');
  act(() => {
    if (reason === 'new focus') button('Other').focus();
    if (reason === 'pointer')
      button('Other').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    if (reason === 'touch')
      button('Other').dispatchEvent(new Event('touchstart', { bubbles: true }));
    if (reason === 'AppState') native.listener('background');
    if (reason === 'successor') driver.setBlocked(true);
    if (reason === 'unmount') {
      root.unmount();
      root = null;
    }
  });
  await complete();
  if (reason === 'successor') act(() => driver.setBlocked(false));
  expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(button('Black'));
  const expectedActive = reason === 'new focus' ? button('Other') : document.body;
  expect(document.activeElement).toBe(expectedActive);
});

it.each(CANCELLATIONS)('invalidates a completed return measurement after %s', async (reason) => {
  choose();
  await complete();
  expect(returnedCurrent()).toBe(true);
  act(() => {
    if (reason === 'new focus') button('Other').focus();
    if (reason === 'pointer')
      button('Other').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    if (reason === 'touch')
      button('Other').dispatchEvent(new Event('touchstart', { bubbles: true }));
    if (reason === 'AppState') native.listener('background');
    if (reason === 'successor') driver.setBlocked(true);
    if (reason === 'unmount') {
      root.unmount();
      root = null;
    }
  });
  expect(returnedCurrent()).toBe(false);
});
