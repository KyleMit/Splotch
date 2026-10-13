// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NATIVE_ICONS } from '../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import { NATIVE_DEFERRED_ICONS } from '../../experiments/native-architecture/src/rsdDrawing/icons.deferred.generated.ts';
import { NATIVE_SPLOTCHY } from '../../experiments/native-architecture/src/rsdDrawing/splotchy.generated.ts';
import { DRAWING_THEMES } from '../../experiments/native-architecture/src/drawing/theme.ts';

vi.mock('react-native', () => ({ StatusBar: () => null, useColorScheme: () => 'light' }));
vi.mock('react-native-svg', () => ({
  SvgXml: ({ xml, width, height }) => createElement('svg', { 'data-xml': xml, width, height }),
}));

const SIZE_PX = 38;
let container, root, components;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // A fresh registry per test, so each one sees its chunks unloaded.
  vi.resetModules();
  const { RsdSectionIcon } =
    await import('../../experiments/native-architecture/src/rsdDrawing/RsdSectionIcon.tsx');
  const { EMPTY_ICON_MARKUP } =
    await import('../../experiments/native-architecture/src/rsdDrawing/RsdIcon.tsx');
  const { DrawingAppearanceProvider } =
    await import('../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx');
  components = { RsdSectionIcon, EMPTY_ICON_MARKUP, DrawingAppearanceProvider };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const markups = () =>
  [...container.querySelectorAll('svg[data-xml]')].map((svg) => svg.dataset.xml);
const markup = () => markups()[0];

// A synchronous act commits the render and its effects without awaiting a chunk's import.
function render(icons, { theme = 'light', ink } = {}) {
  const { DrawingAppearanceProvider, RsdSectionIcon } = components;
  act(() =>
    root.render(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        [icons]
          .flat()
          .map((icon) => createElement(RsdSectionIcon, { key: icon, icon, size: SIZE_PX, ink }))
      )
    )
  );
}

async function loaded(expected) {
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(markup()).toBe(expected);
  });
}

it('paints a startup icon on the first render, re-inked for the theme', async () => {
  render('controls', { theme: 'dark' });
  expect(markup()).toBe(NATIVE_ICONS.controls.dark);
  render('settings', { theme: 'dark' });
  expect(markup()).toBe(
    NATIVE_ICONS.settings.dark.replaceAll('currentColor', DRAWING_THEMES.dark.iconInk)
  );
  const box = container.querySelector('svg');
  expect([box.getAttribute('width'), box.getAttribute('height')]).toEqual(['38', '38']);
});

it('holds a deferred icon box empty until its chunk loads, then paints the caller ink', async () => {
  const ink = '#7c50bb';
  render('accessibility', { ink });
  expect(markup()).toBe(components.EMPTY_ICON_MARKUP);
  await loaded(NATIVE_DEFERRED_ICONS.accessibility.light.replaceAll('currentColor', ink));
});

it('keeps a themed spot icon in its own palette for each theme', async () => {
  render('appearance', { theme: 'dark', ink: '#7c50bb' });
  await loaded(NATIVE_DEFERRED_ICONS.appearance.dark);
  render('appearance', { theme: 'light', ink: '#7c50bb' });
  expect(markup()).toBe(NATIVE_DEFERRED_ICONS.appearance.light);
});

it('paints an icon whose chunk failed once a later icon loads it', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  let attempts = 0;
  vi.doMock(
    '../../experiments/native-architecture/src/rsdDrawing/icons.deferred.generated.ts',
    async (importOriginal) => {
      attempts += 1;
      if (attempts === 1) throw new Error('Chunk offline');
      return importOriginal();
    }
  );
  render('accessibility');
  await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
  await act(async () => {});
  expect(markup()).toBe(components.EMPTY_ICON_MARKUP);
  render(['accessibility', 'close']);
  const ink = DRAWING_THEMES.light.iconInk;
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(markups()).toEqual(
      ['accessibility', 'close'].map((name) =>
        NATIVE_DEFERRED_ICONS[name].light.replaceAll('currentColor', ink)
      )
    );
  });
  expect(attempts).toBe(2);
  error.mockRestore();
});

it('routes splotchy to the mascot artwork in both themes', async () => {
  render('splotchy', { theme: 'dark', ink: '#7c50bb' });
  expect(markup()).toBe(components.EMPTY_ICON_MARKUP);
  await loaded(NATIVE_SPLOTCHY);
});
