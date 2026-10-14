// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ uri: '/paper.webp' }) } }));
vi.mock('../../../experiments/native-architecture/assets/paper/handmade-paper.webp', () => ({
  default: '/paper.webp',
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx', () => ({
  useDrawingAppearance: () => 'light',
}));
vi.mock('../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx', () => ({
  CORNER_BUTTON_SIZE_PX: 48,
}));

const { RsdGlassPanes } =
  await import('../../../experiments/native-architecture/src/rsdDrawing/RsdBareGlass.web.tsx');

let root;
let host;
let originalActEnvironment;
let originalMatchMedia;

const PANEL = { count: 6, size: 54, optionSize: 60, brushOptions: 4, stroke: true };

function panes(space, mode, glass) {
  return createElement(RsdGlassPanes, {
    space,
    glass: { open: null, expanded: false, panel: { ...PANEL, mode }, ...glass },
  });
}

async function render(element) {
  await act(async () => root.render(element));
}

const fullscreenGlass = () => host.querySelector('[data-testid="rsd-fullscreen-glass"]');
const rects = () =>
  [...host.querySelectorAll('[data-testid="rsd-glass-pane"]')].map(
    (pane) =>
      decodeURIComponent(pane.style.maskImage || pane.style.webkitMaskImage).match(/<rect /g)
        ?.length
  );

beforeEach(() => {
  originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  // The page is in fullscreen, where an Android tab no longer counts as offering it.
  window.matchMedia = (query) => ({
    matches: query.includes('display-mode: fullscreen'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.matchMedia = originalMatchMedia;
  globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

it('keeps the glass behind Exit fullscreen as the drawer rerenders in fullscreen', async () => {
  const space = { width: 1180, height: 820, insetBottom: 0 };
  await render(panes(space, 'row', { fullscreen: true }));
  expect(fullscreenGlass()).not.toBeNull();
  await render(panes(space, 'row', { fullscreen: true, expanded: true }));
  expect(fullscreenGlass()).not.toBeNull();
  // Negative control: no toggle, no glass behind it.
  await render(panes(space, 'row', { fullscreen: false, expanded: true }));
  expect(fullscreenGlass()).toBeNull();
});

it('keeps the fullscreen corner in the compact pane as the drawer rerenders in fullscreen', async () => {
  const space = { width: 740, height: 360, insetBottom: 0 };
  await render(panes(space, 'phoneLandscape', { fullscreen: false, expanded: true }));
  const without = rects()[0];
  await render(panes(space, 'phoneLandscape', { fullscreen: true, expanded: true }));
  expect(rects()[0]).toBe(without + 1);
  expect(fullscreenGlass()).toBeNull();
});
