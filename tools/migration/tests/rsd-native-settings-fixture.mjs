import { sectionVisits } from './rsd-native-settings-hub-mocks.mjs';
import { caller, records, root, host } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../src/drawing/model.ts';
import { WHATS_NEW_STAMP } from '../../../src/settings/whatsNewStamp.ts';

// The stored settings, drawing screen and Settings queries the RSD Settings suites share.
const CURRENT_SETTINGS = {
  version: 15,
  soundEnabled: false,
  strokeWidth: 'medium',
  eraserWidth: 'medium',
  selectedColor: 'Purple',
  customColors: [],
  appearance: 'light',
  aiEnabled: false,
  parentPolicies: {
    ai: 'always',
    imageReport: 'always',
    externalLinks: 'always',
    feedback: 'always',
    parentCenter: 'always',
  },
  coloringBookEnabled: true,
  soundVolume: 50,
  drawingSoundEnabled: true,
  deleteSoundEnabled: true,
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
  buttonScale: 100,
  reduceMotion: 'system',
  whatsNewSeen: WHATS_NEW_STAMP,
  pencilEraserEnabled: true,
  applePencilSeen: false,
  toolbarStyle: 'buttons',
  toolDrawerEnabled: true,
  screenshotEnabled: true,
  aiCustomizationEnabled: true,
  autoSaveAiEnabled: false,
};

export function storedSettings(overrides = {}) {
  if (Object.hasOwn(overrides, 'whatsNewSeen')) {
    const stamps = JSON.parse(sectionVisits.snapshot);
    stamps.whatsnew = overrides.whatsNewSeen;
    sectionVisits.snapshot = JSON.stringify(stamps);
  }
  let stored = JSON.stringify({ ...CURRENT_SETTINGS, ...overrides });
  caller.settingsStorage = {
    read: async () => stored,
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  return { storage: caller.settingsStorage, stored: () => JSON.parse(stored) };
}

export function drawingScreen(overrides = {}) {
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'pen',
    brushControl: { kind: 'menu', brushes: ['pen', 'crayon'] },
    availableBrushes: ['pen', 'crayon'],
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: true,
    colorPickerOpen: false,
    closeSettings: vi.fn(),
    closeColorPicker: vi.fn(),
    openColorPicker: vi.fn(),
    selectInkBrush: vi.fn(),
    notePaintChoice: vi.fn(),
    ...overrides,
  };
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
}

export async function rerender(overrides) {
  Object.assign(caller.screen, overrides);
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}

export function button(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

export async function click(label) {
  const node = button(label);
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}

export function hubRows() {
  return [...host.querySelectorAll('[role="list"] [role="listitem"] button')].filter(
    (node) => node.getAttribute('role') !== 'switch'
  );
}

export function hubSwitches() {
  return [...host.querySelectorAll('[role="list"] [role="switch"]')];
}

export function hubRow(title) {
  const row = hubRows().find((node) => node.getAttribute('aria-label').startsWith(`${title}, `));
  expect(row, title).toBeDefined();
  return row;
}

// A row whose section changed since it was last opened adds "new" to its name, beside its dot.
export const dottedRows = () =>
  hubRows()
    .map((row) => row.getAttribute('aria-label'))
    .filter((name) => name.endsWith(', new'));

export function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

export function outerSize(label) {
  const style = flat(records.props.findLast((props) => props.accessibilityLabel === label).style);
  expect(style.boxSizing, label).toBe('border-box');
  expect(style.width, label).toBe(style.height);
  return style.width;
}
