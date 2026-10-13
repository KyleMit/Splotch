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
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { adoptedDrawing } from '../../tests/native-paper-fixtures.mjs';
import { EDGE_INSET_PX } from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import { ACTION_TILE_DISABLED_OPACITY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { NativeDrawingLayout } from '../../../experiments/native-architecture/src/rsdDrawing/NativeScrollAreas.tsx';
import { fittedPaper } from '../../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import { paletteSlots } from '../../../experiments/native-architecture/src/rsdDrawing/paletteGeometry.ts';
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
import {
  flat,
  mountToolbar,
  paintGroup,
  paintLabels,
  resolved,
  toolbarScreen,
} from './rsd-native-toolbar-fixture.mjs';

// A page with one stroke on it, so the screenshot camera has something to keep.
function inked() {
  return {
    ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }),
    strokes: [{ brush: 'pen', width: 8, color: 'Purple', points: [{ x: 1, y: 1 }] }],
  };
}

const PURPLE = paletteHex('Purple');

function button(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

// A finger only drags Clear; the assistive activation is its one non-drag path.
function clearProps() {
  return records.props.findLast((props) => props.accessibilityLabel === 'Clear drawing');
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
  await mountToolbar(toolbarScreen({ history: { undo: [emptyDrawing()], drawing: inked() } }));
  await expandControls();
  const openAi = vi.spyOn(caller.product.ai.owner, 'open').mockImplementation(() => {});
  const actions = [
    ['Coloring books', 'shapes', () => caller.screen.setPagePickerOpen],
    ['Save screenshot', 'camera', () => caller.screen.save],
    ['AI picture', 'wand-stars', () => openAi],
    ['Undo', 'undo', () => caller.screen.undo],
    ['Clear drawing', 'trash-closed', () => caller.screen.clear],
    ['Settings', 'settings', () => caller.screen.openSettings],
  ];
  for (const [label, icon, handler] of actions) {
    const node = button(label);
    expect(node.textContent, label).toBe('');
    expect(iconMarkup(node), label).toBe(
      NATIVE_ICONS[icon].light.replaceAll('currentColor', DRAWING_THEME.iconInk)
    );
    const before = handler().mock.calls.length;
    await act(async () => (label === 'Clear drawing' ? activateClear() : node.click()));
    expect(handler().mock.calls.length, label).toBe(before + 1);
  }
  expect(caller.screen.setPagePickerOpen).toHaveBeenCalledWith(true);
  const brushes = button('Brushes');
  expect(iconMarkup(brushes)).toBe(
    NATIVE_ICONS['brush-crayon'].light.replaceAll('currentColor', PURPLE)
  );
  expect(NATIVE_ICONS['brush-crayon'].light).toContain('currentColor');
  expect(NATIVE_ICONS.settings.light).toContain('currentColor');
});

it('keeps the toolbar disabled boundary and the lone optional brush switch', async () => {
  await mountToolbar(
    toolbarScreen({
      disabled: true,
      brush: 'pen',
      brushControl: { kind: 'toggle', brush: 'eraser' },
      history: { undo: [emptyDrawing()], drawing: inked() },
    })
  );
  await expandControls();
  const eraser = button('Eraser');
  expect(eraser.getAttribute('role')).toBe('switch');
  expect(eraser.dataset.checked).toBe('false');
  expect(iconMarkup(eraser)).toBe(NATIVE_ICONS['brush-eraser'].light);
  expect(button('Clear drawing')).not.toBeNull();
  expect(clearProps().accessibilityState.disabled).toBe(true);
  await act(async () => activateClear());
  for (const label of ['Eraser', 'Save screenshot', 'Undo', 'Stroke width', 'Coloring books']) {
    const node = button(label);
    expect(node.disabled, label).toBe(true);
    await act(async () => node.click());
  }
  // Shipping's corner Settings Button has no disabled look; a blocked screen ignores its press.
  await act(async () => button('Settings').click());
  expect(caller.screen.toggleBrush).not.toHaveBeenCalled();
  expect(caller.screen.clear).not.toHaveBeenCalled();
  expect(caller.screen.save).not.toHaveBeenCalled();
  expect(caller.screen.openSettings).not.toHaveBeenCalled();
  expect(caller.screen.undo).not.toHaveBeenCalled();
  expect(caller.screen.setPagePickerOpen).not.toHaveBeenCalled();
  caller.screen.disabled = false;
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  await act(async () => button('Eraser').click());
  expect(caller.screen.toggleBrush).toHaveBeenCalledOnce();
});

function expanded(label) {
  return records.props.findLast((props) => props.accessibilityLabel === label).accessibilityState
    .expanded;
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
  expect(paintLabels()).toHaveLength(paletteSlots(820, 'column') - 1);
  expect(paintLabels()).toEqual(expect.arrayContaining(portrait));
  for (const trimmed of PALETTE_TRIM_ORDER.slice(0, 5))
    expect(paintLabels()).not.toContain(`${trimmed} paint`);
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

it('tucks the shipping tools, in order, into a drawer the chevron after them reveals and hides', async () => {
  await mountToolbar(toolbarScreen());
  const tools = [
    'Brushes',
    'Stroke width',
    'Coloring books',
    'Save screenshot',
    'AI picture',
    'Undo',
  ];
  const shown = () =>
    [...host.querySelectorAll('[data-testid="rsd-drawer-tool"] [aria-label]')]
      .map((node) => node.getAttribute('aria-label'))
      .filter((label) => tools.includes(label));
  expect(shown()).toEqual([]);
  expect(button('Clear drawing').closest('[data-testid="rsd-clear-dock"]')).not.toBeNull();
  expect(button('Settings').closest('[data-testid="rsd-settings-dock"]')).not.toBeNull();
  const toggle = button('Expand controls');
  expect(toggle.closest('[data-testid="rsd-drawer-dock"]')).not.toBeNull();
  expect(expanded('Expand controls')).toBe(false);
  // The shipping chevron is the muted corner glyph, not a raised tile.
  expect(iconMarkup(toggle)).toBe(
    NATIVE_ICONS['chevron-right'].light.replaceAll('currentColor', DRAWING_THEME.iconInk)
  );
  const chevron = resolved((props) => props.accessibilityLabel === 'Expand controls');
  expect(chevron).toMatchObject({ backgroundColor: 'transparent', borderWidth: 0 });
  expect(chevron.boxShadow).toBeUndefined();
  await act(async () => toggle.click());
  expect(shown()).toEqual(tools);
  // Every RN-only drawer control is gone: tools sheet, Parent Center and the gallery.
  for (const removed of ['Drawing tools', 'Parent Center', 'Pictures', 'Export PNG'])
    expect(host.querySelector(`[aria-label="${removed}"]`), removed).toBeNull();
  // The chevron follows the last tool up the portrait column.
  const lastTool = flat(
    records.props.filter((props) => props.testID === 'rsd-drawer-tool').at(-1).style
  );
  const dock = resolved((props) => props.testID === 'rsd-drawer-dock');
  expect(dock.bottom).toBeGreaterThan(lastTool.bottom);
  const collapse = button('Collapse controls');
  expect(collapse.closest('[data-testid="rsd-drawer-dock"]')).not.toBeNull();
  expect(expanded('Collapse controls')).toBe(true);
  await act(async () => collapse.click());
  expect(shown()).toEqual([]);
  expect(button('Expand controls')).not.toBeNull();
  expect(resolved((props) => props.testID === 'rsd-drawer-dock').bottom).toBe(EDGE_INSET_PX);
});

it('fades Undo and the screenshot camera on a page with no visible ink and wakes them once it has some', async () => {
  await mountToolbar(
    toolbarScreen({ history: { undo: [], drawing: emptyDrawing() }, inkVisible: false })
  );
  await expandControls();
  for (const label of ['Save screenshot', 'Undo']) {
    expect(button(label).disabled, label).toBe(true);
    expect(resolved((props) => props.accessibilityLabel === label).opacity, label).toBe(
      ACTION_TILE_DISABLED_OPACITY
    );
  }
  expect(button('Coloring books').disabled).toBe(false);
  caller.screen.history = { undo: [emptyDrawing()], drawing: inked() };
  caller.screen.inkVisible = true;
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  for (const label of ['Save screenshot', 'Undo']) {
    expect(button(label).disabled, label).toBe(false);
    expect(resolved((props) => props.accessibilityLabel === label).opacity, label).not.toBe(
      ACTION_TILE_DISABLED_OPACITY
    );
  }
});

function layoutElement(seen) {
  return createElement(
    NativeDrawingLayout,
    {
      controlSize: TOUCH_TARGET,
      palette: (layout) => {
        seen.palette = layout;
        return createElement('button', null, 'Colors');
      },
      clearUnderlay: (offset) => {
        seen.clearOffset = offset;
        return createElement('div', { 'data-clear-underlay': true });
      },
      clearOverlay: createElement('button', null, 'Clear drawing'),
      actionsPanel: (area, viewport) => {
        seen.panel = { area, viewport: { width: viewport.width, height: viewport.height } };
        return createElement('button', null, 'Tools');
      },
      capturePress: () => false,
      settings: createElement('button', null, 'Settings'),
      status: createElement('output', { 'data-status': true }),
    },
    createElement('div', { 'data-paper': true })
  );
}

it('floats the edge controls over a paper area that fills the rest of the screen in both orientations', async () => {
  const seen = {};
  await mount(layoutElement(seen));
  expect(seen).toEqual({
    palette: { axis: 'row', slots: paletteSlots(402, 'row'), length: 402 },
    clearOffset: { top: 0, right: 0 },
    panel: {
      area: expect.objectContaining({ width: 402, height: 874 }),
      viewport: { width: 402, height: 874 },
    },
  });
  expect(paletteSlots(402, 'row')).toBe(6);
  const area = host.querySelector('[data-testid="rsd-canvas-area"]');
  expect(area.firstElementChild.dataset.paper).toBe('true');
  expect(area.children[1].dataset.clearUnderlay).toBe('true');
  for (const dock of ['rsd-settings-dock']) {
    expect(area.querySelector(`[data-testid="${dock}"]`), dock).not.toBeNull();
    expect(records.props.findLast((props) => props.testID === dock).style.position).toBe(
      'absolute'
    );
  }
  // Clear docks to the screen, not the paper: its overlay spans the whole layout, after the
  // paper column, and the palette stacks above it as the shipping --z-palette does.
  const layout = host.querySelector('[data-testid="rsd-drawing-layout"]');
  const overlay = host.querySelector('[data-testid="rsd-clear-overlay"]');
  expect(overlay.parentElement).toBe(layout);
  expect(layout.lastElementChild).toBe(overlay);
  expect(area.contains(overlay)).toBe(false);
  expect(overlay.textContent).toBe('Clear drawing');
  const props = (testID) => records.props.findLast((candidate) => candidate.testID === testID);
  expect(props('rsd-clear-overlay').style).toMatchObject({ position: 'absolute', top: 0, left: 0 });
  expect(props('rsd-clear-overlay').pointerEvents).toBe('box-none');
  expect(flat(props('rsd-palette-bar').style).zIndex).toBeGreaterThan(0);
  const box = (x, y, width, height) => ({ nativeEvent: { layout: { x, y, width, height } } });
  await act(async () => {
    props('rsd-drawing-layout').onLayout(box(0, 0, 402, 874));
    props('rsd-canvas-column').onLayout(box(0, 68, 402, 806));
    props('rsd-canvas-area').onLayout(box(0, 0, 400, 760));
  });
  expect(seen.clearOffset).toEqual({ top: 68, right: 2 });
  // The panel sizes itself against the measured paper area and the whole window.
  expect(seen.panel).toEqual({
    area: { x: 0, y: 0, width: 400, height: 760 },
    viewport: { width: 402, height: 874 },
  });
  expect(host.querySelector('[data-testid="rsd-palette-bar"] [data-paper]')).toBeNull();
  // The status lies over the paper rather than claiming a strip of the screen.
  expect(area.querySelector('[data-status]')).not.toBeNull();
  expect(records.props.findLast((props) => props.testID === 'rsd-canvas-area').style.flex).toBe(1);
  const bar = () => records.props.findLast((props) => props.testID === 'rsd-palette-bar');
  // An inset shortens the bar, not the viewport the shipping ladder counts from.
  await act(async () => bar().onLayout({ nativeEvent: { layout: { width: 300, height: 75 } } }));
  expect(seen.palette).toEqual({ axis: 'row', slots: 6, length: 300 });
  records.dimensions = { width: 1180, height: 820, scale: 1, fontScale: 2 };
  await act(async () => root.render(layoutElement(seen)));
  expect(seen).toMatchObject({
    palette: { axis: 'column', slots: paletteSlots(820, 'column'), length: 820 },
    clearOffset: { top: 68, right: 2 },
    panel: { viewport: { width: 1180, height: 820 } },
  });
  await act(async () => bar().onLayout({ nativeEvent: { layout: { width: 84, height: 780 } } }));
  expect(seen.palette).toEqual({ axis: 'column', slots: 11, length: 780 });
  await act(async () => bar().onLayout({ nativeEvent: { layout: { width: 84, height: 660 } } }));
  expect(seen.palette).toEqual({ axis: 'column', slots: 11, length: 660 });
  // A landscape phone hands the bar's strip back to the paper, as shipping's palette does.
  records.dimensions = { width: 874, height: 402, scale: 1, fontScale: 2 };
  seen.palette = null;
  await act(async () => root.render(layoutElement(seen)));
  expect(host.querySelector('[data-testid="rsd-palette-bar"]')).toBeNull();
  expect(seen.palette).toBeNull();
  expect(seen.panel.viewport).toEqual({ width: 874, height: 402 });
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
