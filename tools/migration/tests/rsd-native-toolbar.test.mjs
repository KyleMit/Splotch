import {
  caller,
  records,
  root,
  host,
  mount,
  expandControls,
} from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { NativeDrawingLayout } from '../../../experiments/native-architecture/src/rsdDrawing/NativeScrollAreas.tsx';
import {
  drawerOffsets,
  EDGE_INSET_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import { fittedPaper } from '../../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import {
  paletteSlots,
  swatchEdge,
} from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  PALETTE_COLORS,
  PALETTE_TRIM_ORDER,
  paletteHex,
  visiblePaints,
} from '../../../experiments/native-architecture/src/drawing/palette.ts';
import {
  DRAWING_THEME,
  TOUCH_TARGET,
} from '../../../experiments/native-architecture/src/drawing/theme.ts';

const PURPLE = paletteHex('Purple');

function toolbarScreen(overrides = {}) {
  return {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'crayon',
    brushControl: { kind: 'menu', brushes: ['pen', 'crayon'] },
    availableBrushes: ['pen', 'crayon'],
    history: { undo: [emptyDrawing()], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    undo: vi.fn(),
    clear: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    setPagePickerOpen: vi.fn(),
    openSettings: vi.fn(),
    openColorPicker: vi.fn(),
    toggleBrush: vi.fn(),
    selectInkBrush: vi.fn(),
    ...overrides,
  };
}

async function mountToolbar(screen) {
  caller.screen = screen;
  caller.menu = { open: false, visible: false, show: vi.fn() };
  caller.sound = {
    settings: {
      status: 'ready',
      soundEnabled: false,
      appearance: 'light',
      selectedColor: 'Purple',
      customColors: [],
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      aiEnabled: true,
    },
  };
  await mount(createElement(RsdDrawingScreen));
}

function button(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

// A finger only drags Clear; the assistive activation is its one non-drag path.
function clearProps() {
  return records.props.findLast((props) => props.accessibilityLabel === 'Clear');
}

function activateClear() {
  clearProps().onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
}

function iconMarkup(node) {
  const icon = node.querySelector('svg[data-xml]');
  expect(icon, node.getAttribute('aria-label')).not.toBeNull();
  return icon.dataset.xml;
}

it('renders every toolbar action as a named icon button that calls its owner', async () => {
  await mountToolbar(toolbarScreen());
  await expandControls();
  const openParentCenter = vi.spyOn(caller.product.owner, 'openParentCenter');
  const openAi = vi.spyOn(caller.product.ai.owner, 'open').mockImplementation(() => {});
  const actions = [
    ['Brush: Crayon', 'brush-crayon', () => caller.menu.show],
    ['Coloring pages', 'shapes', () => caller.screen.setPagePickerOpen],
    ['Save picture', 'camera', () => caller.screen.save],
    ['AI picture', 'wand-stars', () => openAi],
    ['Undo', 'undo', () => caller.screen.undo],
    ['Clear', 'trash-closed', () => caller.screen.clear],
    ['Drawing tools', 'controls', () => caller.menu.show],
    ['Settings', 'settings', () => caller.screen.openSettings],
    ['Parent Center', 'parent-center', () => openParentCenter],
  ];
  for (const [label, icon, handler] of actions) {
    const node = button(label);
    expect(node.textContent, label).toBe('');
    const ink = icon === 'brush-crayon' ? PURPLE : DRAWING_THEME.iconInk;
    expect(iconMarkup(node), label).toBe(NATIVE_ICONS[icon].light.replaceAll('currentColor', ink));
    const before = handler().mock.calls.length;
    await act(async () => (label === 'Clear' ? activateClear() : node.click()));
    expect(handler().mock.calls.length, label).toBe(before + 1);
  }
  expect(caller.screen.setPagePickerOpen).toHaveBeenCalledWith(true);
  expect(NATIVE_ICONS['brush-crayon'].light).toContain('currentColor');
  expect(NATIVE_ICONS.settings.light).toContain('currentColor');
});

it('keeps the toolbar disabled boundary and the lone optional brush switch', async () => {
  await mountToolbar(
    toolbarScreen({
      disabled: true,
      brush: 'pen',
      brushControl: { kind: 'toggle', brush: 'eraser' },
    })
  );
  await expandControls();
  const eraser = button('Eraser');
  expect(eraser.getAttribute('role')).toBe('switch');
  expect(eraser.dataset.checked).toBe('false');
  expect(iconMarkup(eraser)).toBe(NATIVE_ICONS['brush-eraser'].light);
  expect(button('Clear')).not.toBeNull();
  expect(clearProps().accessibilityState.disabled).toBe(true);
  await act(async () => activateClear());
  for (const label of ['Eraser', 'Save picture', 'Settings', 'Undo', 'Drawing tools']) {
    const node = button(label);
    expect(node.disabled, label).toBe(true);
    await act(async () => node.click());
  }
  expect(caller.screen.toggleBrush).not.toHaveBeenCalled();
  expect(caller.screen.clear).not.toHaveBeenCalled();
  expect(caller.screen.save).not.toHaveBeenCalled();
  expect(caller.screen.openSettings).not.toHaveBeenCalled();
  expect(caller.screen.undo).not.toHaveBeenCalled();
  expect(caller.menu.show).not.toHaveBeenCalled();
  caller.screen.disabled = false;
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  await act(async () => button('Eraser').click());
  expect(caller.screen.toggleBrush).toHaveBeenCalledOnce();
});

function expanded(label) {
  return records.props.findLast((props) => props.accessibilityLabel === label).accessibilityState
    .expanded;
}

function paintGroup() {
  return host.querySelector('[role="radiogroup"][aria-label="Paint colors"]');
}

function paintLabels() {
  return [...paintGroup().querySelectorAll('[role="radio"]')].map((node) =>
    node.getAttribute('aria-label')
  );
}

it('selects paint through text-free round swatches and keeps More colors outside the group', async () => {
  await mountToolbar(toolbarScreen());
  const swatches = [...paintGroup().querySelectorAll('[role="radio"]')];
  expect(swatches.every((node) => node.textContent === '')).toBe(true);
  const checked = () =>
    swatches
      .filter((node) => node.dataset.checked === 'true')
      .map((node) => node.getAttribute('aria-label'));
  expect(checked()).toEqual(['Purple paint']);
  const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
  await act(async () => button('Blue paint').click());
  expect(caller.screen.selectInkBrush).toHaveBeenCalledOnce();
  expect(setColor).toHaveBeenCalledExactlyOnceWith('Blue');
  expect(checked()).toEqual(['Blue paint']);
  const more = button('More colors');
  expect(more.closest('[role="radiogroup"]')).toBeNull();
  expect(iconMarkup(more)).toBe(NATIVE_ICONS['more-colors'].light);
  await act(async () => more.click());
  expect(caller.screen.openColorPicker).toHaveBeenCalledOnce();
});

it('fits one bar of colors plus More colors to the edge it runs along', async () => {
  await mountToolbar(toolbarScreen());
  const portrait = ['Purple', 'Blue', 'Green', 'Yellow', 'Black'].map((label) => `${label} paint`);
  expect(paintLabels()).toEqual(portrait);
  expect(paintGroup().nextElementSibling).toBe(button('More colors'));
  const bar = host.querySelector('[data-testid="rsd-palette-bar"]');
  expect(bar.querySelectorAll('button')).toHaveLength(portrait.length + 1);
  records.dimensions = { width: 1180, height: 820, scale: 1, fontScale: 1 };
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  expect(paintLabels()).toHaveLength(12);
  expect(paintLabels()).toEqual(expect.arrayContaining(portrait));
  expect(paintLabels()).not.toContain('Grey paint');
});

it('keeps the loaded paint on the bar when the room runs out', () => {
  expect(visiblePaints([], 'Purple', 5)).toEqual(['Purple', 'Blue', 'Green', 'Yellow', 'Black']);
  expect(visiblePaints([], 'Grey', 5)).toEqual(['Purple', 'Blue', 'Yellow', 'Grey', 'Black']);
  const palette = PALETTE_COLORS.map(({ label }) => label);
  expect(visiblePaints(['#123456', '#ABCDEF'], 'Purple', 16)).toEqual([...palette, '#123456']);
  expect(visiblePaints(['#123456', '#ABCDEF'], '#ABCDEF', 16)).toEqual([...palette, '#ABCDEF']);
  expect(visiblePaints(['#123456'], '#123456', 15)).toEqual([
    ...palette.filter((label) => label !== PALETTE_TRIM_ORDER[0]),
    '#123456',
  ]);
  expect(visiblePaints(['#123456'], '#123456', 1)).toEqual(['#123456']);
  expect(visiblePaints([], 'Black', 0)).toEqual([]);
});

it('tucks the remaining tools into a drawer the chevron reveals and hides', async () => {
  await mountToolbar(toolbarScreen());
  const tools = [
    'Brush: Crayon',
    'Coloring pages',
    'Save picture',
    'AI picture',
    'Undo',
    'Drawing tools',
    'Parent Center',
  ];
  const shown = () => tools.filter((label) => host.querySelector(`[aria-label="${label}"]`));
  expect(shown()).toEqual([]);
  expect(button('Clear').closest('[data-testid="rsd-clear-dock"]')).not.toBeNull();
  expect(button('Settings').closest('[data-testid="rsd-settings-dock"]')).not.toBeNull();
  const toggle = button('Expand controls');
  expect(toggle.closest('[data-testid="rsd-drawer-dock"]')).not.toBeNull();
  expect(expanded('Expand controls')).toBe(false);
  expect(iconMarkup(toggle)).toBe(
    NATIVE_ICONS['chevron-right'].light.replaceAll('currentColor', DRAWING_THEME.iconInk)
  );
  await act(async () => toggle.click());
  expect(shown()).toEqual(tools);
  for (const label of tools)
    expect(button(label).closest('[data-testid="rsd-drawer-tool"]'), label).not.toBeNull();
  expect(button('Collapse controls').closest('[data-testid="rsd-drawer-dock"]')).not.toBeNull();
  const collapse = button('Collapse controls');
  expect(expanded('Collapse controls')).toBe(true);
  await act(async () => collapse.click());
  expect(shown()).toEqual([]);
  expect(button('Expand controls')).not.toBeNull();
});

it('outlines a swatch whose paint blends into the bar and rings it in text color', () => {
  expect(swatchEdge('#FFFFFF', 'light')).toEqual({ ring: '#474747', outline: '#474747' });
  expect(swatchEdge('#23232B', 'dark')).toEqual({ ring: '#d3d1dc', outline: '#d3d1dc' });
  expect(swatchEdge('#AB71E1', 'light')).toEqual({ ring: '#AB71E1', outline: null });
});

function layoutElement(seen) {
  return createElement(
    NativeDrawingLayout,
    {
      palette: (layout) => {
        seen.palette = layout;
        return createElement('button', null, 'Colors');
      },
      clear: createElement('button', null, 'Clear'),
      drawerToggle: (axis) => {
        seen.drawer = axis;
        return createElement('button', null, 'Tools');
      },
      drawerTools: [],
      settings: createElement('button', null, 'Settings'),
      status: createElement('output', { 'data-status': true }),
    },
    createElement('div', { 'data-paper': true })
  );
}

it('floats the edge controls over a paper area that fills the rest of the screen in both orientations', async () => {
  const seen = {};
  await mount(layoutElement(seen));
  expect(seen).toEqual({ palette: { axis: 'row', slots: paletteSlots(402) }, drawer: 'column' });
  expect(paletteSlots(402)).toBe(6);
  const area = host.querySelector('[data-testid="rsd-canvas-area"]');
  expect(area.firstElementChild.dataset.paper).toBe('true');
  for (const dock of ['rsd-clear-dock', 'rsd-drawer-dock', 'rsd-settings-dock']) {
    expect(area.querySelector(`[data-testid="${dock}"]`), dock).not.toBeNull();
    expect(records.props.findLast((props) => props.testID === dock).style.position).toBe(
      'absolute'
    );
  }
  expect(host.querySelector('[data-testid="rsd-palette-bar"] [data-paper]')).toBeNull();
  expect(area.querySelector('[data-status]')).toBeNull();
  expect(records.props.findLast((props) => props.testID === 'rsd-canvas-area').style.flex).toBe(1);
  const bar = () => records.props.findLast((props) => props.testID === 'rsd-palette-bar');
  await act(async () => bar().onLayout({ nativeEvent: { layout: { width: 300, height: 68 } } }));
  expect(seen.palette).toEqual({ axis: 'row', slots: 4 });
  records.dimensions = { width: 874, height: 402, scale: 1, fontScale: 2 };
  await act(async () => root.render(layoutElement(seen)));
  expect(seen).toEqual({ palette: { axis: 'column', slots: 6 }, drawer: 'row' });
  await act(async () => bar().onLayout({ nativeEvent: { layout: { width: 68, height: 380 } } }));
  expect(seen.palette).toEqual({ axis: 'column', slots: 6 });
  await act(async () => bar().onLayout({ nativeEvent: { layout: { width: 68, height: 260 } } }));
  expect(seen.palette).toEqual({ axis: 'column', slots: 4 });
});

it('frames the paper the way the full-bleed area fits it in either orientation', () => {
  const blank = { kind: 'unadopted' };
  const portrait = { kind: 'adopted', cssWidth: 390, cssHeight: 704, backingScale: 2 };
  expect(fittedPaper({ width: 390, height: 704 }, blank)).toEqual({
    left: 0,
    top: 0,
    width: 390,
    height: 704,
  });
  expect(fittedPaper({ width: 2000, height: 1500 }, blank)).toMatchObject({
    width: 2000,
    height: 1500,
  });
  expect(fittedPaper({ width: 390, height: 704 }, portrait)).toEqual({
    left: 0,
    top: 0,
    width: 390,
    height: 704,
  });
  expect(fittedPaper({ width: 1100, height: 352 }, portrait)).toEqual({
    left: 452.5,
    top: 0,
    width: 195,
    height: 352,
  });
  expect(fittedPaper({ width: 390, height: 704 }, { kind: 'legacy' })).toEqual({
    left: 0,
    top: 205.75,
    width: 390,
    height: 292.5,
  });
  expect(fittedPaper({ width: 0, height: 0 }, portrait)).toEqual({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
});

function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

function resolved(predicate) {
  const props = records.props.findLast(predicate);
  expect(props).toBeDefined();
  return flat(props.style);
}

function outerSize(style) {
  expect(style.width).toBe(style.height);
  return style.boxSizing === 'border-box'
    ? style.width
    : style.width + 2 * (style.borderWidth ?? 0) + 2 * (style.padding ?? 0);
}

it('counts palette slots from the outer size the renderer actually gives each swatch', async () => {
  await mountToolbar(toolbarScreen());
  const outer = [
    outerSize(resolved((props) => props.accessibilityLabel === 'Purple paint')),
    outerSize(resolved((props) => props.accessibilityLabel === 'More colors')),
  ];
  expect(outer).toEqual([TOUCH_TARGET, TOUCH_TARGET]);
  const { gap } = resolved((props) => props.accessibilityLabel === 'Paint colors');
  const bar = resolved(
    (props) => flat(props.style)?.flexGrow === 1 && flat(props.style).padding !== undefined
  );
  expect(bar.gap).toBe(gap);
  const span = (count) => count * outer[0] + (count - 1) * gap + 2 * bar.padding;
  for (const length of [320, 390, 402, 568, 820, 1180]) {
    const slots = paletteSlots(length);
    expect(span(slots), `${length}`).toBeLessThanOrEqual(length);
    expect(span(slots + 1), `${length}`).toBeGreaterThan(length);
  }
});

function rect(left, top) {
  return { left, top, right: left + TOUCH_TARGET, bottom: top + TOUCH_TARGET };
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

it.each([
  [320, 568],
  [568, 320],
])('keeps every drawer tool and the chevron reachable at %ix%i', async (width, height) => {
  records.dimensions = { width, height, scale: 1, fontScale: 1 };
  await mountToolbar(toolbarScreen());
  const portrait = height > width;
  const status = flat(
    records.viewports.findLast((props) => props.testID === 'rsd-drawing-status-viewport').style
  );
  const bar = TOUCH_TARGET + 2 * EDGE_INSET_PX;
  const area = {
    width: portrait ? width : width - bar,
    height: (portrait ? height - bar : height) - status.height,
  };
  const canvas = records.props.findLast((props) => props.testID === 'rsd-canvas-area');
  await act(async () => canvas.onLayout({ nativeEvent: { layout: { x: 0, y: 0, ...area } } }));
  await expandControls();
  const tools = records.props
    .filter((props) => props.testID === 'rsd-drawer-tool')
    .slice(-7)
    .map((props) => flat(props.style))
    .map((style) => rect(style.left, area.height - style.bottom - TOUCH_TARGET));
  expect(host.querySelectorAll('[data-testid="rsd-drawer-tool"]')).toHaveLength(7);
  const inset = EDGE_INSET_PX;
  const toggle = rect(inset, area.height - inset - TOUCH_TARGET);
  const settings = rect(area.width - inset - TOUCH_TARGET, area.height - inset - TOUCH_TARGET);
  const clear = rect(area.width - inset - TOUCH_TARGET, inset);
  expect(resolved((props) => props.testID === 'rsd-drawer-dock')).toMatchObject({
    left: inset,
    bottom: inset,
  });
  expect(resolved((props) => props.testID === 'rsd-settings-dock')).toMatchObject({
    right: inset,
    bottom: inset,
  });
  expect(resolved((props) => props.testID === 'rsd-clear-dock')).toMatchObject({
    right: inset,
    top: inset,
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
  expect(drawerOffsets(area, portrait ? 'column' : 'row', 7)).toEqual(
    records.props
      .filter((props) => props.testID === 'rsd-drawer-tool')
      .slice(-7)
      .map((props) => ({ left: flat(props.style).left, bottom: flat(props.style).bottom }))
  );
});
