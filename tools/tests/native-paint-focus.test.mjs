// @vitest-environment happy-dom
import { act, createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaintColors } from '../../experiments/native-architecture/src/drawing/PaintColors.tsx';

const controls = vi.hoisted(() => ({
  layouts: new Map(),
  positions: new Map(),
  measurements: [],
  deferred: false,
  scrollTo: vi.fn(),
  change: vi.fn(),
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active' },
  StyleSheet: { create: (styles) => styles },
  View: forwardRef(({ children }, ref) => createElement('div', { ref }, children)),
  Text: ({ children }) => createElement('span', null, children),
  ScrollView: forwardRef(({ children }, ref) => {
    useImperativeHandle(ref, () => ({ scrollTo: controls.scrollTo }), []);
    return createElement('div', null, children);
  }),
  Pressable: forwardRef(
    (
      {
        children,
        accessibilityLabel,
        disabled,
        onLayout,
        onFocus,
        onBlur,
        onPointerDown,
        onPointerUp,
        onPointerCancel,
        onPress,
      },
      ref
    ) => {
      if (onLayout) controls.layouts.set(accessibilityLabel, onLayout);
      return createElement(
        'button',
        {
          ref: (node) => {
            if (node)
              node.measureLayout = (_relative, success) => {
                const invoke = () => success(controls.positions.get(accessibilityLabel) ?? 0);
                if (controls.deferred) controls.measurements.push(invoke);
                else invoke();
              };
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          },
          'aria-label': accessibilityLabel,
          disabled,
          onFocus,
          onBlur,
          onPointerDown,
          onPointerUp,
          onPointerCancel,
          onClick: onPress,
        },
        children
      );
    }
  ),
}));

const CUSTOM_PAINTS = ['#123456', '#234567', '#345678', '#456789', '#56789A', '#6789AB'];
let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  controls.layouts.clear();
  controls.positions.clear();
  controls.measurements.length = 0;
  controls.deferred = false;
  controls.scrollTo.mockReset();
  controls.change.mockReset();
  container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function mount(customColors, disabled = false) {
  act(() =>
    root.render(
      createElement(PaintColors, {
        color: 'Purple',
        customColors,
        disabled,
        openerRef: createRef(),
        onChange: controls.change,
        onExplore: vi.fn(),
      })
    )
  );
}
function button(label) {
  return container.querySelector(`[aria-label="${label}"]`);
}
function measure(label, x) {
  controls.positions.set(label, x);
  act(() =>
    controls.layouts.get(label)({ nativeEvent: { layout: { x, y: 0, width: 52, height: 52 } } })
  );
}

it.each([0, 1, 6])(
  'reveals the measured last paint with %i custom paints and returns to Purple',
  (count) => {
    mount(CUSTOM_PAINTS.slice(0, count));
    const label = count ? `Custom paint ${CUSTOM_PAINTS[count - 1]}` : 'Black paint';
    const measuredX = 941;
    measure(label, measuredX);
    measure('Purple paint', 0);
    act(() => button(label).focus());
    expect(controls.scrollTo).toHaveBeenLastCalledWith({ x: measuredX, y: 0, animated: false });
    expect(globalThis.document.activeElement).toBe(button(label));
    act(() => button('Purple paint').focus());
    expect(controls.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: false });
    expect(globalThis.document.activeElement).toBe(button('Purple paint'));
    measure(label, 713);
    act(() => button(label).focus());
    expect(controls.scrollTo).toHaveBeenLastCalledWith({ x: 713, y: 0, animated: false });
    measure(label, 557);
    expect(controls.scrollTo).toHaveBeenLastCalledWith({ x: 557, y: 0, animated: false });
  }
);

it('keeps pointer focus and activation on the chosen paint without shifting it', () => {
  mount(CUSTOM_PAINTS);
  const paint = button('Blue paint');
  measure('Blue paint', 137);
  act(() => {
    paint.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    paint.focus();
    paint.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    paint.click();
  });
  expect(controls.scrollTo).not.toHaveBeenCalled();
  expect(globalThis.document.activeElement).toBe(paint);
  expect(controls.change).toHaveBeenCalledWith(
    'Blue',
    expect.objectContaining({ focus: expect.any(Function) })
  );
  const selectionTarget = controls.change.mock.lastCall[1];
  act(() => paint.blur());
  act(() => selectionTarget.focus(() => true));
  expect(globalThis.document.activeElement).toBe(paint);
  expect(controls.scrollTo).not.toHaveBeenCalled();
  act(() => button('Purple paint').focus());
  act(() => paint.focus());
  expect(controls.scrollTo).toHaveBeenLastCalledWith({ x: 137, y: 0, animated: false });
});

it('does not create a focus target for activation without initial focus', () => {
  mount([]);
  act(() => button('Blue paint').click());
  expect(controls.change).toHaveBeenCalledWith('Blue', null);
});

it.each(['before', 'after'])(
  'reveals a reordered pointer custom paint only %s its completed return',
  (timing) => {
    mount(CUSTOM_PAINTS);
    const label = `Custom paint ${CUSTOM_PAINTS.at(-1)}`;
    const paint = button(label);
    measure(label, 941);
    act(() => {
      paint.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      paint.focus();
      paint.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      paint.click();
      paint.blur();
    });
    const target = controls.change.mock.lastCall[1];
    if (timing === 'before') measure(label, 713);
    expect(controls.scrollTo).not.toHaveBeenCalled();
    act(() => target.focus(() => true));
    if (timing === 'after') measure(label, 713);
    expect(controls.scrollTo).toHaveBeenCalledExactlyOnceWith({ x: 713, y: 0, animated: false });
    expect(document.activeElement).toBe(paint);
  }
);

it('does not activate or reveal a disabled paint', () => {
  mount([], true);
  measure('Black paint', 431);
  act(() => {
    button('Black paint').focus();
    button('Black paint').click();
  });
  expect(controls.scrollTo).not.toHaveBeenCalled();
  expect(controls.change).not.toHaveBeenCalled();
});

it.each(['keyboard', 'pointer'])(
  'measures a reordered %s custom return without a layout event',
  (origin) => {
    mount(CUSTOM_PAINTS);
    const label = `Custom paint ${CUSTOM_PAINTS.at(-1)}`,
      paint = button(label);
    measure(label, 941);
    act(() => {
      if (origin === 'pointer')
        paint.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      paint.focus();
      if (origin === 'pointer')
        paint.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      paint.click();
      paint.blur();
    });
    const target = controls.change.mock.lastCall[1];
    controls.scrollTo.mockClear();
    controls.positions.set(label, 713);
    mount([CUSTOM_PAINTS.at(-1), ...CUSTOM_PAINTS.slice(0, -1)], true);
    expect(controls.scrollTo).not.toHaveBeenCalled();
    mount([CUSTOM_PAINTS.at(-1), ...CUSTOM_PAINTS.slice(0, -1)]);
    act(() => target.focus(() => true));
    expect(controls.scrollTo).toHaveBeenLastCalledWith({ x: 713, y: 0, animated: false });
    expect(document.activeElement).toBe(paint);
  }
);

it.each(['interaction', 'blur', 'unmount'])('rejects late measurement after %s', (reason) => {
  mount(CUSTOM_PAINTS);
  const paint = button('Black paint');
  measure('Black paint', 941);
  act(() => {
    paint.focus();
    paint.click();
    paint.blur();
  });
  const target = controls.change.mock.lastCall[1];
  controls.scrollTo.mockClear();
  controls.deferred = true;
  let current = true;
  act(() => target.focus(() => current));
  if (reason === 'interaction') current = false;
  if (reason === 'blur') act(() => paint.blur());
  if (reason === 'unmount') {
    act(() => root.unmount());
    root = createRoot(container);
  }
  act(() => {
    for (const complete of controls.measurements) complete();
  });
  expect(controls.scrollTo).not.toHaveBeenCalled();
});
