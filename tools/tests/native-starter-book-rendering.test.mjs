// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingAppearanceProvider } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RsdColoringBookPicker } from '../../experiments/native-architecture/src/rsdDrawing/RsdColoringBookPicker.tsx';
import { FARM_PAGE_IDS } from '../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import {
  COLORING_PAGES,
  SAMPLE_PAGE_IDS,
} from '../../experiments/native-architecture/src/drawing/pages.ts';
import {
  BUNDLED_FARM_COVERS,
  BUNDLED_FARM_IMAGES,
} from '../../experiments/native-architecture/src/drawing/bundledFarm/images.ts';

const appearance = vi.hoisted(() => ({ theme: 'light' }));
vi.mock('react-native', () => ({
  StyleSheet: { create: (styles) => styles },
  useColorScheme: () => appearance.theme,
  Image: ({ source }) => createElement('img', { src: source.uri, alt: '' }),
}));
vi.mock('react-strict-dom', () => ({
  html: Object.fromEntries(
    ['div', 'span', 'button'].map((tag) => [
      tag,
      ({ style: _style, ...props }) => createElement(tag, props),
    ])
  ),
  css: { create: (styles) => styles, defineVars: (values) => values, createTheme: () => ({}) },
}));
vi.mock('react-native-svg', () => ({ SvgXml: () => null }));
vi.mock('../../experiments/native-architecture/src/rsdDrawing/NativeDialog.tsx', () => ({
  NativeDialog: ({ label, children, footer, onClose }) =>
    createElement(
      'section',
      { role: 'dialog', 'aria-label': label },
      children,
      footer,
      createElement('button', { 'aria-label': 'Request close', onClick: onClose }, 'Close')
    ),
}));
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  appearance.theme = 'light';
});
afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  document.body.replaceChildren();
});
async function mountPicker(selected = 'farm/dog') {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const onChoose = vi.fn();
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      createElement(
        DrawingAppearanceProvider,
        { preference: 'system' },
        createElement(RsdColoringBookPicker, { selected, onChoose, onClose })
      )
    )
  );
  return { host, onChoose, onClose };
}
function button(label) {
  return document.querySelector(`[aria-label="${label}"]`);
}

describe('bundled book navigation through real picker state', () => {
  it.each(['light', 'dark'])(
    'opens the %s cover before its six real page thumbnails and selects exact page IDs',
    async (theme) => {
      appearance.theme = theme;
      const mounted = await mountPicker();
      expect(button('Coloring books')).not.toBeNull();
      expect(button('Farm coloring book').textContent).toBe('Farm');
      expect(button('Farm coloring book').querySelector('img').getAttribute('src')).toBe(
        BUNDLED_FARM_COVERS[theme]
      );
      expect(document.querySelectorAll('[role="radio"]')).toHaveLength(0);
      await act(async () => button('Farm coloring book').click());
      expect(button('Farm coloring pages')).not.toBeNull();
      expect(mounted.onChoose).not.toHaveBeenCalled();
      expect(mounted.onClose).not.toHaveBeenCalled();
      expect(
        [...document.querySelectorAll('[role="radio"]')].map((node) => node.textContent)
      ).toEqual(['Cat', 'Cow', 'Dog', 'Duck', 'Horse', 'Pig']);
      expect(button('Dog').getAttribute('aria-checked')).toBe('true');
      for (const pageId of FARM_PAGE_IDS) {
        const page = button(COLORING_PAGES[pageId].label);
        expect(page.querySelector('img').getAttribute('src')).toBe(
          BUNDLED_FARM_IMAGES[pageId].selector[theme]
        );
        await act(async () => page.click());
        expect(mounted.onChoose).toHaveBeenLastCalledWith(pageId);
      }
      expect(mounted.onChoose).toHaveBeenCalledTimes(FARM_PAGE_IDS.length);
    }
  );

  it('returns from pages without choosing and keeps all sample pages reachable', async () => {
    const mounted = await mountPicker();
    await act(async () => button('Farm coloring book').click());
    await act(async () => button('Back to coloring books').click());
    expect(button('Coloring books')).not.toBeNull();
    expect(mounted.onChoose).not.toHaveBeenCalled();
    await act(async () => button('More pages').click());
    expect(button('Sample coloring pages')).not.toBeNull();
    expect(
      [...document.querySelectorAll('[role="radio"]')].map((node) => node.textContent)
    ).toEqual(SAMPLE_PAGE_IDS.map((id) => COLORING_PAGES[id].label));
    for (const pageId of SAMPLE_PAGE_IDS) {
      await act(async () => button(COLORING_PAGES[pageId].label).click());
      expect(mounted.onChoose).toHaveBeenLastCalledWith(pageId);
    }
    await act(async () => button('Request close').click());
    expect(button('Coloring books')).not.toBeNull();
    expect(mounted.onClose).not.toHaveBeenCalled();
    await act(async () => button('Keep drawing').click());
    expect(mounted.onClose).toHaveBeenCalledOnce();
  });
});
