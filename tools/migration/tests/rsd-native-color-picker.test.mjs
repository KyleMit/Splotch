import { records, root, host, mount } from './rsd-native-selection-host.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdColorPicker } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColorPicker.tsx';
import { ModalShell } from '../../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx';
import { DialogHeader } from '../../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx';
import {
  HEX_COLUMN_TRIM_ORDER,
  HEX_DIM_KEYLINE,
  HEX_HOVER_BRIGHTNESS,
  HEX_HOVER_SCALE,
  HEX_KEYLINE_INSET_PX,
  HEX_ROOMY_SCALE,
  HEX_ROW_TRIM_ORDER,
  HEX_SELECTED_INSET_PX,
  HEX_SELECTED_SHADE_PERCENT,
  HEX_SNAP_GAP_SLOP_PX,
  brighten,
  hexagonAt,
  hexagonPoints,
  hexPickerLayout,
  isDiscreteActivation,
  snapHexagon,
} from '../../../experiments/native-architecture/src/rsdDrawing/hexPicker.ts';
import { mixSrgb } from '../../../experiments/native-architecture/src/rsdDrawing/colorMix.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { DRAWING_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { LARGE_TABLET_MIN_SIDE_PX } from '../../../web/src/lib/breakpoints.ts';
import {
  COLOR_FAMILIES,
  LANDSCAPE_ROWS,
  PORTRAIT_ROWS,
} from '../../../web/src/lib/hexPickerLayout.ts';

const shipping = (path) =>
  readFileSync(join(import.meta.dirname, '../../../web/src/lib', path), 'utf8');
const SHIPPING = shipping('components/ColorPicker.svelte');
const SHIPPING_STYLE = SHIPPING.slice(SHIPPING.indexOf('<style>'));
const SHIPPING_GESTURE = shipping('actions/hexSnapGesture.ts');

function hiddenByLadder(axis, prefix) {
  const blocks = [
    ...SHIPPING_STYLE.matchAll(new RegExp(`@media \\(max-${axis}: [\\d.]+px\\) \\{([^@]*)`, 'g')),
  ];
  return blocks.map(([, body]) => {
    const hidden = [...body.matchAll(new RegExp(`\\.${prefix}(\\d)\\s*\\{\\s*display: none`, 'g'))];
    expect(hidden).toHaveLength(1);
    return Number(hidden[0][1]);
  });
}

function center(layout, color) {
  const cell = layout.cells.find((entry) => entry.color === color);
  return { x: cell.x + layout.hexWidth / 2, y: cell.y + layout.hexHeight / 2 };
}

function grid() {
  return records.props.findLast((props) => props.testID === 'color-picker-grid');
}

function fills(color) {
  return [...host.querySelectorAll(`[aria-label="${color}"] polygon`)].map((polygon) =>
    polygon.getAttribute('fill')
  );
}

function picker(props) {
  return createElement(
    DrawingAppearanceProvider,
    { preference: props.appearance ?? 'light' },
    createElement(RsdColorPicker, {
      visible: true,
      customColor: undefined,
      onChoose() {},
      onClose() {},
      ...props,
    })
  );
}

// A touch at a grid-local point, with the grid placed at a page offset as the card would sit.
const PAGE = { x: 300, y: 200 };
function touch(point, identifier = 1) {
  const pageX = PAGE.x + point.x;
  const pageY = PAGE.y + point.y;
  const contact = { identifier, pageX, pageY, locationX: point.x, locationY: point.y };
  return { nativeEvent: { ...contact, touches: [contact], changedTouches: [contact] } };
}

it('reads every ColorPicker.svelte literal the port carries back out of the shipping source', () => {
  expect(hiddenByLadder('height', 'r')).toEqual([...HEX_ROW_TRIM_ORDER]);
  expect(hiddenByLadder('width', 'c')).toEqual([...HEX_COLUMN_TRIM_ORDER]);
  const roomy = SHIPPING_STYLE.match(
    /@media \(min-width: (\d+)px\) and \(min-height: (\d+)px\) \{\s*\.picker \{\s*--hex-scale: ([\d.]+);/
  );
  expect(roomy.slice(1).map(Number)).toEqual([
    LARGE_TABLET_MIN_SIDE_PX,
    LARGE_TABLET_MIN_SIDE_PX,
    HEX_ROOMY_SCALE,
  ]);
  expect(SHIPPING_STYLE).toContain(`--hex-hover-scale: ${HEX_HOVER_SCALE};`);
  expect(SHIPPING_STYLE).toContain(`filter: brightness(${HEX_HOVER_BRIGHTNESS});`);
  expect(SHIPPING_STYLE).toMatch(
    new RegExp(`\\.hexagon\\.border-dim \\{\\s*background-color: ${HEX_DIM_KEYLINE};`)
  );
  expect(SHIPPING_STYLE).toMatch(
    new RegExp(
      `\\.hexagon\\.border::after,\\s*\\.hexagon\\.border-dim::after \\{\\s*inset: ${HEX_KEYLINE_INSET_PX}px;`
    )
  );
  expect(SHIPPING_STYLE).toMatch(
    new RegExp(
      `\\.hexagon\\.selected \\{\\s*z-index: 1;\\s*background-color: color-mix\\(in srgb, var\\(--color\\), black ${HEX_SELECTED_SHADE_PERCENT}%\\);`
    )
  );
  expect(SHIPPING_STYLE).toMatch(
    new RegExp(`\\.hexagon\\.selected::after \\{\\s*inset: ${HEX_SELECTED_INSET_PX}px;`)
  );
  expect(SHIPPING_STYLE).toContain(
    '--hex-clip: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);'
  );
  expect(SHIPPING_GESTURE).toContain(`const HEX_SNAP_GAP_SLOP_PX = ${HEX_SNAP_GAP_SLOP_PX};`);
  expect(SHIPPING).toContain('aria-label="Color Picker"');
  expect(SHIPPING).toContain('if (e.detail === 0) selectColor(hex);');
});

it.each([
  [{ width: 390, height: 844 }, PORTRAIT_ROWS, [1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 9], 302, 509],
  [
    { width: 844, height: 390 },
    LANDSCAPE_ROWS,
    [1, 3, 5, 7, 9],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    602,
    305,
  ],
  [
    { width: 1366, height: 1024 },
    LANDSCAPE_ROWS,
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    773,
    652.1,
  ],
  [{ width: 320, height: 568 }, PORTRAIT_ROWS, [1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 9], 242, 509],
])(
  'lays out the shipping honeycomb for a %o window',
  (window, rows, keptRows, keptColumns, width, height) => {
    const layout = hexPickerLayout(window);
    expect(layout.cells.map((cell) => cell.color)).toEqual(
      keptRows.flatMap((row) => keptColumns.map((column) => rows[row - 1].colors[column - 1]))
    );
    expect(layout.width).toBeCloseTo(width, 6);
    expect(layout.height).toBeCloseTo(height, 6);
    const indents = keptRows.map((_, index) => layout.cells[index * keptColumns.length].x);
    expect(indents.every((x, index) => x === indents[index % 2])).toBe(true);
    expect(indents[1] - indents[0]).toBeCloseTo(layout.hexWidth / 2, 6);
  }
);

it('snaps a press in the gap to the nearest hexagon, and hovers only inside a hexagon', () => {
  const layout = hexPickerLayout({ width: 390, height: 844 });
  const [first] = layout.cells;
  const gap = { x: first.x + 5, y: first.y + 5 };
  expect(hexagonAt(layout, gap.x, gap.y)).toBeNull();
  expect(snapHexagon(layout, gap.x, gap.y)).toBe(first.color);
  expect(snapHexagon(layout, 1, 1)).toBeNull();
  const middle = center(layout, COLOR_FAMILIES[4].shades[4]);
  expect(hexagonAt(layout, middle.x, middle.y)).toBe(COLOR_FAMILIES[4].shades[4]);
  expect(snapHexagon(layout, middle.x + 20, middle.y)).toBe(COLOR_FAMILIES[4].shades[4]);
  expect(hexagonPoints(60, 69, 0, 1)).toBe('30,0 60,17.25 60,51.75 30,69 0,51.75 0,17.25');
  expect(brighten('#2196F3', HEX_HOVER_BRIGHTNESS)).toBe('#28b4ff');
});

it('takes only a pointerless click, as shipping drops the click a pointer press leaves behind', () => {
  expect(isDiscreteActivation({ detail: 0 })).toBe(true);
  expect(isDiscreteActivation({ type: 'click' })).toBe(true);
  expect(isDiscreteActivation({ detail: 1 })).toBe(false);
});

it.each(['light', 'dark'])(
  'renders a wordless card of named hexagon buttons with shipping keylines in %s',
  async (appearance) => {
    records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
    await mount(picker({ appearance, customColor: '#0077B6' }));
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-label')).toBe('Color Picker');
    expect(dialog.textContent).toBe('');
    for (const retired of ['Use color', 'Keep drawing', 'Color explorer'])
      expect(host.querySelector(`[aria-label="${retired}"]`)).toBeNull();
    const layout = hexPickerLayout(records.dimensions);
    expect(
      [...dialog.querySelectorAll('button')].map((node) => node.getAttribute('aria-label'))
    ).toEqual(layout.cells.map((cell) => cell.color));
    const card = records.props.findLast((props) => props.testID === 'color-picker-card').style;
    expect(card).toMatchObject({
      width: layout.width,
      height: layout.height,
      backgroundColor: DRAWING_THEMES[appearance].surface,
      overflow: 'hidden',
    });
    expect(fills('#FFFFFF')).toEqual([DRAWING_THEMES[appearance].iconInk, '#FFFFFF']);
    expect(fills('#1A1F24')).toEqual([HEX_DIM_KEYLINE, '#1A1F24']);
    expect(fills('#0077B6')).toEqual([
      mixSrgb('#0077B6', 100 - HEX_SELECTED_SHADE_PERCENT, '#000000'),
      '#0077B6',
    ]);
    expect(fills('#E63946')).toEqual(['#E63946']);
  }
);

it('highlights the hexagon under a drag and picks it on lift, once', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const onChoose = vi.fn();
  await mount(picker({ onChoose }));
  const layout = hexPickerLayout(records.dimensions);
  const blue = center(layout, '#2196F3');
  const red = center(layout, '#E63946');
  expect(grid().onStartShouldSetResponder(touch({ x: 1, y: 1 }))).toBe(false);
  expect(grid().onStartShouldSetResponder(touch(blue))).toBe(true);
  expect(grid().onResponderTerminationRequest()).toBe(false);
  await act(async () => grid().onResponderGrant(touch(blue)));
  const ink = DRAWING_THEMES.light.iconInk;
  expect(fills('#2196F3')).toEqual([ink, brighten('#2196F3', HEX_HOVER_BRIGHTNESS)]);
  const shrunk = host.querySelectorAll('[aria-label="#2196F3"] polygon')[1].getAttribute('points');
  expect(shrunk).toBe(hexagonPoints(layout.hexWidth, layout.hexHeight, 0, HEX_HOVER_SCALE));
  await act(async () => grid().onResponderMove(touch(red)));
  expect(fills('#2196F3')).toEqual(['#2196F3']);
  expect(fills('#E63946')).toEqual([ink, brighten('#E63946', HEX_HOVER_BRIGHTNESS)]);
  expect(onChoose).not.toHaveBeenCalled();
  await act(async () => grid().onResponderRelease(touch({ x: -400, y: -400 })));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith('#E63946');
  expect(fills('#E63946')).toEqual(['#E63946']);
});

it('cancels a drag the system takes away without picking', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const onChoose = vi.fn();
  await mount(picker({ onChoose }));
  const blue = center(hexPickerLayout(records.dimensions), '#2196F3');
  await act(async () => grid().onResponderGrant(touch(blue)));
  await act(async () => grid().onResponderTerminate());
  expect(fills('#2196F3')).toEqual(['#2196F3']);
  expect(onChoose).not.toHaveBeenCalled();
});

function contact(point, identifier) {
  return {
    identifier,
    pageX: PAGE.x + point.x,
    pageY: PAGE.y + point.y,
    locationX: point.x,
    locationY: point.y,
  };
}
// A responder event for one changed contact while `down` contacts are on the glass.
function event(changed, down) {
  return { nativeEvent: { ...changed, touches: down, changedTouches: [changed] } };
}

it('cancels the pick when a second finger joins, whichever finger lifts last', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const onChoose = vi.fn();
  await mount(picker({ onChoose }));
  const layout = hexPickerLayout(records.dimensions);
  const first = contact(center(layout, '#2196F3'), 1);
  const second = contact(center(layout, '#E63946'), 2);
  expect(grid().onStartShouldSetResponder(event(second, [first, second]))).toBe(false);
  await act(async () => grid().onResponderGrant(event(first, [first])));
  await act(async () => grid().onResponderStart(event(first, [first])));
  expect(fills('#2196F3')).toHaveLength(2);
  await act(async () => grid().onResponderStart(event(second, [first, second])));
  expect(fills('#2196F3')).toEqual(['#2196F3']);
  await act(async () => grid().onResponderMove(event(second, [second])));
  await act(async () => grid().onResponderRelease(event(second, [])));
  expect(onChoose).not.toHaveBeenCalled();
});

it('cancels the pick when the release does not carry the tracked finger', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const onChoose = vi.fn();
  await mount(picker({ onChoose }));
  const layout = hexPickerLayout(records.dimensions);
  const first = contact(center(layout, '#2196F3'), 1);
  await act(async () => grid().onResponderGrant(event(first, [first])));
  await act(async () =>
    grid().onResponderRelease(event(contact(center(layout, '#E63946'), 2), []))
  );
  expect(onChoose).not.toHaveBeenCalled();
  expect(fills('#2196F3')).toEqual(['#2196F3']);
});

it('cancels a drag when the viewport changes under it', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const onChoose = vi.fn();
  await mount(picker({ onChoose }));
  const before = hexPickerLayout(records.dimensions);
  await act(async () => grid().onResponderGrant(touch(center(before, '#2196F3'))));
  records.dimensions = { width: 1000, height: 844, scale: 1, fontScale: 1 };
  await act(async () => root.render(picker({ onChoose })));
  expect(fills('#2196F3')).toEqual(['#2196F3']);
  const red = center(hexPickerLayout(records.dimensions), '#E63946');
  await act(async () => grid().onResponderMove(touch(red)));
  await act(async () => grid().onResponderRelease(touch(red)));
  expect(onChoose).not.toHaveBeenCalled();
});

it('gives each native hexagon and the dialog header controls the button role', async () => {
  await mount(picker({}));
  const hexagon = records.props.findLast((props) => props.accessibilityLabel === '#2196F3');
  expect(hexagon.role).toBe('button');
  await act(async () =>
    root.render(
      createElement(
        ModalShell,
        {
          visible: true,
          label: 'Drawing tools',
          size: 'sheet',
          onClose() {},
          header: createElement(DialogHeader, {
            title: 'Drawing tools',
            titleSize: 'xl',
            onBack() {},
            onClose() {},
          }),
        },
        null
      )
    )
  );
  for (const label of ['Back', 'Close'])
    expect(records.props.findLast((props) => props.accessibilityLabel === label).role).toBe(
      'button'
    );
});

it('picks from a keyboard or screen reader activation, and closes from the scrim and the system Back or Escape without one', async () => {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  await mount(picker({ onChoose, onClose }));
  await act(async () => host.querySelector('[data-testid="modal-backdrop"]').click());
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () =>
    records.props.findLast((props) => 'onRequestClose' in props).onRequestClose()
  );
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(onChoose).not.toHaveBeenCalled();
  await act(async () => host.querySelector('[aria-label="#FFEA00"]').click());
  expect(onChoose).toHaveBeenCalledExactlyOnceWith('#FFEA00');
});

it('grows every hexagon by the roomy factor on a large tablet', async () => {
  records.dimensions = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
  await mount(picker({}));
  const layout = hexPickerLayout(records.dimensions);
  expect(layout.hexWidth).toBeCloseTo(60 * HEX_ROOMY_SCALE, 6);
  expect(layout.snapRadius).toBeCloseTo((69 * HEX_ROOMY_SCALE) / 2 + HEX_SNAP_GAP_SLOP_PX, 6);
  expect(host.querySelectorAll('[role="dialog"] button')).toHaveLength(81);
  await act(async () => root.render(picker({ visible: false })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
