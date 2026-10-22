// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../assets/paper/handmade-paper.webp', () => ({
  default: '/paper.webp',
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('../../../src/drawing/DrawingAppearance.tsx', () => ({
  useDrawingAppearance: () => 'light',
}));
vi.mock('../../../src/rsdDrawing/RsdIconButton.tsx', () => ({
  CORNER_BUTTON_SIZE_PX: 48,
}));

const { RsdGlassPanes } = await import('../../../src/rsdDrawing/RsdBareGlass.web.tsx');

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
  const space = { width: 1180, height: 820, insetBottom: 0, paperTop: 0, paperLeft: 0 };
  await render(panes(space, 'row', { fullscreen: true }));
  expect(fullscreenGlass()).not.toBeNull();
  await render(panes(space, 'row', { fullscreen: true, expanded: true }));
  expect(fullscreenGlass()).not.toBeNull();
  // Negative control: no toggle, no glass behind it.
  await render(panes(space, 'row', { fullscreen: false, expanded: true }));
  expect(fullscreenGlass()).toBeNull();
});

it('keeps the fullscreen corner in the compact pane as the drawer rerenders in fullscreen', async () => {
  const space = { width: 740, height: 360, insetBottom: 0, paperTop: 0, paperLeft: 0 };
  await render(panes(space, 'phoneLandscape', { fullscreen: false, expanded: true }));
  const without = rects()[0];
  await render(panes(space, 'phoneLandscape', { fullscreen: true, expanded: true }));
  expect(rects()[0]).toBe(without + 1);
  expect(fullscreenGlass()).toBeNull();
});

// The panes hold shipping's viewport coordinates, while they mount in the paper area the palette
// bar leaves: their layer reaches back over the bar to the layout's corner.
it('lays the panes out from the layout corner, past the palette bar', async () => {
  const space = { width: 402, height: 874, insetBottom: 0, paperTop: 75, paperLeft: 0 };
  await render(panes(space, 'column', { expanded: true }));
  const layer = host.querySelector('[data-testid="rsd-glass-pane"]').parentElement;
  expect([layer.style.top, layer.style.left, layer.style.width, layer.style.height]).toEqual([
    '-75px',
    '0px',
    '402px',
    '874px',
  ]);
  // Negative control: a paper area at the layout's corner needs no reach.
  await render(panes({ ...space, paperTop: 0 }, 'column', { expanded: true }));
  expect(host.querySelector('[data-testid="rsd-glass-pane"]').parentElement.style.top).toBe('0px');
});
