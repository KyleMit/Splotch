import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { records, host, expandControls } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import {
  COLOR_MENU_EDGE_ROOM_PX,
  COLOR_MENU_FIRST_TRIM_RANK,
  COLOR_MENU_GAP_PX,
  COLOR_MENU_LABELS,
  COLOR_MENU_PADDING_PX,
  COLOR_MENU_SWATCH_PX,
  colorMenuLabels,
} from '../../../experiments/native-architecture/src/rsdDrawing/colorMenuLayout.ts';
import {
  COLOR_ICON_PX,
  FOLD_TAP_TRAVEL_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdColorButton.tsx';
import { COLOR_OPTION_PRESS_SCALE } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColorMenu.tsx';
import {
  EDGE_INSET_PX,
  PHONE_TOOLBAR_BUTTON_PX,
  PHONE_TOOLBAR_GAP_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import {
  PALETTE_COLORS,
  PALETTE_TRIM_ORDER,
} from '../../../experiments/native-architecture/src/drawing/palette.ts';
import {
  COLOR_MENU_GEOMETRY,
  colorMenuTrimSteps,
} from '../../../web/src/lib/design/trimGeometry.ts';
import {
  LANDSCAPE_COLORS,
  LANDSCAPE_FIRST_TRIM_RANK,
} from '../../../web/src/lib/landscapeToolbar.ts';
import { PHONE_LANDSCAPE_QUERY } from '../../../web/src/lib/breakpoints.ts';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');
// A phone held sideways, short of the tablet floor, and the portrait phone.
const LANDSCAPE_PHONE = { width: 740, height: 360 };
const PORTRAIT_PHONE = { width: 390, height: 844 };

function viewport({ width, height }) {
  records.dimensions = { width, height, scale: 1, fontScale: 1 };
}

const colorsButton = () => host.querySelector('[aria-label="Colors"][role="button"]');
const colorMenu = () => host.querySelector('[role="group"][aria-label="Colors"]');
const menuPaints = () =>
  [...colorMenu().querySelectorAll('[role="radio"]')].map((node) =>
    node.getAttribute('aria-label')
  );
const expanded = () =>
  records.props.findLast(
    (props) => props.accessibilityLabel === 'Colors' && props.accessibilityState
  ).accessibilityState.expanded;
const slot = () => records.props.findLast((props) => props.testID === 'rsd-color-button-slot');
const touch = (pageX, pageY) => ({ nativeEvent: { pageX, pageY } });

// Shipping's container-query ladder: each rung hides its ranks once the room is at or below it.
function shippingMenuRanks(room) {
  const hidden = new Set(
    colorMenuTrimSteps(LANDSCAPE_COLORS.length, LANDSCAPE_FIRST_TRIM_RANK)
      .filter(({ thresholdPx }) => room <= thresholdPx)
      .flatMap(({ ranks }) => ranks)
  );
  return LANDSCAPE_COLORS.map(({ label }) => label).filter(
    (label) => !hidden.has(PALETTE_TRIM_ORDER.indexOf(label))
  );
}

describe('the landscape phone Color Button and Color Menu', () => {
  it('keeps the geometry ColorControl, ColorMenu and the trim ladder declare', () => {
    expect(COLOR_MENU_SWATCH_PX).toBe(COLOR_MENU_GEOMETRY.swatchPx);
    expect(COLOR_MENU_GAP_PX).toBe(COLOR_MENU_GEOMETRY.gapPx);
    expect(COLOR_MENU_PADDING_PX).toBe(COLOR_MENU_GEOMETRY.paddingPx);
    expect(COLOR_MENU_FIRST_TRIM_RANK).toBe(LANDSCAPE_FIRST_TRIM_RANK);
    expect(COLOR_MENU_LABELS).toEqual(LANDSCAPE_COLORS.map(({ label }) => label));
    const menu = read('web/src/lib/components/ColorMenu.svelte');
    expect(menu).toContain(`var(--action-btn-size) - ${COLOR_MENU_EDGE_ROOM_PX}px`);
    expect(menu).toMatch(
      new RegExp(`\\.color-option:active \\{\\s*transform: scale\\(${COLOR_OPTION_PRESS_SCALE}\\);`)
    );
    expect(read('web/src/app.css')).toMatch(
      new RegExp(`\\.color-icon \\{\\s*width: ${COLOR_ICON_PX}px;\\s*height: ${COLOR_ICON_PX}px;`)
    );
    expect(read('web/src/lib/actions/colorFoldGesture.ts')).toContain(
      `const TAP_TRAVEL_PX = ${FOLD_TAP_TRAVEL_PX};`
    );
    expect(read('web/src/lib/components/ColorControl.svelte')).toContain(
      '<Icon name="ink-splotch" class="color-icon" />'
    );
    expect(PHONE_LANDSCAPE_QUERY).toContain('(max-height: 599.98px)');
  });

  it('trims the menu by the same ladder as shipping, rung for rung', () => {
    for (let room = 0; room <= 900; room += 0.5) {
      expect(colorMenuLabels(room + COLOR_MENU_EDGE_ROOM_PX, 0), `${room}px`).toEqual(
        shippingMenuRanks(room)
      );
    }
    expect(PALETTE_COLORS.length).toBeGreaterThan(COLOR_MENU_LABELS.length);
  });

  it('replaces the palette bar on a landscape phone and centres on the paper while the drawer is closed', async () => {
    viewport(LANDSCAPE_PHONE);
    await mountToolbar(toolbarScreen());
    expect(host.querySelector('[data-testid="rsd-palette-bar"]')).toBeNull();
    expect(host.querySelector('[aria-label="Paint colors"]')).toBeNull();
    expect(expanded()).toBe(false);
    expect(colorsButton().querySelector('svg[data-xml]').dataset.xml).toContain('fill="#AB71E1"');
    const size = PHONE_TOOLBAR_BUTTON_PX;
    expect(flat(slot().style)).toMatchObject({
      position: 'absolute',
      left: EDGE_INSET_PX,
      bottom: (LANDSCAPE_PHONE.height - size) / 2,
    });
    await expandControls();
    // The fixture's drawer climbs Brushes and Stroke width up the L's leg; the button tops it.
    expect(flat(slot().style).bottom).toBe(EDGE_INSET_PX + 3 * (size + PHONE_TOOLBAR_GAP_PX));
  });

  it('keeps the palette bar, with no Color Button, in portrait', async () => {
    viewport(PORTRAIT_PHONE);
    await mountToolbar(toolbarScreen());
    expect(host.querySelector('[aria-label="Paint colors"]')).not.toBeNull();
    expect(colorsButton()).toBeNull();
  });

  it('opens a swatch flyout whose pick loads the ink and closes it', async () => {
    viewport(LANDSCAPE_PHONE);
    const screen = toolbarScreen({ brush: 'pen' });
    await mountToolbar(screen);
    await act(async () => colorsButton().click());
    expect(expanded()).toBe(true);
    const room = LANDSCAPE_PHONE.width - PHONE_TOOLBAR_BUTTON_PX - COLOR_MENU_EDGE_ROOM_PX;
    expect(menuPaints()).toEqual(shippingMenuRanks(room).map((label) => `${label} paint`));
    expect(menuPaints()).toHaveLength(9);
    const purple = colorMenu().querySelector('[aria-label="Purple paint"]');
    expect(purple.dataset.checked).toBe('true');
    expect(colorMenu().querySelector('[aria-label="More colors"]')).not.toBeNull();
    await act(async () => colorMenu().querySelector('[aria-label="Blue paint"]').click());
    expect(screen.selectInkBrush).toHaveBeenCalledOnce();
    expect(colorMenu()).toBeNull();
    await act(async () => colorsButton().click());
    await act(async () => colorMenu().querySelector('[aria-label="More colors"]').click());
    expect(screen.openColorPicker).toHaveBeenCalledOnce();
    expect(colorMenu()).toBeNull();
  });

  it('rings no paint while the eraser is held', async () => {
    viewport(LANDSCAPE_PHONE);
    await mountToolbar(toolbarScreen({ brush: 'eraser' }));
    await act(async () => colorsButton().click());
    expect(colorMenu().querySelectorAll('[data-checked="true"]')).toHaveLength(0);
  });

  it('folds the drawer out on a swipe up and away on a swipe down, leaving taps to the menu', async () => {
    viewport(LANDSCAPE_PHONE);
    await mountToolbar(toolbarScreen());
    const swipe = async (dy) => {
      const handlers = slot();
      handlers.onStartShouldSetResponderCapture(touch(20, 180));
      expect(handlers.onMoveShouldSetResponderCapture(touch(22, 180 + dy))).toBe(true);
      await act(async () => handlers.onResponderRelease(touch(22, 180 + dy)));
    };
    const short = slot();
    short.onStartShouldSetResponderCapture(touch(20, 180));
    expect(short.onMoveShouldSetResponderCapture(touch(20, 180 - FOLD_TAP_TRAVEL_PX + 1))).toBe(
      false
    );
    expect(short.onMoveShouldSetResponderCapture(touch(60, 180 - FOLD_TAP_TRAVEL_PX))).toBe(false);
    await swipe(-FOLD_TAP_TRAVEL_PX);
    expect(host.querySelector('[aria-label="Collapse controls"]')).not.toBeNull();
    await swipe(FOLD_TAP_TRAVEL_PX);
    expect(host.querySelector('[aria-label="Expand controls"]')).not.toBeNull();
    expect(colorMenu()).toBeNull();
  });
});
