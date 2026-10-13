import { caller, records, host, expandControls } from './rsd-native-selection-host.mjs';
import { act } from 'react';
import { expect, it } from 'vitest';
import {
  flat,
  mountToolbar,
  outerSize,
  paintLabels,
  resolved,
  toolbarScreen,
} from './rsd-native-toolbar-fixture.mjs';
import {
  drawerOffsets,
  EDGE_INSET_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import {
  PALETTE_FLOWS,
  paletteSlots,
} from '../../../experiments/native-architecture/src/rsdDrawing/paletteGeometry.ts';
import { CORNER_BUTTON_SIZE_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import {
  CLEAR_DOCK_OVERHANG_PX,
  clearDock,
} from '../../../experiments/native-architecture/src/clear/clearDock.ts';
import { fittedPaper } from '../../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { UNADOPTED_PAPER } from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { TOUCH_TARGET } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SCALE_STEP,
  DEFAULT_BUTTON_SCALE,
  controlSize,
} from '../../../experiments/native-architecture/src/settings/buttonSize.ts';

// Button Size goes through the real settings owner, as the Settings stepper sends it.
async function chooseButtonScale(scale) {
  await act(async () => caller.product.sound.owner.settings.setButtonScale(scale));
  expect(caller.product.sound.settings).toMatchObject({
    status: 'ready',
    buttonScale: scale,
  });
}

const BUTTON_SCALES = [BUTTON_SCALE_MIN, DEFAULT_BUTTON_SCALE, BUTTON_SCALE_MAX];

it.each(BUTTON_SCALES)(
  'keeps every swatch at the shipping size and counts palette slots from it at %i%% Button Size',
  async (scale) => {
    await mountToolbar(toolbarScreen());
    await chooseButtonScale(scale);
    const { swatchPx, gapPx, endPaddingPx } = PALETTE_FLOWS.row;
    const outer = [
      outerSize(resolved((props) => props.accessibilityLabel === 'Purple paint')),
      outerSize(resolved((props) => props.accessibilityLabel === 'More colors')),
    ];
    expect(outer).toEqual([swatchPx, swatchPx]);
    const span = (count) => count * swatchPx + (count - 1) * gapPx + 2 * endPaddingPx;
    for (const length of [320, 390, 402, 568, 820, 1180]) {
      const slots = paletteSlots(length, 'row');
      expect(span(slots), `${length}`).toBeLessThanOrEqual(length);
      expect(span(slots + 1), `${length}`).toBeGreaterThan(length);
    }
    expect(paintLabels()).toHaveLength(paletteSlots(402, 'row') - 1);
  }
);

it('sizes the chevron and every drawer tool from Button Size, and keeps Clear and Settings apart from it', async () => {
  await mountToolbar(toolbarScreen());
  await expandControls();
  const drawerLabels = ['Brush: Crayon', 'Save picture', 'Undo', 'Collapse controls'];
  const sizes = () =>
    drawerLabels.map((label) => outerSize(resolved((props) => props.accessibilityLabel === label)));
  expect(sizes()).toEqual(drawerLabels.map(() => TOUCH_TARGET));
  await chooseButtonScale(BUTTON_SCALE_MAX);
  expect(sizes()).toEqual(drawerLabels.map(() => controlSize(BUTTON_SCALE_MAX)));
  expect(outerSize(resolved((props) => props.accessibilityLabel === 'Settings'))).toBe(
    CORNER_BUTTON_SIZE_PX
  );
  await chooseButtonScale(BUTTON_SCALE_MIN);
  expect(sizes()).toEqual(drawerLabels.map(() => controlSize(BUTTON_SCALE_MIN)));
  expect(controlSize(BUTTON_SCALE_MIN)).toBeLessThan(TOUCH_TARGET);
  expect(controlSize(BUTTON_SCALE_MAX)).toBeGreaterThan(TOUCH_TARGET);
});

function rect(left, top, side) {
  return { left, top, right: left + side, bottom: top + side };
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

it.each(
  [
    [320, 568],
    [568, 320],
  ].flatMap(([width, height]) => BUTTON_SCALES.map((scale) => [width, height, scale]))
)(
  'keeps every drawer tool and the chevron reachable at %ix%i and %i%% Button Size',
  async (width, height, scale) => {
    records.dimensions = { width, height, scale: 1, fontScale: 1 };
    await mountToolbar(toolbarScreen());
    await chooseButtonScale(scale);
    const size = controlSize(scale);
    const portrait = height > width;
    const bar = PALETTE_FLOWS[portrait ? 'row' : 'column'].extentPx;
    const area = {
      width: portrait ? width : width - bar,
      height: portrait ? height - bar : height,
    };
    const canvas = records.props.findLast((props) => props.testID === 'rsd-canvas-area');
    await act(async () => canvas.onLayout({ nativeEvent: { layout: { x: 0, y: 0, ...area } } }));
    // A blank picture fills the paper area the edge controls float over, so every placement
    // below is also a placement on the paper.
    expect(fittedPaper(area, UNADOPTED_PAPER)).toEqual({ left: 0, top: 0, ...area });
    await expandControls();
    const tools = records.props
      .filter((props) => props.testID === 'rsd-drawer-tool')
      .slice(-7)
      .map((props) => flat(props.style))
      .map((style) => rect(style.left, area.height - style.bottom - size, size));
    expect(host.querySelectorAll('[data-testid="rsd-drawer-tool"]')).toHaveLength(7);
    const inset = EDGE_INSET_PX;
    const toggle = rect(inset, area.height - inset - size, size);
    const settings = rect(
      area.width - inset - CORNER_BUTTON_SIZE_PX,
      area.height - inset - CORNER_BUTTON_SIZE_PX,
      CORNER_BUTTON_SIZE_PX
    );
    // Clear docks to the layout, not the paper area: the palette bar sits above the area in
    // portrait and beside it in landscape.
    const dock = clearDock(records.dimensions, 0);
    const clear = rect(
      area.width + CLEAR_DOCK_OVERHANG_PX - dock.size,
      dock.top - (portrait ? bar : 0),
      dock.size
    );
    expect(resolved((props) => props.testID === 'rsd-drawer-dock')).toMatchObject({
      left: inset,
      bottom: inset,
    });
    expect(resolved((props) => props.testID === 'rsd-settings-dock')).toMatchObject({
      right: inset,
      bottom: inset,
    });
    expect(resolved((props) => props.testID === 'rsd-clear-dock')).toMatchObject({
      right: -CLEAR_DOCK_OVERHANG_PX,
      top: dock.top,
    });
    for (const [index, tool] of [toggle, ...tools].entries()) {
      expect(tool.left, `${index}`).toBeGreaterThanOrEqual(0);
      expect(tool.top, `${index}`).toBeGreaterThanOrEqual(0);
      expect(tool.right, `${index}`).toBeLessThanOrEqual(area.width);
      expect(tool.bottom, `${index}`).toBeLessThanOrEqual(area.height);
      expect(overlaps(tool, settings), `${index}`).toBe(false);
      expect(overlaps(tool, clear), `${index}`).toBe(false);
    }
    for (const [index, tool] of tools.entries()) {
      expect(overlaps(tool, toggle), `${index}`).toBe(false);
      for (const other of tools.slice(index + 1)) expect(overlaps(tool, other)).toBe(false);
    }
    expect(drawerOffsets(area, portrait ? 'column' : 'row', 7, size)).toEqual(
      records.props
        .filter((props) => props.testID === 'rsd-drawer-tool')
        .slice(-7)
        .map((props) => ({
          left: flat(props.style).left,
          bottom: flat(props.style).bottom,
        }))
    );
  }
);

it('stops landscape drawer rows short of the normal-size Settings at every Button Size', () => {
  const overreaches = [];
  for (let width = 320; width <= 1366; width++) {
    const settingsLeft = width - EDGE_INSET_PX - TOUCH_TARGET;
    for (let scale = BUTTON_SCALE_MIN; scale <= BUTTON_SCALE_MAX; scale += BUTTON_SCALE_STEP) {
      const size = controlSize(scale);
      const rightmost = Math.max(
        ...drawerOffsets({ width, height: 300 }, 'row', 20, size).map(({ left }) => left)
      );
      if (rightmost + size > settingsLeft - EDGE_INSET_PX)
        overreaches.push(`${scale}% at ${width}px`);
    }
  }
  expect(overreaches).toEqual([]);
});
