import { caller, root, host, mount } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import { swatchEdge } from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  PALETTE_COLORS,
  paletteHex,
} from '../../../experiments/native-architecture/src/drawing/palette.ts';
import { DRAWING_THEME } from '../../../experiments/native-architecture/src/drawing/theme.ts';

const PURPLE = paletteHex('Purple');

function toolbarScreen(overrides = {}) {
  return {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'crayon',
    brushControl: { kind: 'menu', brushes: ['pen', 'crayon'] },
    availableBrushes: ['pen', 'crayon'],
    history: { undo: [emptyDrawing()], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    undo: vi.fn(),
    clear: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    setPagePickerOpen: vi.fn(),
    openSettings: vi.fn(),
    openColorPicker: vi.fn(),
    toggleBrush: vi.fn(),
    selectInkBrush: vi.fn(),
    ...overrides,
  };
}

async function mountToolbar(screen) {
  caller.screen = screen;
  caller.menu = { open: false, visible: false, show: vi.fn() };
  caller.sound = {
    settings: {
      status: 'ready',
      soundEnabled: false,
      appearance: 'light',
      selectedColor: 'Purple',
      customColors: [],
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      aiEnabled: true,
    },
  };
  await mount(createElement(RsdDrawingScreen));
}

function button(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

function iconMarkup(node) {
  const icon = node.querySelector('svg[data-xml]');
  expect(icon, node.getAttribute('aria-label')).not.toBeNull();
  return icon.dataset.xml;
}

it('renders every toolbar action as a named icon button that calls its owner', async () => {
  await mountToolbar(toolbarScreen());
  const openParentCenter = vi.spyOn(caller.product.owner, 'openParentCenter');
  const openAi = vi.spyOn(caller.product.ai.owner, 'open').mockImplementation(() => {});
  const actions = [
    ['Brush: Crayon', 'brush-crayon', () => caller.menu.show],
    ['Coloring pages', 'shapes', () => caller.screen.setPagePickerOpen],
    ['Save picture', 'camera', () => caller.screen.save],
    ['AI picture', 'wand-stars', () => openAi],
    ['Undo', 'undo', () => caller.screen.undo],
    ['Clear', 'trash-closed', () => caller.screen.clear],
    ['Drawing tools', 'controls', () => caller.menu.show],
    ['Settings', 'settings', () => caller.screen.openSettings],
    ['Parent Center', 'parent-center', () => openParentCenter],
  ];
  for (const [label, icon, handler] of actions) {
    const node = button(label);
    expect(node.textContent, label).toBe('');
    const ink = icon === 'brush-crayon' ? PURPLE : DRAWING_THEME.iconInk;
    expect(iconMarkup(node), label).toBe(NATIVE_ICONS[icon].light.replaceAll('currentColor', ink));
    const before = handler().mock.calls.length;
    await act(async () => node.click());
    expect(handler().mock.calls.length, label).toBe(before + 1);
  }
  expect(caller.screen.setPagePickerOpen).toHaveBeenCalledWith(true);
  expect(NATIVE_ICONS['brush-crayon'].light).toContain('currentColor');
  expect(NATIVE_ICONS.settings.light).toContain('currentColor');
});

it('keeps the toolbar disabled boundary and the lone optional brush switch', async () => {
  await mountToolbar(
    toolbarScreen({
      disabled: true,
      brush: 'pen',
      brushControl: { kind: 'toggle', brush: 'eraser' },
    })
  );
  const eraser = button('Eraser');
  expect(eraser.getAttribute('role')).toBe('switch');
  expect(eraser.dataset.checked).toBe('false');
  expect(iconMarkup(eraser)).toBe(NATIVE_ICONS['brush-eraser'].light);
  for (const label of ['Eraser', 'Clear', 'Save picture', 'Settings', 'Undo', 'Drawing tools']) {
    const node = button(label);
    expect(node.disabled, label).toBe(true);
    await act(async () => node.click());
  }
  expect(caller.screen.toggleBrush).not.toHaveBeenCalled();
  expect(caller.screen.clear).not.toHaveBeenCalled();
  expect(caller.screen.save).not.toHaveBeenCalled();
  expect(caller.screen.openSettings).not.toHaveBeenCalled();
  expect(caller.screen.undo).not.toHaveBeenCalled();
  expect(caller.menu.show).not.toHaveBeenCalled();
  caller.screen.disabled = false;
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  await act(async () => button('Eraser').click());
  expect(caller.screen.toggleBrush).toHaveBeenCalledOnce();
});

it('selects paint through text-free round swatches and keeps More colors outside the group', async () => {
  await mountToolbar(toolbarScreen());
  const group = host.querySelector('[role="radiogroup"][aria-label="Paint colors"]');
  const swatches = [...group.querySelectorAll('[role="radio"]')];
  expect(swatches.map((node) => node.getAttribute('aria-label'))).toEqual(
    PALETTE_COLORS.map(({ label }) => `${label} paint`)
  );
  expect(swatches.every((node) => node.textContent === '')).toBe(true);
  const checked = () =>
    swatches
      .filter((node) => node.dataset.checked === 'true')
      .map((node) => node.getAttribute('aria-label'));
  expect(checked()).toEqual(['Purple paint']);
  const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
  await act(async () => button('Blue paint').click());
  expect(caller.screen.selectInkBrush).toHaveBeenCalledOnce();
  expect(setColor).toHaveBeenCalledExactlyOnceWith('Blue');
  expect(checked()).toEqual(['Blue paint']);
  const more = button('More colors');
  expect(more.closest('[role="radiogroup"]')).toBeNull();
  expect(iconMarkup(more)).toBe(NATIVE_ICONS['more-colors'].light);
  await act(async () => more.click());
  expect(caller.screen.openColorPicker).toHaveBeenCalledOnce();
});

it('outlines a swatch whose paint blends into the bar and rings it in text color', () => {
  expect(swatchEdge('#FFFFFF', 'light')).toEqual({ ring: '#474747', outline: '#474747' });
  expect(swatchEdge('#23232B', 'dark')).toEqual({ ring: '#d3d1dc', outline: '#d3d1dc' });
  expect(swatchEdge('#AB71E1', 'light')).toEqual({ ring: '#AB71E1', outline: null });
});
