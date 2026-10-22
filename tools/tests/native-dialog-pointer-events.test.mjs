// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ModalStage } from '../../src/rsdDrawing/ModalShell.tsx';
import { RsdScrollCue } from '../../src/rsdDrawing/RsdScrollCue.tsx';

// React Strict DOM's web build compiles its styles into cascade layers (its PostCSS plugin's
// useCSSLayers), so any unlayered rule outranks them. happy-dom drops @layer blocks, so the
// stand-in compiles only `pointerEvents: 'none'`, into a class whose rule sits ahead of React
// Native Web's unlayered sheet: the rank a layer gives it against React Native Web's own rules.
const RSD_NO_POINTER = vi.hoisted(() => 'rsd-pointer-events-none');
vi.mock('react-strict-dom', async () => {
  const { createElement: h } = await import('react');
  const flat = (style) =>
    Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : style || {};
  const element =
    (tag) =>
    ({ style, ...props }) =>
      h(tag, {
        ...props,
        className: flat(style).pointerEvents === 'none' ? RSD_NO_POINTER : undefined,
      });
  return {
    html: new Proxy({}, { get: (_, tag) => element(tag) }),
    css: { create: (styles) => styles, defineVars: (values) => values, createTheme: () => null },
  };
});
vi.mock('react-native', () => import('react-native-web'));
vi.mock(
  '../../src/platform/KeyboardScope.tsx',
  () => import('../../src/platform/KeyboardScope.web.tsx')
);
vi.mock('../../src/platform/flyoutFocus.ts', () => import('../../src/platform/flyoutFocus.web.ts'));
// The web build resolves ModalScrim to its web file; Vitest resolves the native one.
vi.mock(
  '../../src/rsdDrawing/ModalScrim.tsx',
  () => import('../../src/rsdDrawing/ModalScrim.web.tsx')
);
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

let root;
let host;
let rsdSheet;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  rsdSheet?.remove();
  document.body.replaceChildren();
});

function rankBelowReactNativeWeb() {
  const reactNativeWeb = document.getElementById('react-native-stylesheet');
  expect(reactNativeWeb).not.toBeNull();
  rsdSheet = document.createElement('style');
  rsdSheet.textContent = `.${RSD_NO_POINTER} { pointer-events: none; }`;
  reactNativeWeb.before(rsdSheet);
}

// happy-dom resolves the cascade but not inheritance, and pointer-events inherits: an element
// with no value of its own takes its nearest ancestor's, as a browser computes it.
function pointerEvents(node) {
  for (let at = node; at; at = at.parentElement) {
    const value = getComputedStyle(at).pointerEvents;
    if (value) return value;
  }
  return 'auto';
}

async function openDialog(body) {
  const onClose = vi.fn();
  await act(async () =>
    root.render(createElement(ModalStage, { visible: true, label: 'Probe', onClose }, body))
  );
  rankBelowReactNativeWeb();
  return onClose;
}

const lastRow = () => document.querySelector('[role="dialog"] button[aria-label="Last row"]');

it("lets a tap through a React Strict DOM pointerEvents 'none' overlay inside the dialog", async () => {
  await openDialog(
    createElement(
      RsdScrollCue,
      null,
      createElement('button', { type: 'button', 'aria-label': 'Last row' }, 'Last row')
    )
  );
  const fade = document.querySelector('[role="dialog"] [data-testid="scroll-cue"]');
  expect(fade.className).toBe(RSD_NO_POINTER);
  expect(fade.getAttribute('aria-hidden')).toBe('true');
  expect(fade.parentElement.contains(lastRow())).toBe(true);
  expect(pointerEvents(fade)).toBe('none');
  expect(pointerEvents(lastRow())).toBe('auto');
});

it('keeps the stage box-none: the card takes presses and the space around it reaches the backdrop', async () => {
  const onClose = await openDialog(
    createElement('button', { type: 'button', 'aria-label': 'Last row' }, 'Last row')
  );
  const card = document.querySelector('[data-testid="modal-card"]');
  const backdrop = document.querySelector('[data-testid="modal-backdrop"]');
  expect(pointerEvents(card.parentElement)).toBe('none');
  expect(pointerEvents(card)).toBe('auto');
  expect(pointerEvents(lastRow())).toBe('auto');
  expect(pointerEvents(backdrop)).toBe('auto');
  expect(onClose).not.toHaveBeenCalled();
});
