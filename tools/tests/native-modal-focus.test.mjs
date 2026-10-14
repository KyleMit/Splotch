// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ModalShell } from '../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx';
import { DialogHeader } from '../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx';

// React Native Web's own Modal, focus trap, View and responder system decide where focus lands;
// only React Strict DOM is reduced to the plain elements its web build emits.
vi.mock('react-native', async () => import('react-native-web'));
// The web build resolves ModalScrim to its web file; Vitest resolves the native one.
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/ModalScrim.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/ModalScrim.web.tsx')
);
// The web build resolves RsdPressable to its web file; Vitest resolves the native one.
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdPressable.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdPressable.web.tsx')
);
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }) => createElement('svg', { 'aria-hidden': true }, children),
  Path: ({ d }) => createElement('path', { d }),
  SvgXml: () => null,
}));
vi.mock('react-strict-dom', () => ({
  html: Object.fromEntries(
    ['div', 'span', 'button', 'header', 'h1', 'h2', 'p'].map((tag) => [
      tag,
      ({ style: _style, 'data-testid': testId, ...props }) =>
        createElement(tag, { ...props, 'data-testid': testId }),
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

// happy-dom lets focus() land on any element; a browser only moves focus to a focusable area. React
// Native Web's focus trap walks the dialog calling focus() until one sticks, so the browser rule
// decides where it lands.
const NATIVELY_FOCUSABLE = 'button, input, select, textarea, a[href]';
const domFocus = HTMLElement.prototype.focus;
function focusLikeABrowser(options) {
  const focusable =
    this.hasAttribute('tabindex') || (this.matches(NATIVELY_FOCUSABLE) && !this.disabled);
  if (focusable) domFocus.call(this, options);
}

const TITLE = 'Settings';
let root;
let host;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.focus = focusLikeABrowser;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  HTMLElement.prototype.focus = domFocus;
});

function dialog(onBack) {
  return createElement(
    ModalShell,
    {
      visible: true,
      label: TITLE,
      size: 'settings',
      onClose() {},
      header: createElement(DialogHeader, {
        title: TITLE,
        titleSize: 'xl',
        onBack,
        onClose() {},
      }),
    },
    createElement('button', { type: 'button' }, 'Sound')
  );
}

async function open(onBack) {
  const opener = document.createElement('button');
  opener.textContent = 'Settings';
  document.body.append(opener);
  opener.focus();
  await act(async () => root.render(dialog(onBack)));
  return opener;
}

const tabStops = () =>
  [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] [tabindex]')]
    .filter((node) => node.getAttribute('tabindex') !== '-1' && !node.disabled)
    .map((node) => node.getAttribute('aria-label') ?? node.textContent);

it('lands initial focus on the header Close, as shipping showModal() does, never on the scrim', async () => {
  await open(undefined);
  expect(document.activeElement.getAttribute('aria-label')).toBe('Close');
  expect(tabStops()[0]).toBe('Close');
  const scrim = document.querySelector('[data-testid="modal-backdrop"]');
  expect(scrim.getAttribute('aria-hidden')).toBe('true');
  expect(scrim.hasAttribute('tabindex')).toBe(false);
});

it('lands initial focus on Back when the header has one, ahead of Close and the body', async () => {
  await open(() => {});
  expect(document.activeElement.getAttribute('aria-label')).toBe('Back');
  expect(tabStops()).toEqual(['Back', 'Close', 'Sound']);
});

it('returns focus to the opener when the dialog closes', async () => {
  const opener = await open(undefined);
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
});
