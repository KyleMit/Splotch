// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColoringPagePicker } from '../../experiments/native-architecture/src/ColoringPagePicker.tsx';
import { DrawingAppearanceProvider } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { LibraryProvider } from '../../experiments/native-architecture/src/offlineLibrary/LibraryScope.tsx';
import { catalogPack } from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { offlinePageId } from '../../experiments/native-architecture/src/offlineLibrary/identity.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';
const appearance = vi.hoisted(() => ({ theme: 'light' }));
vi.mock('react-native', async () => ({
  ...(await import('react-native-web')),
  StyleSheet: { create: (styles) => styles },
  useColorScheme: () => appearance.theme,
  Image: ({ source }) => createElement('img', { src: source.uri, alt: '' }),
  Modal: ({ children }) => createElement('section', {}, children),
  View: ({ children }) => createElement('div', {}, children),
  ScrollView: ({ children }) => createElement('div', {}, children),
  Text: ({ children }) => createElement('span', {}, children),
  Pressable: ({
    children,
    onPress,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    disabled,
  }) =>
    createElement(
      'button',
      {
        onClick: onPress,
        role: accessibilityRole,
        'aria-label': accessibilityLabel,
        'aria-checked': accessibilityState?.checked,
        disabled,
      },
      children
    ),
}));
vi.mock(
  'react-native-svg/lib/module/elements',
  () => import('react-native-svg/lib/module/elements.web.js')
);
vi.mock('react-native-svg', async () => {
  const elements = await import('react-native-svg/lib/module/elements.web.js');
  return {
    ...elements,
    default: elements.Svg,
    SvgXml: (await import('react-native-svg/lib/module/xml.js')).SvgXml,
  };
});
vi.mock('react-strict-dom', () => ({
  html: Object.fromEntries(
    ['div', 'span', 'button'].map((tag) => [
      tag,
      ({ style: _style, ...props }) => createElement(tag, props),
    ])
  ),
  css: { create: (styles) => styles, defineVars: (values) => values, createTheme: () => ({}) },
}));
vi.mock('../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx', () => ({
  ModalShell: ({ label, header, children }) =>
    createElement('section', { 'aria-label': label }, header, children),
}));
vi.mock('../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx', () => ({
  DialogHeader: ({ title, onBack, onClose }) =>
    createElement(
      'header',
      {},
      onBack ? createElement('button', { 'aria-label': 'Back', onClick: onBack }) : null,
      createElement('h2', {}, title),
      createElement('button', { 'aria-label': 'Close', onClick: onClose })
    ),
}));
const pack = catalogPack('dinosaur', 'full');
const owner = createOfflineLibrary({ uri: (path) => `file:///private/library/${path}` }, 'full');
let root;
let host;
let state;
let remove;
let choose;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  appearance.theme = 'light';
  state = {
    ...owner.snapshot(),
    status: 'ready',
    installed: [pack],
    inventoried: true,
    retainedBytes: 1024 * 1024,
  };
  remove = vi.fn(async () => {});
  choose = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});
const button = (label) =>
  [...host.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
  );
async function renderPicker(Component, preference = 'system') {
  await act(() =>
    root.render(
      createElement(
        LibraryProvider,
        { owner, state, remove },
        createElement(
          DrawingAppearanceProvider,
          { preference },
          createElement(Component, {
            selected: offlinePageId(pack, 'trex'),
            visible: true,
            onDismiss() {},
            onChoose: choose,
            onClose() {},
          })
        )
      )
    )
  );
}
// The legacy picker lists every downloaded page; the RSD picker's coverage, which lists each
// downloaded book, is tools/migration/tests/rsd-native-coloring-picker.test.mjs.
describe('downloaded books in the legacy picker', () => {
  it('lists what the first completed inventory finds after it opened, then holds it', async () => {
    state = { ...owner.snapshot(), status: 'loading', installed: [] };
    await renderPicker(ColoringPagePicker);
    expect(button('T. Rex')).toBeUndefined();
    state = { ...state, status: 'ready', installed: [pack], inventoried: true };
    await renderPicker(ColoringPagePicker);
    expect(button('T. Rex')).toBeDefined();
    state = { ...state, installed: [pack, catalogPack('space', 'full')] };
    await renderPicker(ColoringPagePicker);
    expect(button('Astronaut')).toBeUndefined();
  });
  it('holds nothing from a failed inventory or Retry’s interim ready, then lists the recovered one', async () => {
    state = { ...owner.snapshot(), status: 'loading', installed: [] };
    await renderPicker(ColoringPagePicker);
    state = { ...state, status: 'failed', fault: 'unavailable' };
    await renderPicker(ColoringPagePicker);
    state = { ...state, status: 'ready', fault: null };
    await renderPicker(ColoringPagePicker);
    expect(button('T. Rex')).toBeUndefined();
    state = { ...state, installed: [pack], inventoried: true };
    await renderPicker(ColoringPagePicker);
    expect(button('T. Rex')).toBeDefined();
  });
  it('offers no download controls in the kid-facing picker', async () => {
    await renderPicker(ColoringPagePicker);
    expect(host.textContent).not.toMatch(/download|Retry|Remove/i);
  });
});

it.each([
  ['light', 'dark'],
  ['dark', 'light'],
])(
  'uses explicit picker appearance %s against OS %s for private artwork',
  async (preference, system) => {
    appearance.theme = system;
    await renderPicker(ColoringPagePicker, preference);
    const image = button('T. Rex').querySelector('img').getAttribute('src');
    expect(image).toBe(owner.selector(pack, 'trex', 'landscape', preference === 'dark'));
    expect(image).not.toBe(owner.selector(pack, 'trex', 'landscape', system === 'dark'));
  }
);
