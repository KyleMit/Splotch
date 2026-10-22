import { act, createElement } from 'react';
import { expect, vi } from 'vitest';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../src/drawing/model.ts';
import { actionPanelLayout } from '../../../src/rsdDrawing/edgeLayout.ts';
import { BRUSH_MENU_OPTIONS } from '../../../src/rsdDrawing/brushMenuOptions.ts';
import { NATIVE_DEFERRED_ICONS } from '../../../src/rsdDrawing/icons.deferred.generated.ts';

// The edge-control screen the toolbar and Button Size suites mount.
export function toolbarScreen(overrides = {}) {
  return {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'crayon',
    brushControl: { kind: 'menu', brushes: ['pen', 'crayon'] },
    availableBrushes: ['pen', 'crayon'],
    history: { undo: [emptyDrawing()], drawing: emptyDrawing() },
    inkVisible: true,
    recovery: { failed: false },
    pictures: null,
    dialogOpen: false,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    undo: vi.fn(),
    undoFromButton: vi.fn(),
    undoTile: { current: null },
    undoFeedback: null,
    unavailableFeedback: null,
    clear: vi.fn(async () => {}),
    departingInk: vi.fn(() => null),
    save: vi.fn(async () => {}),
    setPagePickerOpen: vi.fn(),
    openSettings: vi.fn(),
    openColorPicker: vi.fn(),
    toggleBrush: vi.fn(),
    selectInkBrush: vi.fn(),
    notePaintChoice: vi.fn(),
    ...overrides,
  };
}

// The AI Image Button's name once the free allowance has answered with every picture left.
export const AI_BUTTON = 'Create AI image, 10 free left';

export async function mountToolbar(screen, settings = {}) {
  caller.aiSend.mockImplementation(async (request) =>
    request.path === '/api/free-generation-grant'
      ? new Response('{"ok":true,"remaining":10,"limit":10}')
      : new Response('{"ok":false}', { status: 500 })
  );
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
      ...settings,
    },
  };
  await mount(createElement(RsdDrawingScreen));
  await act(() => vi.waitFor(() => expect(caller.product.ai.state?.availability).toBe('ready')));
}

export function paintGroup() {
  return host.querySelector('[data-testid="rsd-palette-paints"]');
}

export function paintLabels() {
  return [...paintGroup().querySelectorAll('button')].map((node) =>
    node.getAttribute('aria-label')
  );
}

export function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

export function resolved(predicate) {
  const props = records.props.findLast(predicate);
  expect(props).toBeDefined();
  return flat(props.style);
}

export function outerSize(style) {
  expect(style.width).toBe(style.height);
  return style.boxSizing === 'border-box'
    ? style.width
    : style.width + 2 * (style.borderWidth ?? 0) + 2 * (style.padding ?? 0);
}

// The drawer's tile size for the panel the screen lays out at the recorded window.
export function drawerTileSize(scale) {
  return actionPanelLayout({
    area: records.dimensions,
    viewport: records.dimensions,
    scale: scale / 100,
    count: host.querySelectorAll('[data-testid="rsd-drawer-tool"]').length,
    leg: 2,
    open: true,
  }).size;
}

// The Brushes button wears the held brush's face; its label stays "Brushes", as shipping's does.
export function heldBrushLabel() {
  const xml = host.querySelector('[aria-label="Brushes"] svg[data-xml]')?.dataset.xml;
  const path = (markup) => markup.match(/\bd="([^"]+)"/)?.[1];
  const held = Object.values(BRUSH_MENU_OPTIONS).find(
    ({ icon }) => xml && xml.includes(path(NATIVE_DEFERRED_ICONS[icon].light))
  );
  return held && `Brush: ${held.label}`;
}
