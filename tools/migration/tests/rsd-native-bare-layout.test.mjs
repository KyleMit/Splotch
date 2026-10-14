import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { NativeDrawingLayout } from '../../../experiments/native-architecture/src/rsdDrawing/NativeScrollAreas.tsx';
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

// Shipping keeps the palette bar in the flow in both Button styles: the flat bar loses its face,
// not its strip, so a style switch never resizes the paper under a drawing and a sheet adopted in
// one style shows unlifted in the other. The flat glass panes keep shipping's viewport coordinates.
it.each([
  ['portrait', { width: 402, height: 874 }, 'top'],
  ['landscape', { width: 1180, height: 820 }, 'left'],
])(
  'keeps the %s flat bar in the flow, so the paper area matches the raised one',
  async (_, dimensions, edge) => {
    records.dimensions = { ...dimensions, scale: 1, fontScale: 1 };
    const area = { width: 1000, height: 700 };
    const box = (width, height) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    const measureArea = () =>
      act(async () =>
        records.props
          .findLast((found) => found.testID === 'rsd-canvas-area')
          .onLayout(box(area.width, area.height))
      );
    const raised = {};
    await mount(layoutElement(raised, null));
    await measureArea();
    await act(async () => root.render(layoutElement(raised, null)));
    expect(rail()).toBeNull();
    const raisedLayout = {
      bar: props('rsd-palette-bar'),
      controls: props('rsd-controls-inset'),
    };
    const seen = {};
    await act(async () => root.render(layoutElement(seen, RESTING_GLASS)));
    const bar = host.querySelector('[data-testid="rsd-palette-bar"]');
    expect(bar.contains(rail())).toBe(true);
    expect(props('rsd-palette-bar').position).not.toBe('absolute');
    expect(props('rsd-palette-bar')).toEqual(raisedLayout.bar);
    expect(props('rsd-controls-inset')).toEqual(raisedLayout.controls);
    expect(props('rsd-controls-inset')[edge]).toBe(0);
    expect(seen.area).toEqual(raised.area);
    expect(seen.area).toEqual(area);
    // The paper follows the bar in the layout's flow, inside the area the bar leaves.
    const layout = host.querySelector('[data-testid="rsd-drawing-layout"]');
    const order = [...layout.children].map((node) => node.dataset.testid);
    expect(order.indexOf('rsd-palette-bar')).toBeLessThan(order.indexOf('rsd-canvas-column'));
    expect(
      host.querySelector('[data-testid="rsd-canvas-area"] [data-paper]'),
      'paper in the area'
    ).not.toBeNull();
  }
);

it('hands the landscape phone its whole paper, with no rail to print', async () => {
  records.dimensions = { width: 874, height: 402, scale: 1, fontScale: 1 };
  await mount(layoutElement({}, RESTING_GLASS));
  expect(host.querySelector('[data-testid="rsd-palette-bar"]')).toBeNull();
  expect(rail()).toBeNull();
  expect(props('rsd-controls-inset')).toMatchObject({ top: 0, left: 0 });
});
