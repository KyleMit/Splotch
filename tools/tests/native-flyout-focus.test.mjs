// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RsdActionsPanel,
  useFlyoutSlot,
} from '../../experiments/native-architecture/src/rsdDrawing/RsdActionsPanel.tsx';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';

// React Native Web's own View, refs and responder system decide what the panel's slots are; only
// React Strict DOM is reduced to the plain elements its web build emits.
vi.mock('react-native', async () => import('react-native-web'));
// The web build resolves each platform file to its web sibling; Vitest resolves the native one.
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdPressable.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdPressable.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/platform/flyoutFocus.ts',
  () => import('../../experiments/native-architecture/src/platform/flyoutFocus.web.ts')
);
vi.mock('react-native-svg', () => ({ SvgXml: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-strict-dom', () => ({
  html: Object.fromEntries(
    ['div', 'span', 'button'].map((tag) => [
      tag,
      ({ style: _style, ...props }) => createElement(tag, props),
    ])
  ),
  css: {
    create: (styles) =>
      Object.fromEntries(
        Object.entries(styles).map(([key, value]) => [
          key,
          typeof value === 'function' ? () => null : null,
        ])
      ),
    defineVars: (values) => values,
    createTheme: () => null,
  },
}));

const setBrush = vi.fn();
const setWidth = vi.fn();
let root;
let host;

function Panel() {
  const slot = useFlyoutSlot(true, false, false);
  return createElement(RsdActionsPanel, {
    screen: {
      brush: 'pen',
      brushControl: { kind: 'menu', brushes: ['pen', 'crayon', 'magic', 'eraser'] },
      availableBrushes: ['pen', 'crayon', 'magic', 'eraser'],
      history: { undo: [], drawing: emptyDrawing() },
      inkVisible: false,
      setBrush,
      toggleBrush() {},
      setPagePickerOpen() {},
      save: async () => {},
      undo() {},
    },
    sound: {
      settings: {
        status: 'ready',
        buttonScale: 100,
        strokeWidth: 'medium',
        eraserWidth: 'medium',
        strokeWidthControlEnabled: true,
        coloringBookEnabled: true,
        aiEnabled: false,
        undoButtonEnabled: true,
        toolDrawerEnabled: true,
        screenshotEnabled: true,
      },
      owner: { settings: { setWidth } },
    },
    product: { ai: { owner: null } },
    disabled: false,
    ink: '#AB71E1',
    area: { width: 390, height: 769 },
    viewport: { width: 390, height: 844 },
    open: true,
    chosenOpen: true,
    buttonScale: 100,
    onToggle() {},
    onButtonSize() {},
    onScaleCeiling() {},
    slot,
  });
}

const button = (label) => document.querySelector(`button[aria-label="${label}"]`);
const menu = (label) => document.querySelector(`[aria-label="${label}"]`);

async function press(label) {
  await act(async () => button(label).click());
}

async function escape() {
  await act(async () =>
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  );
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  setBrush.mockReset();
  setWidth.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Panel)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe('flyout keyboard lifecycle on the web', () => {
  it('closes the Brush Menu on Escape and hands focus back to its button', async () => {
    await press('Brushes');
    button('Pen').focus();
    await escape();
    expect(menu('Brush Menu')).toBeNull();
    expect(document.activeElement).toBe(button('Brushes'));
    expect(setBrush).not.toHaveBeenCalled();
  });

  it('returns focus to the Brushes button when the keyboard picks a brush', async () => {
    await press('Brushes');
    expect(button('Pen').getAttribute('role')).toBe('button');
    expect(button('Pen').getAttribute('aria-pressed')).toBe('true');
    expect(button('Crayon').getAttribute('aria-pressed')).toBe('false');
    expect(button('Crayon').hasAttribute('aria-checked')).toBe(false);
    button('Crayon').focus();
    await act(async () => document.activeElement.click());
    expect(setBrush).toHaveBeenCalledExactlyOnceWith('crayon');
    expect(menu('Brush Menu')).toBeNull();
    expect(document.activeElement).toBe(button('Brushes'));
  });

  it('does the same for the Stroke Width Menu', async () => {
    await press('Stroke width');
    expect(button('Size 3').getAttribute('role')).toBe('button');
    expect(button('Size 3').getAttribute('aria-pressed')).toBe('true');
    expect(button('Size 2').getAttribute('aria-pressed')).toBe('false');
    button('Size 2').focus();
    await act(async () => document.activeElement.click());
    expect(setWidth).toHaveBeenCalledExactlyOnceWith('drawing', 'thin');
    expect(document.activeElement).toBe(button('Stroke width'));
    await press('Stroke width');
    button('Size 4').focus();
    await escape();
    expect(menu('Stroke Width Menu')).toBeNull();
    expect(document.activeElement).toBe(button('Stroke width'));
  });

  it('closes on Escape with focus elsewhere and leaves that focus alone', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    await press('Brushes');
    elsewhere.focus();
    await escape();
    expect(menu('Brush Menu')).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });
});
