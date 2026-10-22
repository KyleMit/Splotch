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
import { describe, expect, it } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';

import {
  DRAWING_TOOLS,
  TOOL_DRAWER_COPY,
  TWO_COLUMN_CHIP_WIDTH_PX,
} from '../../../experiments/native-architecture/src/settings/toolDrawerSection.ts';
import {
  CAMERA_BUTTON_HELP,
  CAMERA_BUTTON_LABEL,
} from '../../../experiments/native-architecture/src/settings/savingSection.ts';

import { SECTION_SUBTITLES } from '../../../experiments/native-architecture/src/settings/settingsSections.ts';
import { PENCIL_ERASER_LABEL } from '../../../experiments/native-architecture/src/settings/pencilEraser.ts';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { heldBrushLabel as brushLabel } from './rsd-native-toolbar-fixture.mjs';

describe('the shipping Tool Drawer and Saving sources', () => {
  it('ports the master switch, rule label, spacing and chip threshold from ControlsSection', () => {
    expect(SECTION_SUBTITLES.toolDrawerOff).toBe(TOOL_DRAWER_COPY.off);
  });
});

async function drawingScreen(overrides = {}) {
  caller.realScreen = true;
  const settings = storedSettings(overrides);
  await mount(createElement(RsdDrawingScreen));
  return settings.stored;
}

const named = (label) => host.querySelector(`[aria-label="${label}"]`);
async function click(label) {
  const node = named(label);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}
const drawerTools = () =>
  [...host.querySelectorAll('[data-testid="rsd-drawer-tool"] button')].map((node) =>
    node.getAttribute('aria-label')
  );
async function openDrawer() {
  if (named('Expand controls')) await click('Expand controls');
}
async function openSection(title) {
  await click('Settings');
  await openSettingsSection(title);
}
async function closeSettings() {
  await click('Close');
}
const heading = () => host.querySelector('[data-testid="rule-label-heading"]');
// A pressed chip wears the check beside its tool icon.
const chipSelected = (label) => chip(label).querySelectorAll('svg').length === 2;
const toolRows = () =>
  DRAWING_TOOLS.map(({ label }) => host.querySelector(`[role="switch"][aria-label="${label}"]`));
async function measureTools(width) {
  const block = records.props.findLast((props) => props.testID === 'tool-drawer-tools');
  await act(async () =>
    block.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 300 } } })
  );
}
const chip = (label) =>
  host.querySelector(
    `[role="group"][aria-label="${TOOL_DRAWER_COPY.tools}"] [aria-label="${label}"]`
  );

describe('Settings › Tool Drawer', () => {
  it('lists every tool as a toggle row under the master switch and its Drawing Tools rule', async () => {
    const stored = await drawingScreen();
    await openSection('Tool Drawer');
    checkedSwitch(named(TOOL_DRAWER_COPY.enable), true);
    expect(host.textContent).toContain(TOOL_DRAWER_COPY.enableHelp);
    expect(heading()?.textContent).toBe(TOOL_DRAWER_COPY.tools);
    for (const row of toolRows()) checkedSwitch(row, true);
    await click('Undo');
    checkedSwitch(named('Undo'), false);
    expect(stored().undoButtonEnabled).toBe(false);
    await click('Back');
    expect(named(`Tool Drawer, 1 tool hidden`)).not.toBeNull();
  });

  it('swaps the rows for two-column chips once the block reaches the shipping threshold', async () => {
    const stored = await drawingScreen({ strokeWidthControlEnabled: false });
    await openSection('Tool Drawer');
    await measureTools(TWO_COLUMN_CHIP_WIDTH_PX - 1);
    expect(chip('Crayon')).toBeNull();
    await measureTools(TWO_COLUMN_CHIP_WIDTH_PX);
    expect(toolRows().every((row) => row === null)).toBe(true);
    expect(DRAWING_TOOLS.map(({ label }) => chipSelected(label))).toEqual([
      true,
      true,
      true,
      false,
      true,
    ]);
    await act(async () => chip('Stroke width').click());
    expect(stored().strokeWidthControlEnabled).toBe(true);
    await act(async () => chip('Eraser').click());
    expect(chipSelected('Eraser')).toBe(false);
    await measureTools(TWO_COLUMN_CHIP_WIDTH_PX - 1);
    checkedSwitch(named('Eraser'), false);
  });

  // Negative control: without the screen's fallback the child keeps holding the hidden Crayon.
  it('hides the drawer’s own tools behind the master switch and leaves the child holding Pen', async () => {
    const stored = await drawingScreen();
    await openDrawer();
    await click('Brushes');
    await click('Crayon');
    expect(brushLabel()).toBe('Brush: Crayon');
    await openSection('Tool Drawer');
    await click(TOOL_DRAWER_COPY.enable);
    checkedSwitch(named(TOOL_DRAWER_COPY.enable), false);
    expect(stored().toolDrawerEnabled).toBe(false);
    expect(heading()).toBeNull();
    expect(toolRows().every((row) => row === null)).toBe(true);
    await click('Back');
    expect(named(`Tool Drawer, ${TOOL_DRAWER_COPY.off}`)).not.toBeNull();
    await closeSettings();
    expect(drawerTools()).toEqual(['Coloring books', 'Save screenshot']);
    await openSection('Tool Drawer');
    await click(TOOL_DRAWER_COPY.enable);
    for (const row of toolRows()) checkedSwitch(row, true);
    await closeSettings();
    expect(drawerTools()).toEqual([
      'Brushes',
      'Stroke width',
      'Coloring books',
      'Save screenshot',
      'Undo',
    ]);
    expect(brushLabel()).toBe('Brush: Pen');
  });

  // Negative control: without the drawer gate the double-tap still selects the hidden Eraser.
  it('keeps the Apple Pencil from reaching the Eraser while the drawer is off', async () => {
    await drawingScreen({ toolDrawerEnabled: false, applePencilSeen: true });
    await openSection('Tool Drawer');
    expect(named(PENCIL_ERASER_LABEL)).toBeNull();
    await click(TOOL_DRAWER_COPY.enable);
    checkedSwitch(named(PENCIL_ERASER_LABEL), true);
    await click(TOOL_DRAWER_COPY.enable);
    await closeSettings();
    await act(async () => caller.pencilDoubleTap());
    expect(caller.haptic).not.toHaveBeenCalled();
    await openSection('Tool Drawer');
    await click(TOOL_DRAWER_COPY.enable);
    await closeSettings();
    await openDrawer();
    expect(brushLabel()).toBe('Brush: Pen');
  });
});

describe('Settings › Saving', () => {
  // Negative control: an unconditional camera tile keeps Save screenshot in the drawer.
  it('shows and hides the camera with its own switch, which the drawer switch never touches', async () => {
    const stored = await drawingScreen({ toolDrawerEnabled: false });
    await openDrawer();
    expect(drawerTools()).toContain('Save screenshot');
    await openSection('Saving');
    checkedSwitch(named(CAMERA_BUTTON_LABEL), true);
    expect(host.textContent).toContain(CAMERA_BUTTON_HELP);
    checkedSwitch(named('Auto-Save on Delete'), false);
    await click(CAMERA_BUTTON_LABEL);
    expect(stored().screenshotEnabled).toBe(false);
    await click('Auto-Save on Delete');
    expect(stored().saveOnDeleteEnabled).toBe(true);
    await click('Back');
    expect(named(`Saving, ${SECTION_SUBTITLES.saveOnDeleteOn}`)).not.toBeNull();
    await closeSettings();
    expect(drawerTools()).toEqual(['Coloring books']);
  });

  // Shipping's data-no-actions: the chevron has nothing to open.
  it('drops the whole drawer, chevron included, once no control is left to show', async () => {
    await drawingScreen({
      toolDrawerEnabled: false,
      screenshotEnabled: false,
      coloringBookEnabled: false,
    });
    expect(named('Expand controls')).toBeNull();
    expect(named('Collapse controls')).toBeNull();
    expect(drawerTools()).toEqual([]);
  });

  // Negative control: returning before the Color Button leaves a landscape phone with no colors.
  it('keeps the landscape phone Color Button, which no section owns, once the drawer is empty', async () => {
    records.dimensions = { width: 740, height: 360, scale: 1, fontScale: 1 };
    await drawingScreen({
      toolDrawerEnabled: false,
      screenshotEnabled: false,
      coloringBookEnabled: false,
    });
    expect(named('Expand controls')).toBeNull();
    expect(drawerTools()).toEqual([]);
    expect(host.querySelector('[aria-label="Colors"][role="button"]')).not.toBeNull();
  });

  // Negative control: a reset owned by the Color Button's own panel never runs once the drawer is
  // empty, so turning back reopens the menu unpressed.
  it('closes the Color Menu for good when the phone turns upright, even with an empty drawer', async () => {
    const landscape = { width: 740, height: 360, scale: 1, fontScale: 1 };
    records.dimensions = landscape;
    await drawingScreen({
      toolDrawerEnabled: false,
      screenshotEnabled: false,
      coloringBookEnabled: false,
    });
    const colorMenu = () => host.querySelector('[role="group"][aria-label="Colors"]');
    await act(async () => host.querySelector('[aria-label="Colors"][role="button"]').click());
    expect(colorMenu()).not.toBeNull();
    for (const dimensions of [{ ...landscape, width: 360, height: 740 }, landscape]) {
      records.dimensions = dimensions;
      await act(async () => root.render(createElement(RsdDrawingScreen)));
      await act(async () => {});
    }
    expect(host.querySelector('[aria-label="Colors"][role="button"]')).not.toBeNull();
    expect(colorMenu()).toBeNull();
  });
});
