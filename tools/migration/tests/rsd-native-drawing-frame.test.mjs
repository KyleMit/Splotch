import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { caller, records, root, host, mount } from './rsd-native-selection-host.mjs';
import { themes } from '../../../web/src/lib/design/tokens.ts';

import {
  flat,
  mountToolbar,
  paintLabels,
  resolved,
  toolbarScreen,
} from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import {
  MORE_COLORS_POP_SCALE,
  PALETTE_FLOWS,
  SELECTION_RING_GAP_PX,
  SELECTION_RING_SEAM_PX,
  SELECTION_RING_WIDTH_PX,
  SELECTION_SEAM_OVERLAP_PX,
  columnEndClearance,
  paletteSlots,
  selectionRingColor,
} from '../../../experiments/native-architecture/src/rsdDrawing/paletteGeometry.ts';
import { RsdPaintAction } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSwatch.tsx';
import {
  CORNER_BUTTON_SIZE_PX,
  CORNER_IDLE_OPACITY,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import {
  PALETTE_COLORS,
  paintAppearance,
} from '../../../experiments/native-architecture/src/drawing/palette.ts';
import {
  DRAWING_THEMES,
  TOUCH_TARGET,
} from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { actionPanelLayout } from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import { getRingColor } from '../../../web/src/lib/colorRing.ts';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');
const PALETTE_OCCUPANCY_INTERVALS = [
  {
    axis: 'row',
    intervals: [
      [120, 137, 0],
      [138, 200, 1],
      [201, 263, 2],
      [264, 326, 3],
      [327, 389, 4],
      [390, 452, 5],
      [453, 515, 6],
      [516, 578, 7],
      [579, 641, 8],
      [642, 704, 9],
      [705, 767, 10],
      [768, 830, 11],
      [831, 893, 12],
      [894, 956, 13],
      [957, 1019, 14],
      [1020, 1100, 15],
    ],
  },
  {
    axis: 'column',
    intervals: [
      [600, 659, 7],
      [660, 731, 8],
      [732, 803, 9],
      [804, 875, 10],
      [876, 947, 11],
      [948, 1019, 12],
      [1020, 1091, 13],
      [1092, 1163, 14],
      [1164, 1240, 15],
    ],
  },
];

describe('the shipping palette geometry', () => {
  it('sizes, spaces and pads both flows as trimGeometry.ts and ColorPalette.svelte do', () => {
    expect(PALETTE_FLOWS.column).toMatchObject({ swatchPx: 60, gapPx: 12, endPaddingPx: 12 });
    const trim = read('web/src/lib/design/trimGeometry.ts');
    for (const [axis, name] of [['row', 'PALETTE_ROW_GEOMETRY']]) {
      const body = new RegExp(`${name}[^{]*\\{([^}]*)\\}`).exec(trim)[1];
      const value = (key) => Number(new RegExp(`${key}: (\\d+)`).exec(body)[1]);
      const flow = PALETTE_FLOWS[axis];
      expect(flow.swatchPx, axis).toBe(value('swatchPx'));
      expect(flow.gapPx, axis).toBe(value('gapPx'));
      expect(2 * flow.endPaddingPx, axis).toBe(value('paddingPx'));
    }
  });

  it.each([
    { buttonPx: 60, bottomInsetPx: 20, clearancePx: 28 },
    { buttonPx: 72, bottomInsetPx: 0, clearancePx: 14 },
    { buttonPx: 44, bottomInsetPx: 34, clearancePx: 34 },
    { buttonPx: 20, bottomInsetPx: 0, clearancePx: 0 },
  ])(
    'pads the column end by $clearancePx pixels for a $buttonPx pixel button over a $bottomInsetPx pixel inset',
    ({ buttonPx, bottomInsetPx, clearancePx }) => {
      expect(columnEndClearance(buttonPx, bottomInsetPx)).toBe(clearancePx);
    }
  );

  it.each(PALETTE_OCCUPANCY_INTERVALS)(
    'shows the expected paint occupancy along a $axis at every length',
    ({ axis, intervals }) => {
      expect(PALETTE_COLORS).toHaveLength(15);
      for (const [from, to, paints] of intervals)
        for (let length = from; length <= to; length++)
          expect(
            Math.min(PALETTE_COLORS.length, paletteSlots(length, axis) - 1),
            `${axis} ${length}px`
          ).toBe(paints);
    }
  );

  it('keeps the swatch press, the More colors pop and the Selection Ring widths', () => {
    expect(SELECTION_RING_WIDTH_PX).toBe(4);
    expect(SELECTION_RING_GAP_PX).toBe(4);
  });

  it('rings each paint in the shipping Selection Ring color in both themes', () => {
    const custom = ['#000000', '#FFFFFF', '#123456', '#33CC99', '#2B2B2B'];
    for (const theme of ['light', 'dark'])
      for (const color of [...PALETTE_COLORS.map(({ label }) => label), ...custom]) {
        const { hex } = paintAppearance(color, theme);
        expect(selectionRingColor(hex), `${color} ${theme}`).toBe(getRingColor(hex));
      }
  });

  it('bundles the shipping handmade-paper grain byte for byte', () => {
    const bundled = readFileSync(
      join(REPOSITORY, 'experiments/native-architecture/assets/paper/handmade-paper.webp')
    );

    expect(
      bundled.equals(readFileSync(join(REPOSITORY, 'web/static/icons/handmade-paper.webp')))
    ).toBe(true);
  });
});

function viewport(width, height) {
  records.dimensions = { width, height, scale: 1, fontScale: 1 };
}

// The light theme's --float-shadow, as React Native writes it.
const SHIPPING_LIGHT_FLOAT_SHADOW = themes.light.floatShadow.replace(
  /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
  (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
);

// A landscape phone shows no bar at all; rsd-native-color-control.test.mjs covers its Color Button.
const LAYOUTS = [
  [390, 844, 'row'],
  [1024, 768, 'column'],
  [1366, 1024, 'column'],
];

function flatStyle(style) {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean).map(flatStyle))
    : (style ?? {});
}

// The boxes the last render drew, by their resolved style.
function drawn(predicate) {
  return records.props.map((entry) => flatStyle(entry.style)).filter(predicate);
}

it('renders paint as a raised round swatch with its name, the shipping Selection Ring and actual color', async () => {
  const onClick = vi.fn();
  const blue = '#62A2E9';
  const ring = selectionRingColor(blue);
  const surface = '#ffffff';
  const swatchStyle = () =>
    flatStyle(records.props.findLast((entry) => entry.accessibilityLabel === 'Blue').style);
  const render = async (selected) => {
    records.props.length = 0;
    const element = createElement(RsdPaintAction, {
      color: 'Blue',
      size: TOUCH_TARGET,
      disabled: false,
      selected,
      onClick,
    });
    if (!root) await mount(element);
    else await act(async () => root.render(element));
  };
  await render(true);
  const props = records.props.findLast((entry) => entry.accessibilityLabel === 'Blue');
  expect(props.accessibilityState.checked).toBeUndefined();
  expect(props.accessibilityState.selected).toBeUndefined();
  expect(swatchStyle()).toMatchObject({
    boxSizing: 'border-box',
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: surface,
  });
  // The float shadow hangs from a box of its own, the swatch's size: React Native's iOS view paints
  // its own box shadow over the children that overhang it, as the seam and ring do.
  expect(swatchStyle().boxShadow).toBeUndefined();
  expect(drawn((style) => style.boxShadow != null)).toEqual([
    expect.objectContaining({
      position: 'absolute',
      top: 0,
      left: 0,
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: TOUCH_TARGET / 2,
      boxShadow: SHIPPING_LIGHT_FLOAT_SHADOW,
    }),
  ]);
  const inner = TOUCH_TARGET - 2 * SELECTION_RING_GAP_PX;
  expect(drawn((style) => style.backgroundColor === blue)).toEqual([
    expect.objectContaining({ width: inner, height: inner, borderRadius: inner / 2 }),
  ]);
  // The ring's visible band, the shipping 4px spread less the 1px seam, comes from one box.
  expect(drawn((style) => style.borderColor === ring)).toEqual([
    expect.objectContaining({
      position: 'absolute',
      top: -SELECTION_RING_WIDTH_PX,
      width: TOUCH_TARGET + 2 * SELECTION_RING_WIDTH_PX,
      borderWidth: SELECTION_RING_WIDTH_PX - SELECTION_RING_SEAM_PX,
    }),
  ]);
  const seamReach = SELECTION_RING_SEAM_PX + SELECTION_SEAM_OVERLAP_PX;
  expect(drawn((style) => style.borderColor === surface && style.position === 'absolute')).toEqual([
    expect.objectContaining({
      top: -seamReach,
      width: TOUCH_TARGET + 2 * seamReach,
      borderWidth: SELECTION_RING_SEAM_PX + 2 * SELECTION_SEAM_OVERLAP_PX,
    }),
  ]);
  // Seam and ring snap to the pixel grid as separate circles, about a pixel apart on Android's
  // fractional densities. Negative control: a seam drawn over a 4px ring and sharing its inner
  // edge bares that edge as a second arc on one side, and fails the ordering and reach below.
  // The shadow's box comes first, so both draw over its shadow; negative control: the shadow back
  // on the swatch, or its box after the ring.
  const styles = records.props.map((entry) => flatStyle(entry.style));
  const liftAt = styles.findIndex((style) => style.boxShadow != null);
  const seamAt = styles.findIndex((style) => style.borderColor === surface && style.position);
  const ringAt = styles.findIndex((style) => style.borderColor === ring);
  expect(liftAt).toBeGreaterThanOrEqual(0);
  expect(liftAt).toBeLessThan(seamAt);
  expect(seamAt).toBeLessThan(ringAt);
  const edge = TOUCH_TARGET / 2;
  const band = (style) => {
    const outer = style.width / 2;
    return { outer, inner: outer - style.borderWidth };
  };
  const [seam, ringBand] = [band(styles[seamAt]), band(styles[ringAt])];
  expect(ringBand.inner - edge).toBe(SELECTION_RING_SEAM_PX);
  expect(seam.outer - ringBand.inner).toBeGreaterThanOrEqual(SELECTION_SEAM_OVERLAP_PX);
  expect(edge - seam.inner).toBeGreaterThanOrEqual(SELECTION_SEAM_OVERLAP_PX);
  expect(seam.inner).toBeGreaterThan(inner / 2);
  expect(SELECTION_SEAM_OVERLAP_PX).toBeGreaterThanOrEqual(1);
  const selectedNode = host.querySelector('button');
  expect(selectedNode.getAttribute('role')).toBe('button');
  expect(selectedNode.getAttribute('aria-label')).toBe('Blue');
  expect(selectedNode.textContent).toBe('');
  await act(async () => selectedNode.click());
  expect(onClick).toHaveBeenCalledOnce();
  await render(false);
  const unselectedNode = host.querySelector('button');
  expect(unselectedNode).toBe(selectedNode);
  expect(unselectedNode.dataset.checked).toBeUndefined();
  expect(swatchStyle().backgroundColor).toBe(blue);
  expect(drawn((style) => style.borderColor === ring)).toEqual([]);
  expect(drawn((style) => style.position === 'absolute')).toEqual([
    expect.objectContaining({ width: TOUCH_TARGET, boxShadow: SHIPPING_LIGHT_FLOAT_SHADOW }),
  ]);
});

describe('the mounted drawing screen frame', () => {
  it.each(LAYOUTS)(
    'trims the palette at %ix%i to the paints that fit at full size',
    async (width, height, axis) => {
      viewport(width, height);
      await mountToolbar(toolbarScreen());
      const length = axis === 'row' ? width : height;
      expect(paintLabels()).toHaveLength(paletteSlots(length, axis) - 1);
      for (const label of [...paintLabels(), 'Custom Color'])
        expect(
          resolved((props) => props.accessibilityLabel === label),
          label
        ).toMatchObject({
          width: PALETTE_FLOWS[axis].swatchPx,
          height: PALETTE_FLOWS[axis].swatchPx,
        });
      const plate = resolved((props) => props.testID === 'rsd-palette-plate');
      // The web style compiler logs an error for every undefined value it is handed, each render.
      // Negative control: a plate that declares the extent it does not use fails here.
      expect(
        Object.entries(plate)
          .filter(([, value]) => value === undefined)
          .map(([key]) => key)
      ).toEqual([]);
      expect(plate).toMatchObject({
        backgroundColor: DRAWING_THEMES.light.surface,
        boxShadow: PALETTE_FLOWS[axis].shadow,
        [axis === 'row' ? 'height' : 'width']: PALETTE_FLOWS[axis].extentPx,
      });
    }
  );

  // The bottom inset alone comes out of the column's trim length: shipping's last swatch overruns
  // into the home indicator there, and More colors never trims.
  it('trims by the viewport less the bottom inset, not a bar an inset shortened, and clips the overrun', async () => {
    // An iPad Pro 11-inch on iPadOS 26: its 32px status bar shortens the bar past the flow.
    const [width, height, insetTop, insetBottom] = [1210, 834, 32, 20];
    viewport(width, height);
    records.insets = { top: insetTop, right: 0, bottom: insetBottom, left: 0 };
    await mountToolbar(toolbarScreen());
    const bar = records.props.findLast((props) => props.testID === 'rsd-palette-bar');
    const shortened = height - insetTop - insetBottom;
    await act(async () =>
      bar.onLayout({ nativeEvent: { layout: { width: 84, height: shortened } } })
    );
    expect(paintLabels()).toHaveLength(10);
    // The overrun keeps every swatch whole at the shipping gap: the paint group never shrinks to
    // slide More colors over the last paint. Negative control: a shrinkable group fails here.
    expect(resolved((props) => props.testID === 'rsd-palette-plate')).toMatchObject({
      overflow: 'hidden',
      gap: PALETTE_FLOWS.column.gapPx,
    });
    expect(resolved((props) => props.testID === 'rsd-palette-paints')).toMatchObject({
      flexShrink: 0,
      gap: PALETTE_FLOWS.column.gapPx,
    });
  });

  // Negative control: a column that stops its plate at the inset and continues in a separate
  // strip shows a seam where the strip's shadow meets the plate, and pads More colors off the
  // Brush Button's centre line.
  it('runs the landscape column plate to the screen edge, centring More colors on the Brush Button', async () => {
    const [width, height, insetBottom, buttonScale] = [1180, 820, 34, 130];
    viewport(width, height);
    records.insets = { top: 0, right: 0, bottom: insetBottom, left: 0 };
    await mountToolbar(toolbarScreen());
    // Button Size goes through the real settings owner, as the Settings stepper sends it.
    await act(async () => caller.product.sound.owner.settings.setButtonScale(buttonScale));
    // The records keep every render's props; the plate is read from one render of the settled
    // screen, after the AI allowance check and the panel's size report have re-rendered it.
    records.props.length = 0;
    await act(async () => root.render(createElement(RsdDrawingScreen)));
    expect(
      drawn(
        (style) =>
          style.height === insetBottom && style.backgroundColor === DRAWING_THEMES.light.surface
      )
    ).toEqual([]);
    // The six drawer tools of the toolbar fixture, at Button Size 130%.
    const { size } = actionPanelLayout({
      area: { width, height: height - insetBottom },
      viewport: { width, height },
      scale: buttonScale / 100,
      count: 6,
      leg: 2,
      open: false,
      bottomInset: insetBottom,
    });
    expect(size).not.toBe(PALETTE_FLOWS.column.swatchPx);
    expect(resolved((props) => props.testID === 'rsd-palette-plate')).toMatchObject({
      paddingTop: PALETTE_FLOWS.column.endPaddingPx,
      paddingBottom: columnEndClearance(size, insetBottom),
      overflow: 'hidden',
    });
  });

  it('sits More colors on a raised disc of the bar surface, its honeycomb inside the ring band', async () => {
    await mountToolbar(toolbarScreen());
    const more = resolved((props) => props.accessibilityLabel === 'Custom Color');
    expect(more.backgroundColor).toBe(DRAWING_THEMES.light.surface);
    expect(more.boxShadow).toBeUndefined();
    const custom = host.querySelector('[aria-label="Custom Color"]');
    expect(custom.firstElementChild.tagName).toBe('DIV');
    expect(
      records.props
        .map((props) => flat(props.style) ?? {})
        .filter((style) => style.boxShadow === SHIPPING_LIGHT_FLOAT_SHADOW)
        .map(({ width }) => width)
    ).toContain(PALETTE_FLOWS.row.swatchPx);
    expect(more.borderRadius).toBe(PALETTE_FLOWS.row.swatchPx / 2);
    const icon = host.querySelector('[aria-label="Custom Color"] svg');
    expect(Number(icon.getAttribute('width'))).toBeCloseTo(
      (PALETTE_FLOWS.row.swatchPx - 2 * SELECTION_RING_GAP_PX) / MORE_COLORS_POP_SCALE
    );
  });

  it('draws the shipping Selection Ring on the loaded paint only, with no outline on light paints', async () => {
    await mountToolbar(toolbarScreen());
    records.props.length = 0;
    await act(async () => root.render(createElement(RsdDrawingScreen)));
    const ringed = () =>
      records.props
        .map((props) => flat(props.style) ?? {})
        .filter(
          (style) =>
            style.position === 'absolute' &&
            style.top === -SELECTION_RING_WIDTH_PX &&
            style.borderWidth === SELECTION_RING_WIDTH_PX - SELECTION_RING_SEAM_PX
        );
    expect(ringed().map((style) => style.borderColor)).toEqual([
      selectionRingColor(paintAppearance('Purple', 'light').hex),
    ]);
    records.props.length = 0;
    await act(async () => host.querySelector('[aria-label="Yellow"]').click());
    caller.sound.settings = { ...caller.sound.settings, selectedColor: 'Yellow' };
    await act(async () => root.render(createElement(RsdDrawingScreen)));
    const yellow = paintAppearance('Yellow', 'light').hex;
    expect(ringed().map((style) => style.borderColor)).toContain(selectionRingColor(yellow));
    const outlined = records.props
      .map((props) => flat(props.style) ?? {})
      .filter((style) => style.borderWidth === 1 && style.position !== 'absolute');
    expect(outlined).toEqual([]);
  });

  it('puts Settings in the muted transparent corner skin rather than a raised tile', async () => {
    await mountToolbar(toolbarScreen());
    const settings = resolved((props) => props.accessibilityLabel === 'Settings');
    expect(settings).toMatchObject({
      width: CORNER_BUTTON_SIZE_PX,
      height: CORNER_BUTTON_SIZE_PX,
      backgroundColor: 'transparent',
      opacity: CORNER_IDLE_OPACITY,
      borderWidth: 0,
    });
    expect(settings.boxShadow).toBeUndefined();
    await act(async () => host.querySelector('[aria-label="Settings"]').click());
    expect(caller.screen.openSettings).toHaveBeenCalledOnce();
  });

  it('textures the full-bleed paper area, and gives a rotated sheet a flat margin instead', async () => {
    await mountToolbar(toolbarScreen());
    const slot = () => records.props.findLast((props) => props.testID === 'rsd-paper-slot');
    const texture = () =>
      host.querySelector('[data-testid="rsd-paper-slot"] > [data-testid="paper-texture"]');
    expect(texture()).not.toBeNull();
    expect(
      flat(records.props.findLast((props) => props.testID === 'paper-texture').style)
    ).toMatchObject({ position: 'absolute', backgroundColor: DRAWING_THEMES.light.paper });
    const grain = records.props.findLast((props) => props.resizeMode === 'repeat');
    expect(grain.source).toBeTruthy();
    await act(async () =>
      records.props
        .findLast((props) => props.testID === 'rsd-canvas-area')
        .onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 800, height: 400 } } })
    );
    expect(texture()).not.toBeNull();
    caller.screen = {
      ...caller.screen,
      history: {
        ...caller.screen.history,
        drawing: {
          ...emptyDrawing(),
          paper: { kind: 'adopted', cssWidth: 390, cssHeight: 704, backingScale: 2 },
        },
      },
    };
    await act(async () => root.render(createElement(RsdDrawingScreen)));
    expect(texture()).toBeNull();
    expect(flat(slot().style).backgroundColor).toBe(DRAWING_THEMES.light.paperMargin);
    // The sheet the contain fit centers in the slot lifts on the float shadow.
    const lift = flat(records.props.findLast((props) => props.testID === 'rsd-paper-lift').style);
    expect(lift.position).toBe('absolute');
    expect(lift.top).toBeCloseTo(0);
    expect(lift.height).toBeCloseTo(400);
    expect(lift.width).toBeCloseTo((390 / 704) * 400);
    expect(lift.boxShadow).toBeTruthy();
  });
});
