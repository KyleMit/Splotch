import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { NativeDrawingLayout } from '../../../experiments/native-architecture/src/rsdDrawing/NativeScrollAreas.tsx';
import { PALETTE_FLOWS } from '../../../experiments/native-architecture/src/rsdDrawing/paletteGeometry.ts';
import { flat } from './rsd-native-toolbar-fixture.mjs';

const RESTING_GLASS = { open: null, expanded: false, panel: null };

function layoutElement(seen, bareGlass) {
  return createElement(
    NativeDrawingLayout,
    {
      bareGlass,
      palette: () => createElement('button', null, 'Colors'),
      clearUnderlay: () => createElement('div', { 'data-clear-underlay': true }),
      clearOverlay: createElement('button', null, 'Clear drawing'),
      actionsPanel: (area) => {
        seen.area = area;
        return createElement('button', null, 'Tools');
      },
      capturePress: () => false,
      settings: createElement('button', null, 'Settings'),
      status: createElement('output', { 'data-status': true }),
      overlays: createElement('div', { 'data-overlay': true }),
    },
    createElement('div', { 'data-paper': true })
  );
}

const props = (testID) => flat(records.props.findLast((found) => found.testID === testID).style);
const rail = () => host.querySelector('[data-testid="rsd-rail-glass"]');

it.each([
  ['portrait', { width: 402, height: 874 }, 'row', 'top'],
  ['landscape', { width: 1180, height: 820 }, 'column', 'left'],
])(
  'prints the %s flat bar over the paper and keeps the controls where the raised bar leaves them',
  async (_, dimensions, axis, edge) => {
    records.dimensions = { ...dimensions, scale: 1, fontScale: 1 };
    const raised = {};
    await mount(layoutElement(raised, null));
    // Negative control: the raised bar takes its strip in the flow, and no glass prints.
    expect(props('rsd-palette-bar').position).not.toBe('absolute');
    expect(rail()).toBeNull();
    const extent = PALETTE_FLOWS[axis].extentPx;
    const area = { width: 1000, height: 700 };
    const box = (width, height) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    await act(async () =>
      records.props
        .findLast((found) => found.testID === 'rsd-canvas-area')
        .onLayout(box(area.width, area.height))
    );
    const seen = {};
    await act(async () => root.render(layoutElement(seen, RESTING_GLASS)));
    expect(props('rsd-palette-bar').position).toBe('absolute');
    expect(props('rsd-controls-inset')[edge]).toBe(extent);
    expect(seen.area).toEqual(
      axis === 'row'
        ? { width: area.width, height: area.height - extent }
        : { width: area.width - extent, height: area.height }
    );
    const bar = host.querySelector('[data-testid="rsd-palette-bar"]');
    expect(bar.contains(rail())).toBe(true);
  }
);

it('hands the landscape phone its whole paper, with no rail to print', async () => {
  records.dimensions = { width: 874, height: 402, scale: 1, fontScale: 1 };
  await mount(layoutElement({}, RESTING_GLASS));
  expect(host.querySelector('[data-testid="rsd-palette-bar"]')).toBeNull();
  expect(rail()).toBeNull();
  expect(props('rsd-controls-inset')).toMatchObject({ top: 0, left: 0 });
});
