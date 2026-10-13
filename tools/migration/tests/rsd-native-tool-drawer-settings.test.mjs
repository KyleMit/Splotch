import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  caller,
  records,
  host,
  mount,
  checkedSwitch,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { TOOL_DRAWER_SPACING } from '../../../experiments/native-architecture/src/rsdDrawing/RsdToolDrawerSection.tsx';
import {
  DRAWING_TOOLS,
  TOOL_DRAWER_COPY,
  TWO_COLUMN_CHIP_WIDTH_PX,
} from '../../../experiments/native-architecture/src/settings/drawingTools.ts';
import {
  CAMERA_BUTTON_HELP,
  CAMERA_BUTTON_LABEL,
} from '../../../experiments/native-architecture/src/settings/savingSection.ts';
import { DEFAULT_DRAWING_CONTROL_PREFERENCES } from '../../../experiments/native-architecture/src/settings/drawingControlPreferences.ts';
import { SECTION_SUBTITLES } from '../../../experiments/native-architecture/src/settings/settingsSections.ts';
import { PENCIL_ERASER_LABEL } from '../../../experiments/native-architecture/src/settings/pencilEraser.ts';
import { WHATS_NEW_STAMP } from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import { heldBrushLabel as brushLabel } from './rsd-native-toolbar-fixture.mjs';

const REPOSITORY = join(import.meta.dirname, '../../..');
const shipping = (path) =>
  readFileSync(join(REPOSITORY, 'web/src/lib/components/settings', path), 'utf8');
const CONTROLS = shipping('ControlsSection.svelte');
const TOOLS = shipping('drawingTools.ts');
const SAVING = shipping('SavingSection.svelte');
const COMPACT = shipping('CompactShell.svelte');
const SECTIONS = shipping('sections.ts');
const SETTINGS = readFileSync(join(REPOSITORY, 'web/src/lib/state/settings.svelte.ts'), 'utf8');

function toggleRow(source, id) {
  const row = source.match(new RegExp(`<ToggleRow\\b[^>]*id="${id}"[^>]*/>`))?.[0];
  expect(row, id).toBeDefined();
  return row;
}
const rowProp = (row, name) => row.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const cssPx = (source, selector, property) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  return Number(body?.match(new RegExp(`${property}:\\s*([\\d.]+)px`))?.[1]);
};

describe('the shipping Tool Drawer and Saving sources', () => {
  it('ports the master switch, rule label, spacing and chip threshold from ControlsSection', () => {
    const master = toggleRow(CONTROLS, 'toolDrawerToggle');
    expect(rowProp(master, 'label')).toBe(TOOL_DRAWER_COPY.enable);
    expect(rowProp(master, 'help')).toBe(TOOL_DRAWER_COPY.enableHelp);
    expect(rowProp(master, 'icon')).toBe('dashboard-customize');
    expect(CONTROLS).toContain(
      `<RuleLabel as="h4" strong class="tools-heading">${TOOL_DRAWER_COPY.tools}</RuleLabel>`
    );
    expect(CONTROLS).toContain(`label="${TOOL_DRAWER_COPY.tools}"`);
    expect(CONTROLS).toContain(`TWO_COLUMN_CHIP_WIDTH_PX = ${TWO_COLUMN_CHIP_WIDTH_PX};`);
    expect(cssPx(CONTROLS, '.tools-block', 'margin-top')).toBe(TOOL_DRAWER_SPACING.toolsTop);
    expect(cssPx(CONTROLS, '.tools-block :global(h4.tools-heading)', 'margin-bottom')).toBe(
      TOOL_DRAWER_SPACING.headingBottom
    );
    expect(cssPx(CONTROLS, '.pencil-eraser', 'margin-top')).toBe(TOOL_DRAWER_SPACING.pencilTop);
    expect(SECTIONS).toContain(`return '${TOOL_DRAWER_COPY.off}';`);
    expect(SECTION_SUBTITLES.toolDrawerOff).toBe(TOOL_DRAWER_COPY.off);
  });

  it('lists the drawing tools in the shipping order with their ids, labels and icons', () => {
    const order = SETTINGS.match(/TOOL_DRAWER_CONTROLS = \[([^\]]*)\]/)[1].match(/'(\w+)'/g);
    const meta = order.map((quoted) => {
      const block = TOOLS.match(new RegExp(`${quoted.slice(1, -1)}: \\{([^}]*)\\}`))[1];
      const field = (name) => block.match(new RegExp(`${name}: '([^']*)'`))[1];
      return { id: field('id'), label: field('label'), icon: field('icon') };
    });
    expect(DRAWING_TOOLS.map(({ id, label, icon }) => ({ id, label, icon }))).toEqual(meta);
  });

  it('ports the Camera button row, the compact Tool drawer cell and both defaults', () => {
    const camera = toggleRow(SAVING, 'screenshotToggle');
    expect(rowProp(camera, 'label')).toBe(CAMERA_BUTTON_LABEL);
    expect(rowProp(camera, 'help')).toBe(CAMERA_BUTTON_HELP);
    expect(rowProp(camera, 'icon')).toBe('camera');
    expect(rowProp(toggleRow(SAVING, 'saveOnDeleteToggle'), 'icon')).toBe('camera-party');
    const quick = toggleRow(COMPACT, 'quickToolDrawerToggle');
    expect(rowProp(quick, 'label')).toBe(TOOL_DRAWER_COPY.quick);
    expect(rowProp(quick, 'icon')).toBe('dashboard-customize');
    for (const [field, key] of [
      ['toolDrawerEnabled', 'toolDrawer'],
      ['screenshotEnabled', 'screenshotEnabled'],
    ])
      expect(SETTINGS).toContain(
        `${field}: [STORAGE_KEYS.${key}, ${DEFAULT_DRAWING_CONTROL_PREFERENCES[field]}]`
      );
  });
});

const CURRENT_SETTINGS = {
  version: 12,
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
  pencilEraserEnabled: true,
  applePencilSeen: false,
  toolDrawerEnabled: true,
  screenshotEnabled: true,
};

async function drawingScreen(overrides = {}) {
  caller.realScreen = true;
  let stored = JSON.stringify({ ...CURRENT_SETTINGS, ...overrides });
  caller.settingsStorage = {
    read: async () => stored,
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  await mount(createElement(RsdDrawingScreen));
  return () => JSON.parse(stored);
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
});
