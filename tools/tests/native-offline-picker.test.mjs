// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RsdColoringBookPicker } from '../../experiments/native-architecture/src/rsdDrawing/RsdColoringBookPicker.tsx';
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
  state = { ...owner.snapshot(), status: 'ready', installed: [pack], retainedBytes: 1024 * 1024 };
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
describe('complete downloaded books and parent controls in both real picker consumers', () => {
  it.each(['light', 'dark'])(
    'navigates the complete %s Dinosaurs book using private revision selector URIs',
    async (theme) => {
      appearance.theme = theme;
      await renderPicker(RsdColoringBookPicker);
      expect(button('Dinosaurs coloring book').querySelector('img').getAttribute('src')).toBe(
        owner.cover(pack, theme === 'dark')
      );
      expect(host.textContent).toContain('1 downloaded books');
      expect(host.textContent).toContain('1.0 MB kept for pictures');
      await act(() => button('Dinosaurs coloring book').click());
      expect([...host.querySelectorAll('[role="radio"]')].map((node) => node.textContent)).toEqual([
        'Brachiosaurus',
        'Pterodactyl',
        'Stegosaurus',
        'T. Rex',
        'Triceratops',
        'Velociraptor',
      ]);
      expect(button('T. Rex').getAttribute('aria-checked')).toBe('true');
      expect(button('T. Rex').querySelector('img').getAttribute('src')).toBe(
        owner.selector(pack, 'trex', theme === 'dark')
      );
      await act(() => button('T. Rex').click());
      expect(choose).toHaveBeenLastCalledWith(offlinePageId(pack, 'trex'));
    }
  );
  it('holds the current RSD grid steady while another pack finishes, then removes missing books', async () => {
    await renderPicker(RsdColoringBookPicker);
    state = { ...state, installed: [pack, catalogPack('space', 'full')] };
    await renderPicker(RsdColoringBookPicker);
    expect(button('Space coloring book')).toBeUndefined();
    state = { ...state, installed: [] };
    await renderPicker(RsdColoringBookPicker);
    expect(button('Dinosaurs coloring book')).toBeUndefined();
  });
  it.each([ColoringPagePicker, RsdColoringBookPicker])(
    'exposes automatic policy, mobile data, retry, cancel, storage and removal controls',
    async (Component) => {
      const setPolicy = vi.spyOn(owner, 'setPolicy').mockResolvedValue();
      const retry = vi.spyOn(owner, 'retry').mockImplementation(() => {});
      const cancel = vi.spyOn(owner, 'cancel').mockImplementation(() => {});
      await renderPicker(Component);
      await act(() => button('Pause automatic coloring downloads').click());
      expect(setPolicy).toHaveBeenLastCalledWith(false, false);
      await act(() => button('Allow mobile data for coloring downloads').click());
      expect(setPolicy).toHaveBeenLastCalledWith(true, true);
      await act(() => button('Retry coloring downloads').click());
      expect(retry).toHaveBeenCalledOnce();
      await act(() => button('Remove downloaded books').click());
      expect(remove).toHaveBeenCalledOnce();
      state = {
        ...state,
        status: 'downloading',
        completedBytes: 50,
        totalBytes: 100,
        message: 'Downloading Dinosaurs.',
      };
      await renderPicker(Component);
      expect(host.textContent).toContain('Downloading Dinosaurs. 50%.');
      await act(() => button('Cancel coloring download').click());
      expect(cancel).toHaveBeenCalledOnce();
      setPolicy.mockRestore();
      retry.mockRestore();
      cancel.mockRestore();
    }
  );
});

it.each([
  [ColoringPagePicker, 'light', 'dark'],
  [ColoringPagePicker, 'dark', 'light'],
  [RsdColoringBookPicker, 'light', 'dark'],
  [RsdColoringBookPicker, 'dark', 'light'],
])(
  'uses explicit %s picker appearance %s against OS %s for private artwork',
  async (Component, preference, system) => {
    appearance.theme = system;
    await renderPicker(Component, preference);
    if (Component === RsdColoringBookPicker)
      await act(() => button('Dinosaurs coloring book').click());
    const image = button('T. Rex').querySelector('img').getAttribute('src');
    expect(image).toBe(owner.selector(pack, 'trex', preference === 'dark'));
    expect(image).not.toBe(owner.selector(pack, 'trex', system === 'dark'));
  }
);
