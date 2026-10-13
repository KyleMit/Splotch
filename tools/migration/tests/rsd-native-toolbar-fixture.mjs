import { createElement } from 'react';
import { expect, vi } from 'vitest';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';

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

export async function mountToolbar(screen) {
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

export function paintGroup() {
  return host.querySelector('[role="radiogroup"][aria-label="Paint colors"]');
}

export function paintLabels() {
  return [...paintGroup().querySelectorAll('[role="radio"]')].map((node) =>
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
