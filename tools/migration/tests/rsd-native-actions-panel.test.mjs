import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { caller, records, host, expandControls } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, resolved, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import {
  ACTION_BUTTON_BASE_PX,
  ACTION_BUTTON_GAP_PX,
  DRAWER_CHEVRON_TURN_DEG,
  DRAWER_TOGGLE_MARGIN_PX,
  EDGE_INSET_PX,
  FLYOUT_OFFSET_PX,
  LANDSCAPE_ROW_RESERVE_PX,
  LARGE_TABLET_MIN_SIDE_PX,
  PHONE_TOOLBAR_BUTTON_PX,
  PHONE_TOOLBAR_GAP_PX,
  PHONE_TOOLBAR_HORIZONTAL_CHROME_PX,
  PHONE_TOOLBAR_LEG_SLOTS,
  PHONE_TOOLBAR_PADDING_PX,
  PHONE_TOOLBAR_VERTICAL_CHROME_PX,
  PORTRAIT_COLUMN_RESERVE_PX,
  TABLET_MIN_SIDE_PX,
  VERTICAL_FLYOUT_MAX_WIDTH_PX,
  actionPanelLayout,
  flyoutPlacement,
} from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import {
  CORNER_BUTTON_SIZE_PX,
  FLYOUT_OPEN_CORNER_OPACITY,
  FLYOUT_OPEN_TILE_FILTER,
  FLYOUT_OPEN_TILE_OPACITY,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { BRUSH_MENU_OPTIONS } from '../../../experiments/native-architecture/src/rsdDrawing/brushMenuOptions.ts';
import { ERASER_PREVIEW_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdToolFlyouts.tsx';
import {
  DARK_INK_RELATIVE_LUMINANCE_MAX,
  WHITE_INK_HEX,
  inkKeyline,
} from '../../../experiments/native-architecture/src/rsdDrawing/inkKeyline.ts';
import { colorLuminance } from '../../../web/src/lib/design/colorContrast.ts';
import { PALETTE_COLORS } from '../../../experiments/native-architecture/src/drawing/palette.ts';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');
const LAYOUT = read('web/src/lib/actionButtonLayout.ts');
const PANEL = read('web/src/lib/components/ActionsPanel.svelte');
const APP_CSS = read('web/src/app.css');

function constant(source, name) {
  const value = source.match(new RegExp(`\\b${name} = (-?[\\d.]+);`))?.[1];
  expect(value, name).toBeDefined();
  return Number(value);
}

function button(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

function options(menu) {
  return [...host.querySelectorAll(`[aria-label="${menu}"] [role="button"]`)].map((node) => ({
    label: node.getAttribute('aria-label'),
    checked: node.dataset.selected === 'true',
  }));
}

function expanded(label) {
  return records.props.findLast((props) => props.accessibilityLabel === label).accessibilityState
    .expanded;
}

const iconColors = (label) =>
  button(label)
    .querySelector('svg')
    .dataset.xml.match(/#[0-9a-f]{3,6}\b/gi)
    .map((hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((d) => d + d).join('')}` : hex));
const isGrey = (hex) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);

function propsOf(testID) {
  return records.props.findLast((props) => props.testID === testID);
}

// A press the layout's root sees first, then, when it lands on the open menu, the menu's own box.
async function press({ inside }) {
  await act(async () => {
    propsOf('rsd-drawing-layout').onStartShouldSetResponderCapture();
    if (inside) propsOf('rsd-tool-flyout').onStartShouldSetResponderCapture();
    await Promise.resolve();
  });
}

describe('Brush and Stroke Width flyouts', () => {
  it('pops the Brush Menu beside its button with the held brush ringed, and picks from it', async () => {
    const setBrush = vi.fn();
    await mountToolbar(
      toolbarScreen({
        brush: 'crayon',
        brushControl: { kind: 'menu', brushes: ['pen', 'crayon', 'magic', 'eraser'] },
        availableBrushes: ['pen', 'crayon', 'magic', 'eraser'],
        setBrush,
      })
    );
    await expandControls();
    expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
    expect(expanded('Brushes')).toBe(false);
    await act(async () => button('Brushes').click());
    expect(expanded('Brushes')).toBe(true);
    expect(options('Brush Menu')).toEqual([
      { label: 'Pen', checked: false },
      { label: 'Crayon', checked: true },
      { label: 'Magic brush', checked: false },
      { label: 'Eraser', checked: false },
    ]);
    // Portrait: beside the button, bottoms aligned, stacked up a phone too narrow for a row.
    const brushSlot = flat(
      records.props.findLast(
        (props) =>
          props.testID === 'rsd-drawer-tool' && props.onStartShouldSetResponderCapture !== undefined
      ).style
    );
    const size = resolved((props) => props.accessibilityLabel === 'Brushes').width;
    expect(flat(propsOf('rsd-tool-flyout').style)).toMatchObject({
      left: brushSlot.left + size + FLYOUT_OFFSET_PX,
      bottom: brushSlot.bottom,
    });
    // Every other tile and the chevron step back while the menu is open.
    expect(resolved((props) => props.accessibilityLabel === 'Undo').filter).toBe(
      FLYOUT_OPEN_TILE_FILTER
    );
    expect(resolved((props) => props.accessibilityLabel === 'Brushes').filter).toBeUndefined();
    // iOS's renderer drops a grayscale filter, so the greyed tile's icon is painted grey itself.
    expect(iconColors('Undo').length).toBeGreaterThan(0);
    expect(iconColors('Undo').every(isGrey)).toBe(true);
    expect(iconColors('Brushes').some((hex) => !isGrey(hex))).toBe(true);
    await act(async () => button('Eraser').click());
    expect(iconColors('Undo').some((hex) => !isGrey(hex))).toBe(true);
    expect(setBrush).toHaveBeenCalledExactlyOnceWith('eraser');
    expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
    expect(resolved((props) => props.accessibilityLabel === 'Undo').filter).toBeUndefined();
  });

  it('shows five ink previews, ringing the current width, and saves the one picked', async () => {
    await mountToolbar(toolbarScreen({ brush: 'pen' }));
    const setWidth = vi.spyOn(caller.product.sound.owner.settings, 'setWidth');
    await expandControls();
    await act(async () => button('Stroke width').click());
    expect(options('Stroke Width Menu')).toEqual(
      [1, 2, 3, 4, 5].map((size) => ({ label: `Size ${size}`, checked: size === 3 }))
    );
    await act(async () => button('Size 5').click());
    expect(setWidth).toHaveBeenCalledExactlyOnceWith('drawing', 'extraThick');
    expect(host.querySelector('[aria-label="Stroke Width Menu"]')).toBeNull();
  });

  it('previews the eraser as true-size holes and saves the eraser width apart', async () => {
    await mountToolbar(toolbarScreen({ brush: 'eraser' }));
    const setWidth = vi.spyOn(caller.product.sound.owner.settings, 'setWidth');
    await expandControls();
    await act(async () => button('Stroke width').click());
    expect(options('Stroke Width Menu').map(({ label }) => label)).toEqual(
      [1, 2, 3, 4, 5].map((size) => `Eraser size ${size}`)
    );
    expect(resolved((props) => props.accessibilityLabel === 'Eraser size 5').padding).toBe(0);
    await act(async () => button('Eraser size 1').click());
    expect(setWidth).toHaveBeenCalledExactlyOnceWith('eraser', 'extraThin');
  });

  it('closes on a press anywhere outside the menu without claiming it, and stays for one inside', async () => {
    await mountToolbar(toolbarScreen());
    await expandControls();
    await act(async () => button('Brushes').click());
    expect(propsOf('rsd-drawing-layout').onStartShouldSetResponderCapture()).toBe(false);
    await press({ inside: true });
    expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
    await press({ inside: false });
    expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
    await act(async () => button('Brushes').click());
    await act(async () => button('Collapse controls').click());
    await act(async () => button('Expand controls').click());
    expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  });
});

describe('Actions Panel geometry', () => {
  const phone = { width: 390, height: 844 };
  it('steps the button base by size class and caps the line to the screen, as app.css does', () => {
    const layout = (viewport, area, scale, count = 6) =>
      actionPanelLayout({ area, viewport, scale, count, leg: 2, open: true });
    expect(layout(phone, { width: 390, height: 769 }, 1).size).toBe(50);
    expect(layout({ width: 768, height: 1024 }, { width: 768, height: 949 }, 1).size).toBe(55);
    expect(layout({ width: 1366, height: 1024 }, { width: 1282, height: 1024 }, 1).size).toBe(68);
    // A short portrait column shares what is left between its buttons.
    expect(layout({ width: 320, height: 480 }, { width: 320, height: 405 }, 1.3).size).toBe(
      (405 - PORTRAIT_COLUMN_RESERVE_PX - 5 * ACTION_BUTTON_GAP_PX) / 6
    );
    const l = layout({ width: 844, height: 390 }, { width: 760, height: 390 }, 1);
    expect(l).toMatchObject({ mode: 'phoneLandscape', size: 48, padding: 6 });
    // The L: Brush above Stroke Width on the vertical leg, the rest along the bottom row.
    const pitch = 48 + PHONE_TOOLBAR_GAP_PX;
    expect(l.tools).toEqual([
      { left: 8, bottom: 8 + 2 * pitch },
      { left: 8, bottom: 8 + pitch },
      { left: 8, bottom: 8 },
      { left: 8 + pitch, bottom: 8 },
      { left: 8 + 2 * pitch, bottom: 8 },
      { left: 8 + 3 * pitch, bottom: 8 },
    ]);
    expect(l.toggle).toEqual({ left: 8 + 4 * pitch, bottom: 8 });
  });

  it('keeps the chevron in the corner while closed and after the tools while open', () => {
    const args = { area: { width: 390, height: 769 }, viewport: phone, scale: 1, count: 3, leg: 2 };
    expect(actionPanelLayout({ ...args, open: false }).toggle).toEqual({ left: 9, bottom: 8 });
    expect(actionPanelLayout({ ...args, open: true }).toggle).toEqual({
      left: 9,
      bottom: 8 + 3 * 50 + 2 * ACTION_BUTTON_GAP_PX + DRAWER_TOGGLE_MARGIN_PX,
    });
    const row = {
      ...args,
      area: { width: 1282, height: 1024 },
      viewport: { width: 1366, height: 1024 },
    };
    expect(actionPanelLayout({ ...row, open: true }).toggle).toEqual({
      left: 8 + 3 * 68 + 2 * ACTION_BUTTON_GAP_PX + DRAWER_TOGGLE_MARGIN_PX,
      bottom: 8 + (68 - CORNER_BUTTON_SIZE_PX) / 2,
    });
  });

  it('opens a flyout above a landscape row and beside a portrait column', () => {
    const trigger = { left: 8, bottom: 8 };
    expect(flyoutPlacement('row', trigger, 60, { width: 1024, height: 768 })).toEqual({
      left: 8,
      bottom: 8 + 60 + FLYOUT_OFFSET_PX,
      direction: 'row',
    });
    expect(flyoutPlacement('column', trigger, 50, phone)).toEqual({
      left: 8 + 50 + FLYOUT_OFFSET_PX,
      bottom: 8,
      direction: 'column',
    });
    expect(flyoutPlacement('column', trigger, 55, { width: 768, height: 1024 }).direction).toBe(
      'row'
    );
  });
});

describe('shipping parity', () => {
  it('reads the panel geometry from actionButtonLayout.ts, breakpoints.ts and app.css', () => {
    const inset = constant(LAYOUT, 'PANEL_INSET');
    const toggle = constant(LAYOUT, 'DRAWER_TOGGLE_SIZE');
    const chrome = inset + constant(LAYOUT, 'DRAWER_TOGGLE_MARGIN') + toggle;
    const phoneGap = constant(LAYOUT, 'PHONE_TOOLBAR_GAP_PX');
    expect(EDGE_INSET_PX).toBe(inset);
    expect(CORNER_BUTTON_SIZE_PX).toBe(toggle);
    expect(ACTION_BUTTON_GAP_PX).toBe(constant(LAYOUT, 'ACTION_BUTTON_GAP'));
    expect(PHONE_TOOLBAR_GAP_PX).toBe(phoneGap);
    expect(PHONE_TOOLBAR_BUTTON_PX).toBe(constant(LAYOUT, 'PHONE_TOOLBAR_BUTTON_PX'));
    expect(PHONE_TOOLBAR_LEG_SLOTS).toBe(constant(LAYOUT, 'PHONE_TOOLBAR_LEG_SLOTS'));
    expect(LANDSCAPE_ROW_RESERVE_PX).toBe(constant(LAYOUT, 'SETTINGS_BUTTON_RESERVE') + chrome);
    expect(PORTRAIT_COLUMN_RESERVE_PX).toBe(constant(LAYOUT, 'PALETTE_CLEARANCE') + chrome);
    expect(PHONE_TOOLBAR_VERTICAL_CHROME_PX).toBe(2 * inset + toggle + 3 * phoneGap);
    expect(PHONE_TOOLBAR_HORIZONTAL_CHROME_PX).toBe(
      inset + toggle + constant(LAYOUT, 'SETTINGS_BUTTON_RESERVE') + 4 * phoneGap
    );
    const base = LAYOUT.match(/ACTION_BUTTON_BASE_PX = (\{[\s\S]*?\}) as const/)?.[1];
    expect(Function(`return (${base})`)()).toEqual(ACTION_BUTTON_BASE_PX);
    const breakpoints = read('web/src/lib/breakpoints.ts');
    expect(TABLET_MIN_SIDE_PX).toBe(constant(breakpoints, 'TABLET_MIN_SIDE_PX'));
    expect(LARGE_TABLET_MIN_SIDE_PX).toBe(constant(breakpoints, 'LARGE_TABLET_MIN_SIDE_PX'));
    expect(PANEL).toMatch(new RegExp(`margin-right: ${DRAWER_TOGGLE_MARGIN_PX}px;`));
    expect(APP_CSS).toContain(`bottom: calc(100% + ${FLYOUT_OFFSET_PX}px);`);
    expect(APP_CSS).toContain(
      `(orientation: portrait) and (max-width: ${VERTICAL_FLYOUT_MAX_WIDTH_PX}px)`
    );
    expect(APP_CSS).toMatch(
      new RegExp(`\\.actions-panel \\.action-button \\{\\s*padding: ${PHONE_TOOLBAR_PADDING_PX}px;`)
    );
    expect(APP_CSS).toContain(`margin-right: ${PHONE_TOOLBAR_GAP_PX}px;`);
  });

  it('turns the chevron and greys the panel the way the shipping stylesheets do', () => {
    expect(PANEL).toContain('landscape closed 0 · open 180');
    expect(PANEL).toContain(`--drawer-open-rot: ${DRAWER_CHEVRON_TURN_DEG.row.open}deg;`);
    expect(PANEL).toContain(`--drawer-axis-rot: ${DRAWER_CHEVRON_TURN_DEG.column.closed}deg;`);
    expect(PANEL).toContain(
      `--drawer-axis-rot: ${DRAWER_CHEVRON_TURN_DEG.phoneLandscape.closed}deg;`
    );
    for (const turn of Object.values(DRAWER_CHEVRON_TURN_DEG))
      expect(turn.open - turn.closed).toBe(DRAWER_CHEVRON_TURN_DEG.row.open);
    expect(APP_CSS).toContain(
      `filter: ${FLYOUT_OPEN_TILE_FILTER} opacity(${FLYOUT_OPEN_TILE_OPACITY});`
    );
    expect(APP_CSS).toMatch(
      new RegExp(
        `\\[data-open-flyout\\] \\.drawer-toggle \\{\\s*opacity: ${FLYOUT_OPEN_CORNER_OPACITY};`
      )
    );
  });

  it('names the Brush Menu entries and sizes the eraser previews as shipping does', () => {
    const tool = read('web/src/lib/state/tool.svelte.ts');
    for (const [brush, { icon, label }] of Object.entries(BRUSH_MENU_OPTIONS))
      expect(tool).toContain(`{ brush: '${brush}', icon: '${icon}', label: '${label}'`);
    expect(read('web/src/lib/components/StrokeWidthMenu.svelte')).toContain(
      `width: min(${ERASER_PREVIEW_PX}px, 100%);`
    );
    expect(read('web/src/lib/components/ActionsPanel.svelte')).toContain(
      'aria-label="Coloring books"'
    );
    expect(read('web/src/lib/components/ScreenshotButton.svelte')).toContain(
      'aria-label="Save screenshot"'
    );
    expect(read('web/src/lib/components/StrokeControl.svelte')).toContain(
      'aria-label="Stroke width"'
    );
  });

  it('rings white and near-black ink the way the shipping keyline rules do', () => {
    const colors = read('web/src/lib/state/colors.svelte.ts');
    expect(colors).toContain(`WHITE_INK = '${WHITE_INK_HEX}'`);
    expect(constant(colors, 'DARK_INK_RELATIVE_LUMINANCE_MAX')).toBe(
      DARK_INK_RELATIVE_LUMINANCE_MAX
    );
    expect(inkKeyline(WHITE_INK_HEX)).toBe('white');
    for (const { hex } of PALETTE_COLORS) {
      const dark = colorLuminance(hex) < DARK_INK_RELATIVE_LUMINANCE_MAX;
      expect(inkKeyline(hex), hex).toBe(
        hex.toLowerCase() === WHITE_INK_HEX ? 'white' : dark ? 'dark' : undefined
      );
    }
    expect(inkKeyline('#0f0f12')).toBe('dark');
  });
});
