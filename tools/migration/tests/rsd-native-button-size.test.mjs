import { caller, records, host, expandControls } from './rsd-native-selection-host.mjs';
import { act } from 'react';
import { expect, it } from 'vitest';
import {
  AI_BUTTON,
  flat,
  mountToolbar,
  outerSize,
  paintLabels,
  resolved,
  toolbarScreen,
} from './rsd-native-toolbar-fixture.mjs';
import {
  actionPanelLayout,
  actionButtonScaleCeiling,
  EDGE_INSET_PX,
} from '../../../src/rsdDrawing/edgeLayout.ts';
import { PALETTE_FLOWS, paletteSlots } from '../../../src/rsdDrawing/paletteGeometry.ts';
import { CORNER_BUTTON_SIZE_PX } from '../../../src/rsdDrawing/RsdIconButton.tsx';
import { CLEAR_DOCK_OVERHANG_PX, clearDock } from '../../../src/clear/clearDock.ts';
import { fittedPaper } from '../../../src/drawing/paperGeometry.ts';
import { UNADOPTED_PAPER } from '../../../src/drawing/paperSpace.ts';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  DEFAULT_BUTTON_SCALE,
} from '../../../src/settings/buttonSize.ts';

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
      outerSize(resolved((props) => props.accessibilityLabel === 'Purple')),
      outerSize(resolved((props) => props.accessibilityLabel === 'Custom Color')),
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

const DRAWER_TOOLS = [
  'Brushes',
  'Stroke width',
  'Coloring books',
  'Save screenshot',
  AI_BUTTON,
  'Undo',
];

function panelLayout(area, scale, open = true) {
  return actionPanelLayout({
    area,
    viewport: records.dimensions,
    scale: scale / 100,
    count: DRAWER_TOOLS.length,
    leg: 2,
    open,
  });
}

it('sizes every drawer tool from Button Size, and keeps the chevron, Clear and Settings apart from it', async () => {
  await mountToolbar(toolbarScreen());
  await expandControls();
  const sizes = () =>
    DRAWER_TOOLS.map((label) => outerSize(resolved((props) => props.accessibilityLabel === label)));
  const chevron = () =>
    outerSize(resolved((props) => props.accessibilityLabel === 'Collapse controls'));
  for (const scale of [DEFAULT_BUTTON_SCALE, BUTTON_SCALE_MAX, BUTTON_SCALE_MIN]) {
    await chooseButtonScale(scale);
    const { size } = panelLayout(records.dimensions, scale);
    expect(sizes(), `${scale}%`).toEqual(DRAWER_TOOLS.map(() => size));
    expect(chevron(), `${scale}%`).toBe(CORNER_BUTTON_SIZE_PX);
    expect(outerSize(resolved((props) => props.accessibilityLabel === 'Settings'))).toBe(
      CORNER_BUTTON_SIZE_PX
    );
  }
  // A 402px-wide phone takes the shipping phone step: 50px in portrait at 100%.
  expect(panelLayout(records.dimensions, DEFAULT_BUTTON_SCALE).size).toBe(50);
  expect(panelLayout(records.dimensions, BUTTON_SCALE_MIN).size).toBe(35);
  expect(panelLayout(records.dimensions, BUTTON_SCALE_MAX).size).toBe(65);
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
    [1366, 1024],
    [1024, 1366],
  ].flatMap(([width, height]) => BUTTON_SCALES.map((scale) => [width, height, scale]))
)(
  'keeps every drawer tool and the chevron reachable at %ix%i and %i%% Button Size',
  async (width, height, scale) => {
    records.dimensions = { width, height, scale: 1, fontScale: 1 };
    await mountToolbar(toolbarScreen());
    await chooseButtonScale(scale);
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
    const layout = panelLayout(area, scale);
    const placed = records.props
      .filter((props) => props.testID === 'rsd-drawer-tool')
      .slice(-DRAWER_TOOLS.length)
      .map((props) => flat(props.style));
    expect(host.querySelectorAll('[data-testid="rsd-drawer-tool"]')).toHaveLength(
      DRAWER_TOOLS.length
    );
    expect(placed.map(({ left, bottom }) => ({ left, bottom }))).toEqual(layout.tools);
    const tools = placed.map((style) =>
      rect(style.left, area.height - style.bottom - layout.size, layout.size)
    );
    const dock = resolved((props) => props.testID === 'rsd-drawer-dock');
    expect(dock).toMatchObject(layout.toggle);
    const toggle = rect(
      dock.left,
      area.height - dock.bottom - CORNER_BUTTON_SIZE_PX,
      CORNER_BUTTON_SIZE_PX
    );
    const inset = EDGE_INSET_PX;
    const settings = rect(
      area.width - inset - CORNER_BUTTON_SIZE_PX,
      area.height - inset - CORNER_BUTTON_SIZE_PX,
      CORNER_BUTTON_SIZE_PX
    );
    // Clear docks to the layout, not the paper area: the palette bar sits above the area in
    // portrait and beside it in landscape.
    const clearAt = clearDock(records.dimensions, 0);
    const clear = rect(
      area.width + CLEAR_DOCK_OVERHANG_PX - clearAt.size,
      clearAt.top - (portrait ? bar : 0),
      clearAt.size
    );
    expect(resolved((props) => props.testID === 'rsd-settings-dock')).toMatchObject({
      right: inset,
      bottom: inset,
    });
    expect(resolved((props) => props.testID === 'rsd-clear-dock')).toMatchObject({
      right: -CLEAR_DOCK_OVERHANG_PX,
      top: clearAt.top,
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
  }
);

it('stops a landscape row, chevron included, short of Settings at every Button Size', () => {
  const overreaches = [];
  for (let width = 800; width <= 1366; width++) {
    const viewport = { width, height: 600 };
    const area = { width: width - PALETTE_FLOWS.column.extentPx, height: 600 };
    const settingsLeft = area.width - EDGE_INSET_PX - CORNER_BUTTON_SIZE_PX;
    for (let scale = BUTTON_SCALE_MIN; scale <= BUTTON_SCALE_MAX; scale++) {
      const { mode, toggle } = actionPanelLayout({
        area,
        viewport,
        scale: scale / 100,
        count: DRAWER_TOOLS.length,
        leg: 2,
        open: true,
      });
      expect(mode).toBe('row');
      if (toggle.left + CORNER_BUTTON_SIZE_PX > settingsLeft - EDGE_INSET_PX)
        overreaches.push(`${scale}% at ${width}px`);
    }
  }
  expect(overreaches).toEqual([]);
});

it.each([
  [{ width: 320, height: 365 }, { width: 320, height: 440 }, 5, 98],
  [{ width: 568, height: 260 }, { width: 568, height: 260 }, 6, 86],
  [{ width: 710, height: 600 }, { width: 800, height: 600 }, 6, 130],
  [{ width: 320, height: 200 }, { width: 320, height: 275 }, 6, 70],
])(
  'caps the Button Size percentage at what this panel can render (%j)',
  (area, viewport, count, expected) => {
    expect(actionButtonScaleCeiling(area, viewport, count)).toBe(expected);
  }
);
