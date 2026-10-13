import {
  caller,
  records,
  root,
  host,
  mount,
  checkedSwitch,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { TOUCH_TARGET } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SIZE_HELP,
  controlSize,
} from '../../../experiments/native-architecture/src/settings/buttonSize.ts';
import {
  REDUCE_MOTION_HELP,
  REDUCE_MOTION_LABEL,
} from '../../../experiments/native-architecture/src/settings/reduceMotion.ts';
import {
  NATIVE_SETTINGS_SECTIONS,
  SECTION_SUBTITLES,
} from '../../../experiments/native-architecture/src/settings/sections.ts';
import {
  RELEASE_NOTES,
  WHATS_NEW_STAMP,
} from '../../../experiments/native-architecture/src/settings/whatsNew.ts';

const WHATS_NEW = "What's New";
const CURRENT_SETTINGS = {
  version: 10,
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
    feedback: 'always',
    parentCenter: 'always',
  },
  coloringBookEnabled: true,
  soundLevel: 'medium',
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
  buttonScale: 100,
  reduceMotion: 'system',
  whatsNewSeen: WHATS_NEW_STAMP,
};

function storedSettings(overrides = {}) {
  let stored = JSON.stringify({ ...CURRENT_SETTINGS, ...overrides });
  caller.settingsStorage = {
    read: async () => stored,
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  return { storage: caller.settingsStorage, stored: () => JSON.parse(stored) };
}

function drawingScreen(overrides = {}) {
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
    ...overrides,
  };
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
}

async function rerender(overrides) {
  Object.assign(caller.screen, overrides);
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}

function button(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

async function click(label) {
  const node = button(label);
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}

function hubRows() {
  return [...host.querySelectorAll('[role="list"] [role="listitem"] button')];
}

function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

function outerSize(label) {
  const style = flat(records.props.findLast((props) => props.accessibilityLabel === label).style);
  expect(style.boxSizing, label).toBe('border-box');
  expect(style.width, label).toBe(style.height);
  return style.width;
}

function colorPickerAnimation() {
  return records.props.findLast((props) => props.accessibilityLabel === 'Color picker')
    .animationType;
}

it('lists the shipping sections that hold a native control, each with its status line', async () => {
  storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  const rows = hubRows();
  expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(
    NATIVE_SETTINGS_SECTIONS.filter(({ id }) => id !== 'setup').map(({ label }) => label)
  );
  const row = (label) => rows.find((node) => node.getAttribute('aria-label') === label);
  expect(row('Accessibility').textContent).toContain(SECTION_SUBTITLES.accessibility);
  expect(row(WHATS_NEW).textContent).toContain(SECTION_SUBTITLES.whatsnew);
  expect(row('Saving').textContent).toContain(SECTION_SUBTITLES.saveOnDeleteOff);
  expect(row('Tool Drawer').textContent).toContain(SECTION_SUBTITLES.allToolsShowing);
  expect(row('Sound').textContent).toContain(SECTION_SUBTITLES.muted);
  expect(row('About').textContent).toContain(`Version ${WHATS_NEW_STAMP}`);
  await openSettingsSection('Accessibility');
  expect(host.querySelector('[data-native-modal="Accessibility"]')).not.toBeNull();
  expect(hubRows()).toEqual([]);
  await click('Back to Settings');
  expect(hubRows()).toHaveLength(rows.length);
});

it('steps Button Size through the settings owner and resizes the edge controls from it', async () => {
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Accessibility');
  expect(host.textContent).toContain('Button Size 100%');
  expect(host.textContent).toContain(BUTTON_SIZE_HELP);
  for (let step = 0; step < 3; step++) await click('Bigger buttons');
  expect(host.textContent).toContain(`Button Size ${BUTTON_SCALE_MAX}%`);
  expect(button('Bigger buttons').disabled).toBe(true);
  expect(settings.stored()).toMatchObject({ version: 10, buttonScale: BUTTON_SCALE_MAX });
  await rerender({ settingsOpen: false });
  await click('Expand controls');
  const size = controlSize(BUTTON_SCALE_MAX);
  expect(size).toBeGreaterThan(TOUCH_TARGET);
  for (const label of ['Purple paint', 'More colors', 'Save picture', 'Collapse controls'])
    expect(outerSize(label), label).toBe(size);
  expect(outerSize('Settings')).toBe(TOUCH_TARGET);
  await rerender({ settingsOpen: true });
  await openSettingsSection('Accessibility');
  for (let step = 0; step < 6; step++) await click('Smaller buttons');
  expect(host.textContent).toContain(`Button Size ${BUTTON_SCALE_MIN}%`);
  expect(button('Smaller buttons').disabled).toBe(true);
  expect(settings.stored().buttonScale).toBe(BUTTON_SCALE_MIN);
  await rerender({ settingsOpen: false });
  expect(outerSize('Purple paint')).toBe(controlSize(BUTTON_SCALE_MIN));
});

it('overrides the device with the in-app Reduce Motion switch and follows it again on a match', async () => {
  records.reduceMotion = false;
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Accessibility');
  expect(host.textContent).toContain(REDUCE_MOTION_HELP);
  checkedSwitch(button(REDUCE_MOTION_LABEL), false);
  await click(REDUCE_MOTION_LABEL);
  checkedSwitch(button(REDUCE_MOTION_LABEL), true);
  expect(settings.stored().reduceMotion).toBe('reduce');
  await rerender({ settingsOpen: false, colorPickerOpen: true });
  expect(colorPickerAnimation()).toBe('none');
  await rerender({ settingsOpen: true, colorPickerOpen: false });
  await openSettingsSection('Accessibility');
  await click(REDUCE_MOTION_LABEL);
  checkedSwitch(button(REDUCE_MOTION_LABEL), false);
  expect(settings.stored().reduceMotion).toBe('system');
  await rerender({ settingsOpen: false, colorPickerOpen: true });
  expect(colorPickerAnimation()).toBe('fade');
});

it('shows a device Reduce Motion as on, and keeps motion when the parent turns it off', async () => {
  records.reduceMotion = true;
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Accessibility');
  checkedSwitch(button(REDUCE_MOTION_LABEL), true);
  await click(REDUCE_MOTION_LABEL);
  checkedSwitch(button(REDUCE_MOTION_LABEL), false);
  expect(settings.stored().reduceMotion).toBe('full');
  await rerender({ settingsOpen: false, colorPickerOpen: true });
  expect(colorPickerAnimation()).toBe('fade');
});

it.each([
  ['never opened', null],
  ['opened for an earlier release', RELEASE_NOTES[1].version],
])(
  "dots What's New while the current release is unseen (%s) and clears it once viewed",
  async (_name, whatsNewSeen) => {
    const settings = storedSettings({ whatsNewSeen });
    drawingScreen();
    await mount(createElement(RsdDrawingScreen));
    expect(host.querySelectorAll('[data-testid="settings-activity-dot"]')).toHaveLength(1);
    const row = button(`${WHATS_NEW}, new`);
    expect(row.querySelector('[data-testid="settings-activity-dot"]')).not.toBeNull();
    await act(async () => row.click());
    expect(host.querySelector('[data-native-modal="Updates"]')).not.toBeNull();
    for (const release of RELEASE_NOTES) {
      expect(host.textContent).toContain(release.dateLabel);
      expect(host.textContent).toContain(release.sections[0].items[0]);
    }
    expect(settings.stored().whatsNewSeen).toBe(WHATS_NEW_STAMP);
    await click('Back to Settings');
    expect(host.querySelector('[data-testid="settings-activity-dot"]')).toBeNull();
    expect(button(WHATS_NEW)).not.toBeNull();
    expect(settings.storage.write).toHaveBeenCalledOnce();
    await openSettingsSection(WHATS_NEW);
    expect(settings.storage.write).toHaveBeenCalledOnce();
  }
);

it("shows no dot once the current release's notes have been seen", async () => {
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  expect(host.querySelector('[data-testid="settings-activity-dot"]')).toBeNull();
  await openSettingsSection(WHATS_NEW);
  expect(settings.storage.write).not.toHaveBeenCalled();
});
