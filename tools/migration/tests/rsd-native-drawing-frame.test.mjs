import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { caller, records, root, host, mount } from './rsd-native-selection-host.mjs';

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
  SELECTION_RING_WIDTH_PX,
  paletteSlots,
  selectionRingColor,
} from '../../../experiments/native-architecture/src/rsdDrawing/paletteGeometry.ts';
import {
  RsdPaintAction,
  SWATCH_PRESS_SCALE,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdSwatch.tsx';
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
import {
  SELECTION_RING_GAP_PX as SHIPPING_RING_GAP_PX,
  SELECTION_RING_WIDTH_PX as SHIPPING_RING_WIDTH_PX,
  getRingColor,
} from '../../../web/src/lib/colorRing.ts';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');
const styleBlock = (path) =>
  /<style>([\s\S]*)<\/style>/.exec(read(path))[1].replace(/\/\*[\s\S]*?\*\//g, '');
const PALETTE_STYLE = styleBlock('web/src/lib/components/ColorPalette.svelte');
const SWATCH_STYLE = styleBlock('web/src/lib/components/ColorSwatch.svelte');
const APP_CSS = read('web/src/app.css');

// The shipping trim ladder as written: each `@media` rule hides one trim rank below its threshold.
function shippingLadder(feature) {
  const pattern = new RegExp(
    `@media \\(orientation: \\w+\\)(?: and \\(min-height: 600px\\))? and \\(${feature}: ([\\d.]+)px\\) \\{\\s*\\.color-palette > :global\\(\\.color-swatch\\[data-trim-rank='(\\d+)'\\]\\)`,
    'g'
  );
  return [...PALETTE_STYLE.matchAll(pattern)].map(([, threshold, rank]) => ({
    threshold: Number(threshold),
    rank: Number(rank),
  }));
}

function shippingPaintCount(ladder, length) {
  return PALETTE_COLORS.length - ladder.filter(({ threshold }) => length <= threshold).length;
}

// The released rgba spelling of a shipping `rgb(r g b / a%)` shadow.
function rgbaShadow(shadow) {
  return shadow.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );
}

function declaration(css, property) {
  const values = [...css.matchAll(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`, 'g'))];
  return values.map(([, value]) => value.replace(/\s+/g, ' ').trim());
}

describe('the shipping palette geometry', () => {
  it('sizes, spaces and pads both flows as trimGeometry.ts and ColorPalette.svelte do', () => {
    const trim = read('web/src/lib/design/trimGeometry.ts');
    for (const [axis, name] of [
      ['row', 'PALETTE_ROW_GEOMETRY'],
      ['column', 'PALETTE_COLUMN_GEOMETRY'],
    ]) {
      const body = new RegExp(`${name}[^{]*\\{([^}]*)\\}`).exec(trim)[1];
      const value = (key) => Number(new RegExp(`${key}: (\\d+)`).exec(body)[1]);
      const flow = PALETTE_FLOWS[axis];
      expect(flow.swatchPx, axis).toBe(value('swatchPx'));
      expect(flow.gapPx, axis).toBe(value('gapPx'));
      expect(2 * flow.endPaddingPx, axis).toBe(value('paddingPx'));
    }
    expect(declaration(PALETTE_STYLE, 'padding')).toEqual(
      expect.arrayContaining([
        `${PALETTE_FLOWS.row.crossStartPaddingPx}px ${PALETTE_FLOWS.row.endPaddingPx}px ${PALETTE_FLOWS.row.crossEndPaddingPx}px`,
      ])
    );
    expect(APP_CSS).toContain(`--palette-portrait-height: ${PALETTE_FLOWS.row.extentPx}px;`);
    expect(APP_CSS).toContain(`--palette-landscape-width: ${PALETTE_FLOWS.column.extentPx}px;`);
    const shadows = declaration(PALETTE_STYLE, 'box-shadow').filter((shadow) =>
      shadow.includes('10px')
    );
    expect(shadows.map(rgbaShadow)).toEqual([
      PALETTE_FLOWS.column.shadow,
      PALETTE_FLOWS.row.shadow,
    ]);
  });

  it('keeps the swatch press, the More colors pop and the Selection Ring widths', () => {
    expect(declaration(SWATCH_STYLE, 'width')).toEqual(
      expect.arrayContaining([
        `${PALETTE_FLOWS.column.swatchPx}px`,
        `${PALETTE_FLOWS.row.swatchPx}px`,
      ])
    );
    expect(declaration(SWATCH_STYLE, 'transform')).toContain(`scale(${SWATCH_PRESS_SCALE})`);
    expect(declaration(SWATCH_STYLE, '--pop-scale')).toEqual([`${MORE_COLORS_POP_SCALE}`]);
    expect(SELECTION_RING_WIDTH_PX).toBe(SHIPPING_RING_WIDTH_PX);
    expect(SELECTION_RING_GAP_PX).toBe(SHIPPING_RING_GAP_PX);
  });

  it.each([
    ['row', 'max-width', 120, 1100],
    ['column', 'max-height', 600, 1240],
  ])(
    'shows as many paints along a %s as the shipping %s ladder at every length',
    (axis, feature, from, to) => {
      const ladder = shippingLadder(feature);
      expect(ladder).toHaveLength(axis === 'row' ? PALETTE_COLORS.length : 8);
      const drift = [];
      for (let length = from; length <= to; length++) {
        const native = Math.min(PALETTE_COLORS.length, paletteSlots(length, axis) - 1);
        if (native !== shippingPaintCount(ladder, length))
          drift.push(`${length}px: ${native} vs ${shippingPaintCount(ladder, length)}`);
      }
      expect(drift).toEqual([]);
    }
  );

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
      bundled.equals(readFileSync(join(REPOSITORY, 'web/src/lib/assets/handmade-paper.webp')))
    ).toBe(true);
    expect(
      bundled.equals(readFileSync(join(REPOSITORY, 'web/static/icons/handmade-paper.webp')))
    ).toBe(true);
  });
});

function viewport(width, height) {
  records.dimensions = { width, height, scale: 1, fontScale: 1 };
}

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
    flatStyle(records.props.findLast((entry) => entry.accessibilityLabel === 'Blue paint').style);
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
  const props = records.props.findLast((entry) => entry.accessibilityLabel === 'Blue paint');
  expect(props.accessibilityState.checked).toBe(true);
  expect(swatchStyle()).toMatchObject({
    boxSizing: 'border-box',
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: surface,
  });
  expect(swatchStyle().boxShadow).toBeTruthy();
  const inner = TOUCH_TARGET - 2 * SELECTION_RING_GAP_PX;
  expect(drawn((style) => style.backgroundColor === blue)).toEqual([
    expect.objectContaining({ width: inner, height: inner, borderRadius: inner / 2 }),
  ]);
  expect(drawn((style) => style.borderColor === ring)).toEqual([
    expect.objectContaining({
      position: 'absolute',
      top: -SELECTION_RING_WIDTH_PX,
      width: TOUCH_TARGET + 2 * SELECTION_RING_WIDTH_PX,
      borderWidth: SELECTION_RING_WIDTH_PX,
    }),
  ]);
  expect(drawn((style) => style.borderColor === surface && style.borderWidth === 1)).toEqual([
    expect.objectContaining({ position: 'absolute', top: -1, width: TOUCH_TARGET + 2 }),
  ]);
  const selectedNode = host.querySelector('button');
  expect(selectedNode.getAttribute('role')).toBe('radio');
  expect(selectedNode.getAttribute('aria-label')).toBe('Blue paint');
  expect(selectedNode.textContent).toBe('');
  await act(async () => selectedNode.click());
  expect(onClick).toHaveBeenCalledOnce();
  await render(false);
  const unselectedNode = host.querySelector('button');
  expect(unselectedNode).toBe(selectedNode);
  expect(unselectedNode.dataset.checked).toBe('false');
  expect(swatchStyle().backgroundColor).toBe(blue);
  expect(drawn((style) => style.borderColor === ring)).toEqual([]);
  expect(drawn((style) => style.position === 'absolute')).toEqual([]);
});

describe('the mounted drawing screen frame', () => {
  it.each(LAYOUTS)(
    'trims the palette at %ix%i to the paints that fit at full size',
    async (width, height, axis) => {
      viewport(width, height);
      await mountToolbar(toolbarScreen());
      const length = axis === 'row' ? width : height;
      expect(paintLabels()).toHaveLength(paletteSlots(length, axis) - 1);
      for (const label of [...paintLabels(), 'More colors'])
        expect(
          resolved((props) => props.accessibilityLabel === label),
          label
        ).toMatchObject({
          width: PALETTE_FLOWS[axis].swatchPx,
          height: PALETTE_FLOWS[axis].swatchPx,
        });
      const plate = resolved((props) => props.testID === 'rsd-palette-plate');
      expect(plate).toMatchObject({
        backgroundColor: DRAWING_THEMES.light.surface,
        boxShadow: PALETTE_FLOWS[axis].shadow,
        [axis === 'row' ? 'height' : 'width']: PALETTE_FLOWS[axis].extentPx,
      });
    }
  );

  it('trims by the viewport, not a bar an inset shortened, and clips the overrun', async () => {
    const [width, height, insetTop, insetBottom] = [1180, 820, 24, 20];
    viewport(width, height);
    await mountToolbar(toolbarScreen());
    const bar = records.props.findLast((props) => props.testID === 'rsd-palette-bar');
    const shortened = height - insetTop - insetBottom;
    await act(async () =>
      bar.onLayout({ nativeEvent: { layout: { width: 84, height: shortened } } })
    );
    expect(paintLabels()).toHaveLength(shippingPaintCount(shippingLadder('max-height'), height));
    expect(paintLabels()).toContain('Brown paint');
    expect(resolved((props) => props.testID === 'rsd-palette-plate')).toMatchObject({
      overflow: 'hidden',
    });
  });

  it('sits More colors on a raised disc of the bar surface, its honeycomb inside the ring band', async () => {
    await mountToolbar(toolbarScreen());
    const more = resolved((props) => props.accessibilityLabel === 'More colors');
    expect(more.backgroundColor).toBe(DRAWING_THEMES.light.surface);
    expect(more.boxShadow).toBeTruthy();
    expect(more.borderRadius).toBe(PALETTE_FLOWS.row.swatchPx / 2);
    const icon = host.querySelector('[aria-label="More colors"] svg');
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
          (style) => style.position === 'absolute' && style.borderWidth === SELECTION_RING_WIDTH_PX
        );
    expect(ringed().map((style) => style.borderColor)).toEqual([
      selectionRingColor(paintAppearance('Purple', 'light').hex),
    ]);
    records.props.length = 0;
    await act(async () => host.querySelector('[aria-label="Yellow paint"]').click());
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
      slot().onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } })
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
